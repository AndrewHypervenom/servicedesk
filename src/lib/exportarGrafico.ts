import jsPDF from 'jspdf';

/**
 * Exportación de gráficos a PNG y PDF.
 *
 * Se serializa el SVG que ya pinta Recharts en vez de usar html2canvas: evita
 * una dependencia más, sale vectorial (así que el rasterizado a 2x es nítido de
 * verdad, no interpolado) y no depende de que el nodo esté visible en pantalla.
 */

const ESCALA = 2; // para que la imagen aguante una proyección o una diapositiva

/** Serializa un <svg> del DOM a un data URL, con los estilos ya resueltos. */
function svgADataUrl(svg: SVGSVGElement, fondo: string): { url: string; w: number; h: number } {
  const caja = svg.getBoundingClientRect();
  const w = Math.ceil(caja.width);
  const h = Math.ceil(caja.height);

  const copia = svg.cloneNode(true) as SVGSVGElement;
  copia.setAttribute('width', String(w));
  copia.setAttribute('height', String(h));
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // `currentColor` no sobrevive fuera del documento: sin un color heredado al
  // que resolverse, los ejes y las etiquetas saldrían negros sobre fondo oscuro.
  // Se fija el color heredado del elemento original antes de serializar.
  const heredado = getComputedStyle(svg).color;
  copia.style.color = heredado;

  // Fondo explícito: un SVG sin fondo se rasteriza transparente y en una
  // presentación con fondo blanco el texto claro del modo oscuro desaparece.
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  rect.setAttribute('fill', fondo);
  copia.insertBefore(rect, copia.firstChild);

  const xml = new XMLSerializer().serializeToString(copia);
  return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`, w, h };
}

/** Rasteriza un SVG del DOM a un canvas a escala 2x. */
async function svgACanvas(svg: SVGSVGElement, fondo: string): Promise<HTMLCanvasElement> {
  const { url, w, h } = svgADataUrl(svg, fondo);

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('No se pudo rasterizar el gráfico'));
    img.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = w * ESCALA;
  canvas.height = h * ESCALA;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function svgDe(contenedor: HTMLElement): SVGSVGElement {
  const svg = contenedor.querySelector('svg');
  if (!svg) throw new Error('El contenedor no tiene ningún gráfico que exportar');
  return svg as SVGSVGElement;
}

function descargar(url: string, nombre: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
}

/** Descarga un gráfico como PNG. */
export async function exportarPng(contenedor: HTMLElement, nombre: string, fondo: string) {
  const canvas = await svgACanvas(svgDe(contenedor), fondo);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('No se pudo generar el PNG');
  const url = URL.createObjectURL(blob);
  descargar(url, `${nombre}.png`);
  // Sin revoke se filtra el blob mientras viva la pestaña. El timeout da margen
  // a que el navegador arranque la descarga antes de invalidar la URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copia un gráfico al portapapeles como imagen, para pegar directo en una diapositiva. */
export async function copiarPng(contenedor: HTMLElement, fondo: string) {
  const canvas = await svgACanvas(svgDe(contenedor), fondo);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('No se pudo generar la imagen');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export interface BloquePdf {
  titulo: string;
  contenedor: HTMLElement;
}

/**
 * Compone un PDF apaisado con todos los gráficos, uno por página, con portada.
 * Apaisado porque los gráficos son anchos: en vertical habría que encogerlos
 * tanto que las etiquetas de los ejes dejarían de leerse al proyectar.
 */
export async function exportarPdf(
  bloques: BloquePdf[],
  meta: { titulo: string; subtitulo: string; fondo: string },
) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const anchoPag = pdf.internal.pageSize.getWidth();
  const altoPag = pdf.internal.pageSize.getHeight();
  const margen = 14;

  pdf.setFontSize(24);
  pdf.text(meta.titulo, margen, 40);
  pdf.setFontSize(12);
  pdf.setTextColor(120);
  pdf.text(meta.subtitulo, margen, 50);
  pdf.text(new Date().toLocaleString('es-CO'), margen, 58);

  for (const b of bloques) {
    const canvas = await svgACanvas(svgDe(b.contenedor), meta.fondo);
    pdf.addPage();

    pdf.setFontSize(14);
    pdf.setTextColor(30);
    pdf.text(b.titulo, margen, margen + 6);

    // Encaja la imagen dentro del área útil conservando su proporción; si se
    // estirara al ancho de página, los gráficos altos se saldrían por abajo.
    const dispW = anchoPag - margen * 2;
    const dispH = altoPag - margen * 2 - 12;
    const escala = Math.min(dispW / canvas.width, dispH / canvas.height);
    const w = canvas.width * escala;
    const h = canvas.height * escala;

    // Con compresión Flate: sin el último argumento jsPDF incrusta el PNG sin
    // comprimir y un informe de seis gráficos se va a ~16 MB, que no pasa por
    // el correo. Los gráficos son de colores planos, así que comprimen mucho.
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margen, margen + 12, w, h, undefined, 'FAST');
  }

  pdf.save(`${meta.titulo.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}

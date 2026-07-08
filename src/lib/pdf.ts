import { jsPDF } from 'jspdf';
import autoTableImport from 'jspdf-autotable';
import { equipoQrDataUrl } from './qr';
import { EMPRESA, NIT_EMPRESA, CODIGO_DOC, VERSION_DOC, plantillaActa } from './actaTemplates';
import { LOGO_POSITIVO } from './actaLogo';
import type { Equipo, Colaborador, TipoActa } from '@/types';

const autoTable: typeof autoTableImport = (autoTableImport as any).default ?? autoTableImport;

export interface ActaItem {
  equipo: Equipo;
  observaciones?: string;
}

export interface ActaParams {
  tipo: TipoActa;
  consecutivo: string;
  items: ActaItem[];
  colaborador?: Colaborador | null;
  firmaDataUrl?: string | null;
  tecnico?: string;
  tecnicoCedula?: string;
  firmaTecnicoDataUrl?: string | null;
  fecha?: string;
  novedades?: string;
}

function equipoUrl(id: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `${base}/equipo/${id}`;
}

function nombreElemento(eq: Equipo): string {
  const marca = (eq.marca || '').trim();
  const modelo = (eq.linea_modelo || '').trim();
  const modeloTraeMarca = marca && modelo.toUpperCase().startsWith(marca.toUpperCase());
  const base = [eq.tipo, marca, modeloTraeMarca ? modelo.slice(marca.length).trim() : modelo]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return eq.ficha_tecnica ? `${base} — ${eq.ficha_tecnica}` : base;
}

function dibujarFirma(doc: jsPDF, img: string, cell: { x: number; y: number; width: number; height: number }) {
  try {
    const prop = (doc as any).getImageProperties?.(img);
    const ratio = prop && prop.width && prop.height ? prop.width / prop.height : 2.6;
    const maxW = cell.width - 8, maxH = cell.height - 8;
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    doc.addImage(img, 'PNG', cell.x + (cell.width - w) / 2, cell.y + (cell.height - h) / 2, w, h);
  } catch { /* noop */ }
}

const M = 40;
const INK = [30, 30, 30] as const;
const HEAD_FILL = [226, 232, 240] as const;
const HEADER_H = 84;
const BODY_LH = 13.5;
const F_BODY = 'helvetica';
const F_CTRL = 'times';

function stampHeader(doc: jsPDF, titulo: string, fechaHeader: string) {
  const W = doc.internal.pageSize.getWidth();
  const tX = M, tY = 18, tW = W - 2 * M;
  const leftW = 205, rightW = tW - leftW, rowH = 25, cellH = rowH * 2;
  const cW = rightW / 3;

  doc.setDrawColor(...INK); doc.setLineWidth(0.7);
  doc.rect(tX, tY, leftW, cellH);
  doc.rect(tX + leftW, tY, cW, rowH);
  doc.rect(tX + leftW + cW, tY, cW, rowH);
  doc.rect(tX + leftW + 2 * cW, tY, cW, rowH);
  doc.rect(tX + leftW, tY + rowH, rightW, rowH);

  doc.setTextColor(...INK);
  doc.setFont(F_CTRL, 'bold'); doc.setFontSize(7.5);
  doc.text(EMPRESA, tX + leftW / 2, tY + 9, { align: 'center', baseline: 'middle' } as any);
  const logoW = 130, logoH = logoW / 6.4;
  try { doc.addImage(LOGO_POSITIVO, 'JPEG', tX + (leftW - logoW) / 2, tY + 16, logoW, logoH); } catch { /* noop */ }

  doc.setFont(F_CTRL, 'normal'); doc.setFontSize(8.5);
  doc.text(`Código: ${CODIGO_DOC}`, tX + leftW + 5, tY + rowH / 2, { baseline: 'middle' } as any);
  doc.text(`Versión: ${VERSION_DOC}`, tX + leftW + cW + 5, tY + rowH / 2, { baseline: 'middle' } as any);
  doc.text(`Fecha: ${fechaHeader}`, tX + leftW + 2 * cW + 5, tY + rowH / 2, { baseline: 'middle' } as any);
  doc.setFont(F_CTRL, 'bold'); doc.setFontSize(9);
  doc.text(titulo, tX + leftW + rightW / 2, tY + rowH + rowH / 2, { align: 'center', baseline: 'middle' } as any);
}

export async function generarActaPdf(p: ActaParams): Promise<Blob> {
  const tpl = plantillaActa(p.tipo);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const fecha = p.fecha ?? new Date().toISOString().slice(0, 10);
  const fechaHeader = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const items = p.items.length ? p.items : [];
  const TABLE_MARGIN = { left: M, right: M, top: HEADER_H } as const;

  const ensureSpace = (y: number, needed: number): number => {
    if (y + needed > H - 46) { doc.addPage(); return HEADER_H; }
    return y;
  };

  let y = HEADER_H;

  const qrByRow = await Promise.all(
    items.map((it) => equipoQrDataUrl(it.equipo.codigo_qr, 120).catch(() => null)),
  );

  doc.setTextColor(...INK);
  doc.setFont(F_BODY, 'bold'); doc.setFontSize(12);
  doc.text('Positivos +', M, y + 4);
  y += 20;

  doc.setTextColor(...INK);
  doc.setFont(F_BODY, 'normal'); doc.setFontSize(12);
  doc.text('ASUNTO: ', M, y + 4);
  doc.setFont(F_BODY, 'bold');
  doc.text(tpl.asunto, M + doc.getTextWidth('ASUNTO: ') + 2, y + 4);
  y += 22;

  doc.setFont(F_BODY, 'normal'); doc.setFontSize(12); doc.setTextColor(40);
  doc.setLineHeightFactor(BODY_LH / 12);
  const introWidth = W - M * 2;
  for (const par of tpl.intro) {
    const lines = doc.splitTextToSize(par, introWidth);
    y = ensureSpace(y, lines.length * BODY_LH);
    doc.text(lines, M, y, { align: 'justify', maxWidth: introWidth } as any);
    y += lines.length * BODY_LH + 6;
  }
  doc.setLineHeightFactor(1.15);
  y += 4;

  const c = p.colaborador;
  const fechaLegible = fecha.split('-').reverse().join('/');
  autoTable(doc, {
    startY: y,
    margin: TABLE_MARGIN,
    theme: 'grid',
    styles: { font: F_BODY, fontSize: 11, cellPadding: 4, lineColor: INK as any, lineWidth: 0.7, textColor: INK as any },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 165, fillColor: HEAD_FILL as any } },
    body: [
      [tpl.campos.nombres, c?.nombre ?? ''],
      [tpl.campos.cedula, c?.cedula ?? ''],
      [tpl.campos.correo, c?.correo ?? ''],
      [tpl.campos.cargo, c?.cargo ?? ''],
      [tpl.campos.cr, c?.proyecto ?? items[0]?.equipo.proyecto_asignado ?? ''],
      [tpl.campos.lider, c?.lider ?? ''],
      [tpl.campos.fecha, fechaLegible],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  const filas = items.map(({ equipo: eq, observaciones }) => [
    nombreElemento(eq),
    eq.serial,
    eq.estado_fisico,
    observaciones ?? eq.observaciones ?? '',
    '',
  ]);
  const minFilas = Math.max(0, 3 - filas.length);
  for (let i = 0; i < minFilas; i++) filas.push(['', '', '', '', '']);
  autoTable(doc, {
    startY: y,
    margin: TABLE_MARGIN,
    theme: 'grid',
    styles: { font: F_BODY, fontSize: 11, cellPadding: 4, lineColor: INK as any, lineWidth: 0.7, textColor: INK as any, valign: 'middle' },
    headStyles: { fillColor: HEAD_FILL as any, textColor: INK as any, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    columnStyles: {
      1: { cellWidth: 80, halign: 'center' }, 2: { cellWidth: 74, halign: 'center' },
      3: { cellWidth: 140 }, 4: { cellWidth: 50, minCellHeight: 44, halign: 'center' },
    },
    head: [
      [{ content: 'IMPLEMENTOS', colSpan: 5, styles: { halign: 'center' } }],
      ['ELEMENTO', 'SERIAL', 'ESTADO', 'OBSERVACIONES', 'QR'],
    ],
    body: filas,
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return;
      const qr = qrByRow[data.row.index];
      const eq = items[data.row.index]?.equipo;
      if (!qr || !eq) return;
      const s = Math.min(data.cell.width, data.cell.height) - 6;
      const qx = data.cell.x + (data.cell.width - s) / 2;
      const qy = data.cell.y + (data.cell.height - s) / 2;
      try {
        doc.addImage(qr, 'PNG', qx, qy, s, s);
        doc.link(qx, qy, s, s, { url: equipoUrl(eq.id) });
      } catch { /* noop */ }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 14;

  autoTable(doc, {
    startY: y,
    margin: TABLE_MARGIN,
    theme: 'grid',
    styles: { font: F_BODY, fontSize: 11, cellPadding: 4, lineColor: INK as any, lineWidth: 0.7, textColor: INK as any },
    headStyles: { fillColor: HEAD_FILL as any, textColor: INK as any, fontStyle: 'bold', halign: 'center' },
    head: [['NOVEDADES']],
    body: [[{ content: p.novedades ?? '', styles: { minCellHeight: 32 } }]],
  });
  y = (doc as any).lastAutoTable.finalY + 16;

  doc.setFont(F_BODY, 'normal'); doc.setFontSize(12); doc.setTextColor(40);
  doc.setLineHeightFactor(BODY_LH / 12);
  for (const par of tpl.legal) {
    const lines = doc.splitTextToSize(par, W - M * 2);
    y = ensureSpace(y, lines.length * BODY_LH + 8);
    doc.text(lines, M, y, { align: 'justify', maxWidth: W - M * 2 } as any);
    y += lines.length * BODY_LH + 8;
  }
  doc.setLineHeightFactor(1.15);
  y += 10;

  y = ensureSpace(y, 130);
  const firmaColab = p.firmaDataUrl;
  const firmaTec = p.firmaTecnicoDataUrl;
  autoTable(doc, {
    startY: y,
    margin: TABLE_MARGIN,
    theme: 'grid',
    styles: { font: F_BODY, fontSize: 11, cellPadding: 4, lineColor: INK as any, lineWidth: 0.7, textColor: INK as any, valign: 'middle' },
    headStyles: { fillColor: HEAD_FILL as any, textColor: INK as any, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 1: { cellWidth: 80 }, 2: { cellWidth: 190 }, 3: { cellWidth: 90 } },
    head: [['Nombres Completos', 'Cédula', 'Firma', tpl.firmaAccion]],
    body: [
      [c?.nombre ?? '', c?.cedula ?? '', { content: '', styles: { minCellHeight: 58 } }, 'Colaborador'],
      [p.tecnico ?? 'Service Desk', p.tecnicoCedula ?? '', { content: '', styles: { minCellHeight: 58 } }, 'Service Desk'],
    ],
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 2) return;
      const img = data.row.index === 0 ? firmaColab : data.row.index === 1 ? firmaTec : null;
      if (img) dibujarFirma(doc, img, data.cell);
    },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    stampHeader(doc, tpl.titulo, fechaHeader);
    doc.setFont(F_BODY, 'normal'); doc.setFontSize(7); doc.setTextColor(150);
    doc.text(`${EMPRESA} · ${NIT_EMPRESA} · ${p.consecutivo}`, M, H - 22);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 22, { align: 'right' });
  }

  return doc.output('blob');
}

export function abrirBlob(blob: Blob, nombreDescarga = 'acta.pdf') {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url; a.download = nombreDescarga; a.click();
  }
}

export function imprimirBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
    setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60_000);
  };
  document.body.appendChild(iframe);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

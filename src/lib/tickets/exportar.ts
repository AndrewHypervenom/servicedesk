/**
 * Exportación del control de tickets.
 *
 * La regla sigue siendo que lo que sale tiene que poder volver a entrar: las
 * columnas, su orden y sus nombres son los del libro original —ID, Ticket,
 * Descripción, Estado, Inicio, Fin, Días, Analista, Ciudad, Prioridad, %Cumpl,
 * Notas— y una hoja por mes, como el archivo que esta pantalla vino a
 * reemplazar.
 *
 * Y tiene que VERSE como el original, que no es un capricho estético: el
 * archivo se abre para trabajar con él, y sin encabezado fijo ni desplegables
 * de filtro, novecientas filas son inmanejables. Se reproduce lo que traía:
 *
 *   · encabezado azul (el mismo FF1E40AF del archivo), en blanco y negrita,
 *     con su altura de fila;
 *   · fila de encabezado congelada, para que no se pierda al bajar;
 *   · autofiltro sobre todas las columnas, que es lo que la gente llama "la
 *     tabla dinámica": los desplegables para filtrar y ordenar;
 *   · el estado y la prioridad con su color, como en el libro.
 *
 * Esto obliga a usar ExcelJS en vez de SheetJS: la edición comunitaria de
 * SheetJS escribe datos, pero no estilos de celda —ni rellenos, ni fuentes, ni
 * bordes—, así que el archivo salía en blanco y negro. ExcelJS se carga solo al
 * exportar (`await import`), para no meter una librería de este tamaño en el
 * arranque de una pantalla que casi siempre se usa para consultar.
 *
 * Un cambio deliberado respecto al original: las fechas salen como FECHAS de
 * verdad con formato 'aaaa-mm-dd', no como texto ni como el "8/4/26" del
 * archivo. Aquel formato es mes/día/año y en un Excel configurado en español se
 * lee al revés, convirtiendo el 4 de agosto en el 8 de abril sin avisar. Siendo
 * fechas reales, Excel las ordena y las filtra por rango, que en el archivo de
 * texto no se podía.
 */

import type { EstadoTicket, PrioridadTicket, Ticket } from '@/types';
import { diasEntre, etiquetaPeriodo } from './modelo';

export const COLUMNAS_ORIGINAL = [
  'ID', 'Ticket', 'Descripción', 'Estado', 'Inicio', 'Fin', 'Días',
  'Analista', 'Ciudad', 'Prioridad', '%Cumpl', 'Notas',
] as const;

/** Ancho de cada columna, en caracteres. Notas es la que más pide: es un párrafo. */
const ANCHOS = [5, 13, 38, 14, 12, 12, 7, 24, 14, 11, 9, 60];

/** Cómo se escribe cada estado en el archivo, que es como lo escribía la gente. */
const ESTADO_ARCHIVO: Record<EstadoTicket, string> = {
  COMPLETADA: 'Completada',
  EN_PROGRESO: 'En progreso',
  PENDIENTE: 'Pendiente',
  BLOQUEADA: 'Bloqueada',
};

const PRIORIDAD_ARCHIVO: Record<PrioridadTicket, string> = {
  ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja',
};

/** Relleno y letra de cada estado. Tonos suaves: el texto manda, el color acompaña. */
const COLOR_ESTADO: Record<EstadoTicket, { fondo: string; letra: string }> = {
  COMPLETADA: { fondo: 'FFD1FAE5', letra: 'FF065F46' },
  EN_PROGRESO: { fondo: 'FFDBEAFE', letra: 'FF1E40AF' },
  PENDIENTE: { fondo: 'FFFEF3C7', letra: 'FF92400E' },
  BLOQUEADA: { fondo: 'FFFEE2E2', letra: 'FF991B1B' },
};

const COLOR_PRIORIDAD: Record<PrioridadTicket, { fondo: string; letra: string }> = {
  ALTA: { fondo: 'FFFEE2E2', letra: 'FF991B1B' },
  MEDIA: { fondo: 'FFFEF3C7', letra: 'FF92400E' },
  BAJA: { fondo: 'FFF1F5F9', letra: 'FF475569' },
};

const AZUL_ENCABEZADO = 'FF1E40AF';
const BORDE = 'FFD8DEE6';
/** Banda de las filas pares. Muy tenue: separa sin convertirse en el protagonista. */
const BANDA = 'FFF8FAFC';

const marcaDeTiempo = () => new Date().toISOString().slice(0, 10);

/** Excel no admite : \ / ? * [ ] en el nombre de una hoja, ni más de 31 letras. */
const nombreHojaValido = (n: string) => n.replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || 'TICKETS';

/** Cómo se resuelven los enlaces a texto en la exportación. */
export interface ContextoExport {
  /** Nombre del analista enlazado; si no hay enlace, se usa el texto original. */
  nombreAnalista: (id?: string | null) => string | null;
  nombreSede: (id?: string | null) => string | null;
}

/**
 * '2026-08-04' → Date del 4 de agosto a mediodía UTC.
 *
 * El mediodía y no la medianoche: Excel guarda la fecha sin zona horaria, y
 * partiendo de las 00:00 UTC cualquier navegador al oeste de Greenwich —toda
 * América— restaría horas y escribiría el día anterior.
 */
function aFecha(iso?: string | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

/** Los valores de una fila, en el orden de las columnas del original. */
function filaDe(t: Ticket, i: number, ctx: ContextoExport): (string | number | Date | null)[] {
  return [
    i + 1,
    t.ticket,
    t.descripcion ?? '',
    ESTADO_ARCHIVO[t.estado] ?? t.estado,
    aFecha(t.fecha_inicio),
    aFecha(t.fecha_fin),
    diasEntre(t.fecha_inicio, t.fecha_fin),
    ctx.nombreAnalista(t.analista_id) ?? t.analista_texto ?? '',
    ctx.nombreSede(t.sede_id) ?? t.ciudad_texto ?? '',
    t.prioridad ? PRIORIDAD_ARCHIVO[t.prioridad] : '',
    // Como fracción con formato de porcentaje: es lo que Excel entiende por un
    // porcentaje, y así se puede promediar. Al releerlo, el importador
    // reconoce tanto el 0,99 como el "99%".
    t.cumplimiento == null ? null : t.cumplimiento / 100,
    t.notas ?? '',
  ];
}

/**
 * El libro con una hoja por mes, igual que el original.
 *
 * Los tickets sin mes —los que llegaron sin fecha de inicio— no se pierden:
 * van juntos a una hoja "SIN FECHA", que además es la forma de verlos todos
 * seguidos para ponerles la que les falta.
 */
export async function exportarTicketsExcel(tickets: Ticket[], ctx: ContextoExport) {
  // ExcelJS es CommonJS: según quién resuelva el `import` —Vite, el navegador
  // o un empaquetador de pruebas— el módulo llega tal cual o envuelto en
  // `default`. Se aceptan los dos en vez de confiar en uno.
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Calisto';
  wb.created = new Date();

  const porPeriodo = new Map<string, Ticket[]>();
  for (const t of tickets) {
    const k = t.periodo ?? 'SIN FECHA';
    const lista = porPeriodo.get(k);
    if (lista) lista.push(t);
    else porPeriodo.set(k, [t]);
  }
  if (!porPeriodo.size) porPeriodo.set('TICKETS', []);

  for (const clave of [...porPeriodo.keys()].sort()) {
    const filas = porPeriodo.get(clave)!;
    const titulo = clave === 'SIN FECHA' || clave === 'TICKETS'
      ? clave
      : etiquetaPeriodo(clave).toUpperCase();
    const ws = wb.addWorksheet(nombreHojaValido(titulo), {
      // El encabezado se queda a la vista al bajar por las novecientas filas.
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = COLUMNAS_ORIGINAL.map((c, i) => ({ header: c, width: ANCHOS[i] }));

    const cabecera = ws.getRow(1);
    cabecera.height = 34.5;
    cabecera.eachCell((celda) => {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL_ENCABEZADO } };
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      celda.border = {
        top: { style: 'thin', color: { argb: AZUL_ENCABEZADO } },
        bottom: { style: 'thin', color: { argb: AZUL_ENCABEZADO } },
        left: { style: 'thin', color: { argb: AZUL_ENCABEZADO } },
        right: { style: 'thin', color: { argb: AZUL_ENCABEZADO } },
      };
    });

    filas.forEach((t, i) => {
      const fila = ws.addRow(filaDe(t, i, ctx));
      fila.alignment = { vertical: 'top', wrapText: true };

      fila.eachCell({ includeEmpty: true }, (celda, col) => {
        celda.border = {
          top: { style: 'hair', color: { argb: BORDE } },
          bottom: { style: 'hair', color: { argb: BORDE } },
          left: { style: 'hair', color: { argb: BORDE } },
          right: { style: 'hair', color: { argb: BORDE } },
        };
        if (i % 2 === 1) {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDA } };
        }
      });

      // El número de ticket como texto: "161116-1" interpretado como número es
      // una resta, y Excel lo convierte en -955.
      fila.getCell(2).numFmt = '@';
      fila.getCell(2).alignment = { vertical: 'top', horizontal: 'left' };
      fila.getCell(5).numFmt = 'yyyy-mm-dd';
      fila.getCell(6).numFmt = 'yyyy-mm-dd';
      fila.getCell(7).alignment = { vertical: 'top', horizontal: 'center' };
      fila.getCell(11).numFmt = '0%';

      const estado = COLOR_ESTADO[t.estado];
      if (estado) {
        const c = fila.getCell(4);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: estado.fondo } };
        c.font = { color: { argb: estado.letra }, bold: true };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      const prioridad = t.prioridad ? COLOR_PRIORIDAD[t.prioridad] : null;
      if (prioridad) {
        const c = fila.getCell(10);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: prioridad.fondo } };
        c.font = { color: { argb: prioridad.letra } };
        c.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });

    // Los desplegables de filtro y orden sobre todas las columnas. Es lo que
    // convierte la hoja en algo con lo que se puede trabajar.
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(filas.length + 1, 2), column: COLUMNAS_ORIGINAL.length },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  descargar(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `control_tickets_${marcaDeTiempo()}.xlsx`,
  );
}

/**
 * Un CSV con TODO seguido, incluido lo que el archivo original no tenía: el
 * mes, el analista enlazado y el texto que traía el archivo. Es el formato para
 * llevárselo a otra herramienta, no para volver a abrirlo en Excel.
 */
export function exportarTicketsCsv(tickets: Ticket[], ctx: ContextoExport) {
  const encabezado = [
    ...COLUMNAS_ORIGINAL, 'Periodo', 'Analista (archivo)', 'Ciudad (archivo)', 'Actualizado',
  ];
  const filas = tickets.map((t, i) => [
    ...filaDe(t, i, ctx).map((v, col) => {
      if (v == null) return '';
      // En el CSV no hay formatos: las fechas van en ISO y el cumplimiento
      // vuelve a ser el entero que se ve en pantalla.
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      if (col === 10 && typeof v === 'number') return `${Math.round(v * 100)}%`;
      return v;
    }),
    t.periodo ?? '',
    t.analista_texto ?? '',
    t.ciudad_texto ?? '',
    t.actualizado_en ?? '',
  ]);

  const escapar = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [encabezado, ...filas].map((f) => f.map(escapar).join(';')).join('\r\n');

  // BOM: sin él, Excel abre el CSV en Latin-1 y parte todas las tildes.
  descargar(
    new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }),
    `control_tickets_${marcaDeTiempo()}.csv`,
  );
}

function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  // Se libera al final del ciclo: revocar en el mismo instante cancela la
  // descarga en algunos navegadores antes de que llegue a empezar.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

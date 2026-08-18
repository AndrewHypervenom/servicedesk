/**
 * Exportación de líneas móviles.
 *
 * La regla es que lo que sale tiene que poder volver a entrar: las columnas,
 * su orden y sus nombres son los del libro original ("ICCID, NUMERO, ESTADO,
 * NOMBRE, CR, PROYECTO, OBSERVACION, FECHA DE CORTE, SOLICITUD CLARO"), para
 * que quien recibe el archivo fuera del sitio —el operador, contabilidad— siga
 * viendo lo de siempre, y para que el importador reconozca su propia
 * exportación sin tocar el mapeo.
 *
 * Y como el libro original reparte las líneas en varias hojas ("LINEAS NUEVAS",
 * "EMPAQUES NUEVOS", "Lineas que fueron suspendidas"…), la exportación las
 * devuelve repartidas igual, usando `hoja_origen`. Con una diferencia
 * deliberada: todas las hojas salen con el mismo juego de columnas, más IMEI y
 * CÉDULA cuando esa hoja tiene alguno. En el original cada hoja tenía columnas
 * distintas y eso era justo lo que hacía falta abrir cinco veces el archivo
 * para responder una pregunta.
 *
 * Los identificadores salen como TEXTO, no como número. Un ICCID de 20 dígitos
 * abierto como número en Excel se muestra "8,95710160270638E+19" y se guarda
 * redondeado: el archivo quedaría inservible al primer "Guardar". Es exactamente
 * el daño que trae el libro que se cargó.
 */

import * as XLSX from 'xlsx';
import type { LineaMovil } from '@/types';

/** Las nueve columnas del archivo original, en su orden. */
export const COLUMNAS_ORIGINAL = [
  'ICCID', 'NUMERO', 'ESTADO', 'NOMBRE', 'CR', 'PROYECTO',
  'OBSERVACION', 'FECHA DE CORTE', 'SOLICITUD CLARO',
] as const;

/** Nombre de la hoja para las líneas que no vinieron de ninguna. */
const HOJA_POR_DEFECTO = 'LINEAS';

const marcaDeTiempo = () => new Date().toISOString().slice(0, 10);

/** Excel no admite : \\ / ? * [ ] en el nombre de una hoja, ni más de 31 letras. */
const nombreHojaValido = (n: string) => n.replace(/[:\\/?*[\]]/g, '-').slice(0, 31) || HOJA_POR_DEFECTO;

function filaDe(l: LineaMovil, conImei: boolean, conCedula: boolean): string[] {
  const base = [
    l.iccid ?? '',
    l.numero ?? '',
    l.estado ?? '',
    l.nombre ?? '',
    l.cr ?? '',
    l.proyecto ?? '',
    l.observacion ?? '',
    l.fecha_corte ?? '',
    l.solicitud_claro ?? '',
  ];
  if (conImei) base.push(l.imei ?? '');
  if (conCedula) base.push(l.cedula_asignado ?? '');
  return base;
}

/** Hoja lista para el libro, con todas sus celdas forzadas a texto. */
function hojaDe(lineas: LineaMovil[]): XLSX.WorkSheet {
  const conImei = lineas.some((l) => !!l.imei);
  const conCedula = lineas.some((l) => !!l.cedula_asignado);
  const encabezado = [
    ...COLUMNAS_ORIGINAL,
    ...(conImei ? ['IMEI'] : []),
    ...(conCedula ? ['CEDULA'] : []),
  ];

  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...lineas.map((l) => filaDe(l, conImei, conCedula))]);

  const rango = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  for (let f = rango.s.r; f <= rango.e.r; f++) {
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r: f, c })];
      if (celda) { celda.t = 's'; celda.z = '@'; }
    }
  }

  ws['!cols'] = [
    { wch: 24 }, { wch: 13 }, { wch: 22 }, { wch: 34 }, { wch: 7 },
    { wch: 34 }, { wch: 40 }, { wch: 40 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
  ].slice(0, encabezado.length);
  // La primera fila se congela: en cuanto se hace scroll ya no se sabe qué
  // columna se está mirando.
  ws['!freeze'] = { xSplit: '0', ySplit: '1' };
  return ws;
}

/** Reparte las líneas por su hoja de origen, conservando el orden de aparición. */
function agruparPorHoja(lineas: LineaMovil[]): Map<string, LineaMovil[]> {
  const m = new Map<string, LineaMovil[]>();
  for (const l of lineas) {
    const h = nombreHojaValido(l.hoja_origen?.trim() || HOJA_POR_DEFECTO);
    m.set(h, [...(m.get(h) ?? []), l]);
  }
  return m;
}

export interface OpcionesExportacion {
  /** Una hoja por hoja de origen, como en el libro. Por defecto, sí. */
  porHoja?: boolean;
  nombreArchivo?: string;
}

/**
 * .xlsx con el formato original. Si las líneas vienen de varias hojas del libro
 * y `porHoja` está activo, se reconstruye el libro con esas mismas hojas.
 */
export function exportarLineasExcel(lineas: LineaMovil[], opciones: OpcionesExportacion = {}) {
  const { porHoja = true, nombreArchivo } = opciones;
  const wb = XLSX.utils.book_new();

  const grupos = porHoja ? agruparPorHoja(lineas) : new Map([[HOJA_POR_DEFECTO, lineas]]);
  // Sin agrupar (o con una sola hoja) se escribe una hoja y ya; con varias, se
  // respeta el reparto del libro.
  for (const [nombre, filas] of grupos) {
    XLSX.utils.book_append_sheet(wb, hojaDe(filas), nombre);
  }
  if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, hojaDe([]), HOJA_POR_DEFECTO);

  XLSX.writeFile(wb, nombreArchivo ?? `lineas_moviles_${marcaDeTiempo()}.xlsx`);
}

/**
 * El mismo contenido en .csv, que es como llegó la hoja principal.
 *
 * Un CSV es una sola tabla: no puede tener hojas. Por eso lleva la columna
 * HOJA al final —para no perder ese dato— y por eso la exportación completa es
 * la de Excel.
 */
export function exportarLineasCsv(lineas: LineaMovil[], nombreArchivo?: string) {
  const escapar = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const conImei = lineas.some((l) => !!l.imei);
  const conCedula = lineas.some((l) => !!l.cedula_asignado);
  const variasHojas = new Set(lineas.map((l) => l.hoja_origen ?? '')).size > 1;

  const encabezado = [
    ...COLUMNAS_ORIGINAL,
    ...(conImei ? ['IMEI'] : []),
    ...(conCedula ? ['CEDULA'] : []),
    ...(variasHojas ? ['HOJA'] : []),
  ];

  const texto = [
    encabezado.join(','),
    ...lineas.map((l) => [
      ...filaDe(l, conImei, conCedula),
      ...(variasHojas ? [l.hoja_origen ?? ''] : []),
    ].map(escapar).join(',')),
  ].join('\r\n');

  // BOM al principio: sin él, Excel abre el CSV en ANSI y "MEDELLÍN" se ve
  // "MEDELLÍN". Es el mismo detalle que trae el archivo original.
  const blob = new Blob([`﻿${texto}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo ?? `lineas_moviles_${marcaDeTiempo()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exportación ampliada: el formato original más lo que solo existe en el sitio
 * (sede, titular verificado contra la planta, categoría, hoja de origen y
 * fechas de cambio). Sirve para auditar; no para devolvérselo al operador.
 */
export function exportarLineasAmpliado(
  filas: Record<string, unknown>[], hoja: string, nombreArchivo?: string,
) {
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHojaValido(hoja));
  XLSX.writeFile(wb, nombreArchivo ?? `lineas_moviles_detalle_${marcaDeTiempo()}.xlsx`);
}

/**
 * Plantilla vacía con las columnas y una fila de ejemplo por cada caso que el
 * libro real tiene: una línea normal y una SIM en empaque (sin número).
 * Es la salida honesta para quien todavía no tiene el archivo: en vez de
 * decirle "sube un Excel con el formato correcto", se le entrega el formato.
 */
export function descargarPlantillaLineas() {
  const ejemplos: LineaMovil[] = [
    {
      id: '', numero: '3001234567', iccid: '89571016000000000000', imei: '350399400000000',
      estado: 'OK', nombre: 'Nombre Apellido', cr: '2625', proyecto: 'CLARO MILLA',
      observacion: '', fecha_corte: '', solicitud_claro: '', hoja_origen: 'LINEAS NUEVAS',
    },
    {
      id: '', numero: null, iccid: '89571016000000000001', estado: 'EMPAQUE NUEVO',
      nombre: '', cr: '', proyecto: '', observacion: 'SIM sin activar',
      fecha_corte: '', solicitud_claro: '', hoja_origen: 'EMPAQUES NUEVOS',
    },
  ];
  exportarLineasExcel(ejemplos, { nombreArchivo: 'plantilla_lineas_moviles.xlsx' });
}

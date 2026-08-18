/**
 * Lectura cruda de una hoja del Excel.
 *
 * Todo el importador pasa por aquí para que dos cosas sean ciertas siempre:
 *
 * 1. **El número de fila que se le muestra al usuario es el de Excel.** Antes se
 *    usaba `sheet_to_json` en modo objeto, que descarta las filas en blanco: la
 *    fila 5 del archivo llegaba como la posición 3 de la lista y las incidencias
 *    señalaban una fila que no era. Aquí se conserva *toda* fila bajo el
 *    encabezado, vacía o no, y el número se calcula desde el rango real de la
 *    hoja (que no siempre empieza en A1).
 * 2. **Ninguna columna queda invisible.** Si dos columnas comparten encabezado,
 *    la librería las colapsa; aquí la segunda se llama «NOMBRE (2)» y se puede
 *    mapear como cualquier otra.
 */

import * as XLSX from 'xlsx';

export type Fila = Record<string, unknown>;

export interface HojaLeida {
  /** Encabezados como claves únicas, en el orden del Excel. */
  columnas: string[];
  /** Todas las filas bajo el encabezado, incluidas las vacías. */
  filas: Fila[];
  /** Cuántas de esas filas traen algún dato. */
  conDatos: number;
  /** Primeros valores de cada columna, para orientar en el mapeo. */
  muestras: Record<string, string[]>;
  /** Número de fila en Excel (1-based) de la fila `i` de `filas`. */
  filaExcel: (i: number) => number;
}

/** Cuántos valores de ejemplo se guardan por columna. */
const MUESTRAS = 3;

const textoDe = (v: unknown) => (v == null ? '' : String(v).trim());

export function leerHoja(wb: XLSX.WorkBook, nombre: string): HojaLeida {
  const ws = wb.Sheets[nombre];
  const vacia: HojaLeida = {
    columnas: [], filas: [], conDatos: 0, muestras: {}, filaExcel: (i) => i + 2,
  };
  if (!ws) return vacia;

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, defval: null, raw: false, blankrows: true,
  });
  if (!matriz.length) return vacia;

  // El encabezado es la primera fila del rango usado, que no tiene por qué ser
  // la fila 1: de ahí sale el desfase con el que se numeran las filas.
  const primera = XLSX.utils.decode_range(ws['!ref'] ?? 'A1').s.r;
  const filaExcel = (i: number) => primera + 2 + i;

  const columnas: string[] = [];
  const indices: number[] = [];
  (matriz[0] ?? []).forEach((celda, idx) => {
    const bruto = textoDe(celda);
    if (!bruto) return;
    // Un encabezado repetido es normal en hojas de captura manual; se desambigua
    // en vez de perder la segunda columna.
    let clave = String(celda);
    for (let n = 2; columnas.includes(clave); n++) clave = `${bruto} (${n})`;
    columnas.push(clave);
    indices.push(idx);
  });

  const cuerpo = matriz.slice(1);
  const filas = cuerpo.map((r) => {
    const f: Fila = {};
    columnas.forEach((clave, k) => { f[clave] = r?.[indices[k]] ?? null; });
    return f;
  });
  const conDatos = cuerpo.filter((r) => (r ?? []).some((c) => textoDe(c) !== '')).length;

  const muestras: Record<string, string[]> = {};
  columnas.forEach((clave, k) => {
    const vals: string[] = [];
    for (const r of cuerpo) {
      const s = textoDe(r?.[indices[k]]);
      if (s) {
        vals.push(s);
        if (vals.length >= MUESTRAS) break;
      }
    }
    muestras[clave] = vals;
  });

  return { columnas, filas, conDatos, muestras, filaExcel };
}

/** Fila sin absolutamente nada: ni siquiera es una fila de plantilla. */
export function filaVacia(f: Fila): boolean {
  return Object.values(f).every((v) => textoDe(v) === '');
}

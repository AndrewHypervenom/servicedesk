/**
 * Normalizadores para leer BASE_EQUIPOS_PR.xlsx.
 *
 * La hoja es de captura manual, así que casi ningún valor llega limpio: hay
 * seriales con espacios al final ("9KCYHL3 "), cédulas escritas con puntos
 * ("1.014.186.395"), nombres con doble espacio y celdas que dicen "N/A" en vez
 * de estar vacías. Todo eso se resuelve aquí para que el resto del importador
 * trabaje contra valores predecibles.
 */

/** Valores que en esta hoja significan "no hay dato", aunque la celda no esté vacía. */
const VACIOS = new Set(['', 'N/A', 'NA', 'NINGUNO', 'NO APLICA', '-', '--', '0']);

/** Texto en mayúsculas, sin espacios de sobra. La forma canónica para comparar. */
export function norm(v: unknown): string {
  if (v == null) return '';
  return String(v).trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Texto tal cual lo escribió el usuario, solo recortado. `null` si no hay nada. */
export function limpio(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
}

/** `null` cuando la celda está vacía o dice "N/A", "NINGUNO", "0"… */
export function limpioODefecto(v: unknown): string | null {
  const s = limpio(v);
  if (s === null) return null;
  return VACIOS.has(s.toUpperCase()) ? null : s;
}

/** ¿Esta celda es un "no hay dato" en cualquiera de sus disfraces? */
export function esVacio(v: unknown): boolean {
  return limpioODefecto(v) === null;
}

/**
 * Nombre de persona en forma comparable: sin tildes ni dobles espacios.
 * Es la llave con la que se cruzan BD_EQUIPOS (solo nombre) y ENTRADAS (nombre + cédula).
 */
export function normNombre(v: unknown): string {
  return norm(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita los acentos que NFD separó ("PEÑA" -> "PENA")
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre presentable: "CARLOS  HERRERA " -> "Carlos Herrera". */
export function nombrePropio(v: unknown): string {
  return norm(v)
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Cédula en dígitos. "1.014.186.395" -> "1014186395".
 * Devuelve `null` si lo que queda no parece una cédula (vacío, "N/A", letras).
 */
export function normCedula(v: unknown): string | null {
  const s = limpioODefecto(v);
  if (s === null) return null;
  const soloDigitos = s.replace(/[.\s-]/g, '');
  if (!/^\d{4,15}$/.test(soloDigitos)) return null;
  return soloDigitos;
}

/** El serial es la llave del equipo: mayúsculas y sin espacios en ningún lado. */
export function normSerial(v: unknown): string {
  return norm(v).replace(/\s/g, '');
}

export interface FechaLeida {
  iso: string | null;
  /** true cuando el texto no se pudo interpretar como fecha. */
  invalida: boolean;
}

const SERIAL_EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Lee las fechas de ENTRADAS/SALIDAS, que vienen como texto "M/D/YY" ("6/17/26").
 * También acepta objetos Date y seriales de Excel por si cambia el formato de la hoja.
 */
export function parseFecha(v: unknown): FechaLeida {
  if (v == null || String(v).trim() === '') return { iso: null, invalida: false };

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return { iso: v.toISOString().slice(0, 10), invalida: false };
  }

  const s = String(v).trim();
  if (VACIOS.has(s.toUpperCase())) return { iso: null, invalida: false };

  // Serial de Excel (número de días desde 1899-12-30).
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 1000) {
    const d = new Date(SERIAL_EXCEL_EPOCH + Math.floor(Number(s)) * 86400000);
    return { iso: d.toISOString().slice(0, 10), invalida: false };
  }

  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return { iso: null, invalida: true };

  let [, a, b, y] = m;
  let mes = Number(a);
  let dia = Number(b);

  // La hoja usa M/D/YY. Si el primer número no puede ser un mes, es D/M.
  if (mes > 12 && dia <= 12) [mes, dia] = [dia, mes];
  if (mes > 12 || dia > 31 || mes < 1 || dia < 1) return { iso: null, invalida: true };

  let anio = Number(y);
  if (y.length === 2) anio += anio <= 68 ? 2000 : 1900;

  const d = new Date(Date.UTC(anio, mes - 1, dia));
  // Rechaza cosas como 2/31: el Date se corre de mes y deja de coincidir.
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return { iso: null, invalida: true };

  return { iso: d.toISOString().slice(0, 10), invalida: false };
}

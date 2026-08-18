/**
 * El vocabulario de estados de una línea móvil lo escribe el operador, no
 * nosotros. En el archivo real conviven "OK", "ok", "Ok ", "STOCK MEDELLIN",
 * "STOCK BOGOTA", "CANCELADA PERMANENTEMENTE" y "PERMANENTEMENTE" a secas.
 *
 * Por eso el estado se guarda como texto (canonizado a mayúsculas, nada más) y
 * lo que se filtra y se grafica es la CATEGORÍA que se deduce de él. Así el día
 * que Claro invente un estado nuevo, la línea entra igual y aparece en su sitio
 * en vez de romper una carga o quedarse fuera de los conteos.
 */

export type CategoriaLinea = 'ACTIVA' | 'STOCK' | 'CANCELADA' | 'OTRO';

export const CATEGORIAS: CategoriaLinea[] = ['ACTIVA', 'STOCK', 'CANCELADA', 'OTRO'];

/** Mayúsculas, sin espacios de sobra y sin acentos: la forma en que se guarda. */
export function estadoCanonico(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, ' ').toUpperCase();
  return s === '' ? null : s;
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * A qué grupo pertenece un estado.
 *
 * El orden de las comprobaciones importa: "CANCELADA PERMANENTEMENTE" contiene
 * la palabra "PERMANENTE", y "STOCK MEDELLIN" empieza por STOCK. Lo específico
 * va antes que lo genérico.
 */
export function categoriaEstado(estado?: string | null): CategoriaLinea {
  const e = sinAcentos(estadoCanonico(estado) ?? '');
  if (!e) return 'OTRO';
  // "EMPAQUE NUEVO" son SIM sin estrenar: inventario disponible, igual que el
  // stock. Va antes que nada porque es lo que trae una hoja entera del libro.
  if (e.startsWith('STOCK') || e.includes('EMPAQUE') || e.includes('DISPONIBLE')
    || e.includes('LIBRE')) return 'STOCK';
  if (e.includes('CANCELAD') || e.includes('PERMANENTE') || e.includes('BAJA')
    || e.includes('SUSPEND') || e.includes('INACTIV')) return 'CANCELADA';
  if (e === 'OK' || e.startsWith('ACTIV') || e === 'ASIGNADA' || e === 'ASIGNADO') return 'ACTIVA';
  return 'OTRO';
}

/** Clave i18n de la etiqueta de cada categoría. */
export const ETIQUETA_CATEGORIA: Record<CategoriaLinea, string> = {
  ACTIVA: 'lines.catActive',
  STOCK: 'lines.catStock',
  CANCELADA: 'lines.catCancelled',
  OTRO: 'lines.catOther',
};

/**
 * Clases del distintivo. Mismo criterio que el resto del sitio: el color
 * acompaña a la etiqueta, nunca la sustituye.
 */
export const COLOR_CATEGORIA: Record<CategoriaLinea, string> = {
  ACTIVA: 'bg-success/15 text-emerald-700 dark:text-success',
  STOCK: 'bg-info/20 text-magenta-600 dark:text-info',
  CANCELADA: 'bg-danger/15 text-red-600 dark:text-danger',
  OTRO: 'bg-ink-300/20 text-ink-500 dark:text-ink-300',
};

/** Color de serie para los gráficos, uno por categoría y siempre el mismo. */
export function colorCategoria(cat: CategoriaLinea, oscuro: boolean): string {
  const claro: Record<CategoriaLinea, string> = {
    ACTIVA: '#0a9038', STOCK: '#1d6fd4', CANCELADA: '#b3261e', OTRO: '#86908f',
  };
  const osc: Record<CategoriaLinea, string> = {
    ACTIVA: '#17a94f', STOCK: '#3d84d6', CANCELADA: '#e0685f', OTRO: '#6a7473',
  };
  return (oscuro ? osc : claro)[cat];
}

/**
 * "STOCK MEDELLIN" → "MEDELLIN".
 *
 * Es la única pista de ubicación que trae el archivo, y sirve para proponer la
 * sede de esas líneas durante la carga en vez de dejarlas todas sin sede.
 */
export function ciudadDeStock(estado?: string | null): string | null {
  const e = estadoCanonico(estado);
  if (!e || !sinAcentos(e).startsWith('STOCK')) return null;
  const resto = e.slice(5).replace(/^[\s:.-]+/, '').trim();
  return resto || null;
}

/**
 * Un número de línea en su forma comparable: solo dígitos.
 * "310 234 5678" y "3102345678" son la misma línea.
 */
export function normNumero(v: unknown): string | null {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, '');
  // Fijos a 7 dígitos, móviles a 10, internacionales con indicativo hasta 15.
  return d.length >= 7 && d.length <= 15 ? d : null;
}

/** Presentación del número: "3102345678" → "310 234 5678". */
export function fmtNumero(numero?: string | null): string {
  const d = (numero ?? '').replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return numero ?? '—';
}

/** El ICCID también es solo dígitos (19–22 en las SIM de Claro). */
export function normIccid(v: unknown): string | null {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

/** El IMEI son 15 dígitos (14 + verificador); 16 en algunos equipos. */
export function normImei(v: unknown): string | null {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, '');
  return d.length >= 14 && d.length <= 17 ? d : null;
}

/**
 * ¿Este valor es un IMEI y no un ICCID?
 *
 * En el libro hay filas cuya columna "ICCID" trae en realidad el IMEI del
 * teléfono. Se distinguen bien: el ICCID de una SIM empieza por 89 (código de
 * telecomunicaciones) y tiene 19–22 dígitos; el IMEI tiene 15 y en estos
 * equipos empieza por 35 (código de asignación de tipo). Guardar uno donde va
 * el otro rompe las dos cosas: la SIM queda con un identificador que no existe
 * y el equipo se pierde.
 */
export function pareceImei(v: unknown): boolean {
  if (v == null) return false;
  const d = String(v).replace(/\D/g, '');
  return d.length === 15 && !d.startsWith('89');
}

/**
 * De dos ICCID para la misma línea, el que tiene pinta de bueno.
 *
 * Al cruzar hojas aparecen los dos: el íntegro y el que Excel estropeó al
 * guardarlo como número (pierde el prefijo 89 y redondea el final). Gana el que
 * empieza por 89; en igualdad, el más largo. Misma regla que la función
 * `mejor_iccid` de la base, para que el resultado no dependa de si la fusión
 * ocurrió en el navegador o en el servidor.
 */
export function mejorIccid(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const a89 = a.startsWith('89');
  const b89 = b.startsWith('89');
  if (a89 !== b89) return a89 ? a : b;
  return a.length >= b.length ? a : b;
}

/**
 * ¿Este ICCID llegó estropeado por Excel?
 *
 * Un ICCID tiene 19–22 dígitos y JavaScript solo representa 15 con exactitud:
 * si la columna venía como número en vez de texto, el valor llega redondeado
 * ("...8378" se convierte en "...8000") o en notación científica. No se puede
 * arreglar desde aquí —el dato ya se perdió—, pero sí avisarlo antes de cargar.
 */
export function iccidSospechoso(crudo: unknown, normalizado: string | null): boolean {
  if (!normalizado) return false;
  if (/e\+?\d/i.test(String(crudo))) return true;
  return normalizado.length >= 17 && /0{4}$/.test(normalizado);
}

/**
 * ¿Este ICCID está incompleto?
 *
 * Todo ICCID empieza por 89 (el código que la UIT reserva a las
 * telecomunicaciones) y tiene 19–22 dígitos. En el libro hay tres hojas con
 * valores tipo "57101702604517057": son la misma serie sin el prefijo, perdido
 * al capturarlos o al pasarlos por una celda numérica. Siguen sirviendo para
 * distinguir una SIM de otra —por eso se cargan—, pero no valen para reclamarle
 * nada al operador, así que hay que decirlo en vez de darlos por buenos.
 */
export function iccidIncompleto(iccid: string | null): boolean {
  if (!iccid) return false;
  return !iccid.startsWith('89') || iccid.length < 18;
}

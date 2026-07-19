import type { EstadoAsignacion, EstadoFisico, TipoActivo } from '@/types';

/** El nombre que la hoja le da a "sin dueño": el equipo está en bodega. */
export const BODEGA = 'BODEGA';

/** TIPO DE DISPOSITIVO -> tipo de activo del sistema. */
export const TIPOS: Record<string, TipoActivo> = {
  'PORTÁTIL': 'PORTATIL',
  'PORTATIL': 'PORTATIL',
  'CELULAR': 'CELULAR',
  'ESCRITORIO': 'ESCRITORIO',
  'MONITOR': 'MONITOR',
  'PERIFÉRICO': 'PERIFERICO',
  'PERIFERICO': 'PERIFERICO',
  'CARGADOR': 'CARGADOR',
};

/** ESTADO ACTUAL -> estado de asignación. */
export const ESTADOS: Record<string, EstadoAsignacion> = {
  'DISPONIBLE': 'DISPONIBLE',
  'ENTREGADO': 'ASIGNADO',
  'MANTENIMIENTO': 'EN_MANTENIMIENTO',
  'REPARACIÓN': 'EN_MANTENIMIENTO',
  'REPARACION': 'EN_MANTENIMIENTO',
  'BAJA': 'DE_BAJA',
  'NO DISPONIBLE': 'EN_MANTENIMIENTO',
};

/** CONDICIÓN -> estado físico. */
export const CONDICIONES: Record<string, EstadoFisico> = {
  'BUENO': 'BUENO',
  'REGULAR': 'REGULAR',
  'CON FALLA': 'CON_FALLA',
  'DAÑADO': 'DANADO',
  'DANADO': 'DANADO',
};

/** MOTIVO DE ENTRADA de la hoja ENTRADAS. Solo se usa para la observación. */
export const MOTIVOS = new Set(['SALIDA DE LA EMPRESA', 'CAMBIO DE EQUIPO']);

/**
 * Modelos que en realidad no son modelos.
 *
 * La columna MODELO de BD_EQUIPOS trae, en varias filas, el chip de red que
 * reporta el sistema operativo (RTL8821CE, AX201NGW, 8265NGW…) o directamente
 * un serial. Se importan igual, pero se marcan para que alguien los corrija.
 */
const PATRONES_MODELO_DUDOSO = [
  /^RTL\d{4}[A-Z]{0,2}$/,      // chips Realtek
  /^AX\d{3}NGW$/,              // Intel AX
  /^\d{4}NGW$/,                // Intel 8265NGW / 8665NGW
  /^NO VISIBLE$/,
  /^\d{2}[A-Z]\d[A-Z]\d{2}[A-Z]\d[A-Z]$/, // 20W5S41N0L y parecidos: es un serial
  /^[A-Z]{3}\d{7,}$/,          // LRN0B1301003: serial largo
];

export function modeloEsDudoso(modelo: string): boolean {
  return PATRONES_MODELO_DUDOSO.some((re) => re.test(modelo));
}

/**
 * Marcas del catálogo de la hoja CONFIGURACIÓN.
 * "THINK BOOK" está en esa lista pero es una línea de Lenovo, no un fabricante.
 */
export const MARCAS_CONOCIDAS = new Set([
  'DELL', 'ACER', 'HP', 'LENOVO', 'ASUS', 'SAMSUNG', 'REDMI', 'TCL', 'MOTOROLA',
]);

/** Marcas que en realidad son un modelo, con la marca real sugerida. */
export const MARCAS_QUE_SON_MODELO: Record<string, string> = {
  'THINK BOOK': 'LENOVO',
  'THINKBOOK': 'LENOVO',
  'THINKPAD': 'LENOVO',
};

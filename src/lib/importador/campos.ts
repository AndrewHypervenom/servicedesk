/**
 * Catálogo de los campos que el importador sabe llenar, hoja por hoja.
 *
 * Antes cada campo se leía por un nombre de columna fijo (`col(f, 'SERIAL')`).
 * Ahora ese nombre es solo la *sugerencia* de arranque: el usuario puede reasignar
 * cualquier columna a cualquier campo en el paso de mapeo. Este archivo define qué
 * campos existen, cómo se llaman en pantalla, cuáles son obligatorios y con qué
 * encabezados se auto-detectan.
 */

import { normNombre } from './normalizar';
import type { ModoExtra } from './tipos';

/** Las cuatro clases de hoja que el importador entiende. */
export type HojaId = 'BD_EQUIPOS' | 'ENTRADAS' | 'SALIDAS' | 'CLARO';

export interface CampoDef {
  /** Identificador estable con el que lo lee el analizador. */
  id: string;
  /** Cómo se muestra en el paso de mapeo. */
  etiqueta: string;
  /** Sin este campo la fila no se puede importar. */
  obligatorio?: boolean;
  /** Encabezados que lo auto-detectan (se comparan normalizados). El primero es el "oficial". */
  alias: string[];
  /** Nota corta bajo la etiqueta para orientar al usuario. */
  ayuda?: string;
}

export interface HojaDef {
  id: HojaId;
  /** Cómo se muestra la hoja en el asistente. */
  etiqueta: string;
  /** A dónde va lo que trae la hoja (para el resumen). */
  destino: string;
  /** Nombres exactos (normalizados) con los que puede aparecer la hoja en el Excel. */
  nombres: string[];
  /** Alternativa: se reconoce si el nombre de la hoja contiene este texto (para CLARO). */
  contiene?: string;
  campos: CampoDef[];
}

export const HOJAS: HojaDef[] = [
  {
    id: 'BD_EQUIPOS',
    etiqueta: 'Inventario de equipos',
    destino: 'Inventario de equipos',
    nombres: ['BD_EQUIPOS', 'BD EQUIPOS', 'EQUIPOS', 'INVENTARIO'],
    campos: [
      { id: 'serial', etiqueta: 'Serial', obligatorio: true, alias: ['SERIAL'], ayuda: 'Llave única del equipo' },
      { id: 'marca', etiqueta: 'Marca', alias: ['MARCA'] },
      { id: 'modelo', etiqueta: 'Modelo', alias: ['MODELO'] },
      { id: 'tipo', etiqueta: 'Tipo de dispositivo', alias: ['TIPO DE DISPOSITIVO', 'TIPO'] },
      { id: 'estado', etiqueta: 'Estado', alias: ['ESTADO ACTUAL', 'ESTADO'] },
      { id: 'condicion', etiqueta: 'Condición', alias: ['CONDICION', 'CONDICIÓN'] },
      { id: 'usuario', etiqueta: 'Usuario actual', alias: ['USUARIO ACTUAL', 'USUARIO'] },
      { id: 'ubicacion', etiqueta: 'Ubicación / sede', alias: ['UBICACION', 'UBICACIÓN', 'SEDE'] },
      { id: 'comentarios', etiqueta: 'Comentarios', alias: ['COMENTARIOS TECNICOS', 'COMENTARIOS TÉCNICOS', 'COMENTARIOS', 'OBSERVACIONES'] },
    ],
  },
  {
    id: 'ENTRADAS',
    etiqueta: 'Entradas / devoluciones',
    destino: 'Devoluciones + colaboradores',
    nombres: ['ENTRADAS', 'ENTRADA', 'DEVOLUCIONES'],
    campos: [
      { id: 'serial', etiqueta: 'Serial', obligatorio: true, alias: ['SERIAL'] },
      { id: 'fecha', etiqueta: 'Fecha', alias: ['FECHA'] },
      { id: 'quienEntrega', etiqueta: 'Quién entrega', alias: ['QUIEN ENTREGA', 'QUIÉN ENTREGA', 'RESPONSABLE'] },
      { id: 'cedula', etiqueta: 'Cédula', alias: ['CEDULA', 'CÉDULA'], ayuda: 'Única fuente de cédulas del archivo' },
      { id: 'motivo', etiqueta: 'Motivo de entrada', alias: ['MOTIVO DE ENTRADA', 'MOTIVO'] },
      { id: 'perifericos', etiqueta: 'Periféricos recibidos', alias: ['PERIFERICOS RECIBIDOS', 'PERIFÉRICOS RECIBIDOS', 'PERIFERICOS'] },
      { id: 'estadoRecibir', etiqueta: 'Estado físico al recibir', alias: ['ESTADO FISICO AL RECIBIR', 'ESTADO FÍSICO AL RECIBIR'] },
      { id: 'recibidoPor', etiqueta: 'Recibido por', alias: ['RECIBIDO POR'] },
      { id: 'acta', etiqueta: 'Acta', alias: ['ACTA'] },
    ],
  },
  {
    id: 'SALIDAS',
    etiqueta: 'Salidas / asignaciones',
    destino: 'Asignaciones',
    nombres: ['SALIDAS', 'SALIDA', 'ASIGNACIONES'],
    campos: [
      { id: 'serial', etiqueta: 'Serial del equipo', obligatorio: true, alias: ['ID DEL EQUIPO', 'SERIAL', 'ID EQUIPO'] },
      { id: 'fecha', etiqueta: 'Fecha de salida', alias: ['FECHA SALIDA', 'FECHA'] },
      { id: 'ticket', etiqueta: 'Ticket', alias: ['TICKET'] },
      { id: 'modelo', etiqueta: 'Modelo', alias: ['MODELO'] },
      { id: 'responsable', etiqueta: 'Responsable del equipo', alias: ['RESPONSABLE DEL EQUIPO', 'RESPONSABLE'] },
      { id: 'perifericos', etiqueta: 'Periféricos entregados', alias: ['PERIFERICOS ENTREGADOS', 'PERIFÉRICOS ENTREGADOS', 'PERIFERICOS'] },
      { id: 'anotaciones', etiqueta: 'Anotaciones especiales', alias: ['ANOTACIONES ESPECIALES', 'ANOTACIONES', 'OBSERVACIONES'] },
    ],
  },
  {
    id: 'CLARO',
    etiqueta: 'Equipos CLARO (comodato)',
    destino: 'Inventario · comodato CLARO',
    nombres: [],
    contiene: 'CLARO',
    campos: [
      { id: 'serial', etiqueta: 'Serial', obligatorio: true, alias: ['SERIAL', 'IMEI'] },
      { id: 'marca', etiqueta: 'Marca', alias: ['MARCA'] },
      { id: 'linea', etiqueta: 'Línea telefónica', alias: ['LINEA', 'LÍNEA', 'NUMERO', 'NÚMERO'] },
      { id: 'operacion', etiqueta: 'Operación', alias: ['OPERACION', 'OPERACIÓN'] },
      { id: 'estado', etiqueta: 'Estado', alias: ['ESTADO'] },
      { id: 'observacion', etiqueta: 'Observación', alias: ['OBSERVACION', 'OBSERVACIÓN', 'OBSERVACIONES'] },
    ],
  },
];

export const HOJA_POR_ID: Record<HojaId, HojaDef> = Object.fromEntries(
  HOJAS.map((h) => [h.id, h]),
) as Record<HojaId, HojaDef>;

/**
 * Qué clase de hoja es, a partir de su nombre. `null` = no se reconoció, y
 * entonces es el usuario quien lo dice en el paso de mapeo.
 *
 * Se mira hoja por hoja (no "una hoja por clase"), así que un libro puede traer
 * varias del mismo tipo: dos inventarios de sedes distintas, SALIDAS partidas
 * por año, más de una hoja de comodato.
 */
export function tipoDeHoja(nombre: string): HojaId | null {
  const n = normNombre(nombre);
  if (!n) return null;

  // Las reglas por "contiene" van primero: «EQUIPOS CLARO BOGOTA» es una hoja de
  // comodato, no un inventario que empieza por EQUIPOS.
  for (const def of HOJAS) {
    if (def.contiene && n.includes(normNombre(def.contiene))) return def.id;
  }
  for (const def of HOJAS) {
    if (def.nombres.some((x) => normNombre(x) === n)) return def.id;
  }
  // El nombre conocido seguido de algo más: «SALIDAS 2026», «BD_EQUIPOS MEDELLIN».
  for (const def of HOJAS) {
    if (def.nombres.some((x) => n.startsWith(`${normNombre(x)} `))) return def.id;
  }
  return null;
}

/** Propuesta de mapeo para una hoja: qué columna alimenta cada campo por defecto. */
export function mapeoDeColumnas(def: HojaDef, columnas: string[]): {
  campos: Record<string, string | null>;
  extras: Record<string, ModoExtra>;
} {
  const campos: Record<string, string | null> = {};
  for (const c of def.campos) campos[c.id] = null;
  const extras: Record<string, ModoExtra> = {};
  for (const col of columnas) {
    const campoId = campoParaColumna(def, col);
    if (campoId && campos[campoId] == null) campos[campoId] = col;
    else extras[col] = 'IGNORAR';
  }
  return { campos, extras };
}

/** Para una columna dada, ¿qué campo la reclama por defecto? El primer alias que calce. */
export function campoParaColumna(def: HojaDef, columna: string): string | null {
  const objetivo = normNombre(columna);
  for (const campo of def.campos) {
    if (campo.alias.some((a) => normNombre(a) === objetivo)) return campo.id;
  }
  return null;
}

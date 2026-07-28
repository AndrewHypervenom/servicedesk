/**
 * Búsqueda de personas en la planta.
 *
 * Buscar "camilo" y que aparezca Juan Pérez —porque su líder se llama Camilo—
 * es desconcertante: uno busca personas, no menciones. Pero descartar esas
 * coincidencias tampoco sirve, porque a veces se busca justamente por correo o
 * por el nombre del jefe.
 *
 * La salida entonces distingue dos cosas:
 *
 *   · coincidencia DIRECTA — todos los términos están en el nombre o la cédula.
 *     Es lo que la gente espera y va primero.
 *   · coincidencia INDIRECTA — algún término solo aparece en otro campo. Se
 *     muestra después y diciendo por dónde coincidió, para que nadie tenga que
 *     adivinar qué hace ese resultado ahí.
 *
 * `partirResaltado` cierra el círculo: marca en el texto original el trozo que
 * casó, incluso cuando el usuario escribió sin tildes o la cédula lleva puntos.
 */

import type { Colaborador } from '@/types';
import { normNombre } from '@/lib/importador/normalizar';

/** Campos que sí se buscan, pero que no identifican a la persona. */
export const CAMPOS_SECUNDARIOS = [
  'correo', 'correo_personal', 'cargo', 'area', 'ciudad',
  'proyecto', 'centro_costos', 'lider', 'coordinador', 'gerente', 'telefono',
] as const;

export type CampoSecundario = (typeof CAMPOS_SECUNDARIOS)[number];

/** Clave i18n con la etiqueta visible de cada campo secundario. */
export const ETIQUETA_CAMPO: Record<CampoSecundario, string> = {
  correo: 'colabField.correo',
  correo_personal: 'colabField.correoPersonal',
  cargo: 'colabField.cargo',
  area: 'colabField.area',
  ciudad: 'colabField.ciudad',
  proyecto: 'colabField.proyecto',
  centro_costos: 'colabField.centroCostos',
  lider: 'colabField.lider',
  coordinador: 'colabField.coordinador',
  gerente: 'colabField.gerente',
  telefono: 'colabField.telefono',
};

interface CampoIndexado {
  campo: CampoSecundario;
  /** Valor tal como se muestra, para poder citarlo en la tarjeta. */
  valor: string;
  norm: string;
}

export interface EntradaIndice {
  /** Nombre y cédula juntos: lo que identifica a la persona. */
  primario: string;
  secundarios: CampoIndexado[];
}

/** Índice de búsqueda por cédula. Se calcula una vez por carga, no por tecla. */
export function construirIndice(colabs: Colaborador[]): Map<string, EntradaIndice> {
  const m = new Map<string, EntradaIndice>();
  for (const c of colabs) {
    const secundarios: CampoIndexado[] = [];
    for (const campo of CAMPOS_SECUNDARIOS) {
      const v = c[campo];
      if (typeof v !== 'string' || !v.trim()) continue;
      secundarios.push({ campo, valor: v, norm: normNombre(v) });
    }
    m.set(c.cedula, { primario: normNombre(`${c.nombre} ${c.cedula}`), secundarios });
  }
  return m;
}

/** Los términos de la caja de búsqueda, ya normalizados. */
export function terminosDe(q: string): string[] {
  return normNombre(q).split(' ').filter(Boolean);
}

export interface Coincidencia {
  campo: CampoSecundario;
  valor: string;
}

export interface Resultado {
  colaborador: Colaborador;
  /** true cuando todos los términos están en el nombre o la cédula. */
  directo: boolean;
  /** Por dónde coincidió cuando no fue por nombre ni cédula. */
  coincidencias: Coincidencia[];
}

/**
 * Evalúa a una persona contra los términos. Devuelve `null` si no coincide.
 *
 * Todos los términos deben aparecer en algún lado ("juan bogota" busca ambos),
 * pero solo cuenta como directa si ninguno necesitó salir del nombre/cédula.
 */
export function evaluar(
  c: Colaborador,
  entrada: EntradaIndice | undefined,
  terminos: string[],
): Resultado | null {
  if (!terminos.length) return { colaborador: c, directo: true, coincidencias: [] };
  if (!entrada) return null;

  const pendientes = terminos.filter((t) => !entrada.primario.includes(t));
  if (!pendientes.length) return { colaborador: c, directo: true, coincidencias: [] };

  // Se conserva el orden de CAMPOS_SECUNDARIOS: el primero que casa es el que
  // se enseña, y los campos están declarados de más a menos explicativo.
  const vistos = new Map<CampoSecundario, string>();
  for (const t of pendientes) {
    const casan = entrada.secundarios.filter((s) => s.norm.includes(t));
    if (!casan.length) return null;
    for (const s of casan) if (!vistos.has(s.campo)) vistos.set(s.campo, s.valor);
  }

  return {
    colaborador: c,
    directo: false,
    coincidencias: [...vistos].map(([campo, valor]) => ({ campo, valor })),
  };
}

export interface Segmento {
  texto: string;
  /** true cuando este trozo casó con lo que se escribió. */
  hit: boolean;
}

/** Normaliza conservando de dónde salió cada carácter del texto original. */
function normalizarConIndice(texto: string): { n: string; idx: number[] } {
  let n = '';
  const idx: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (/^[A-Z0-9]$/.test(ch)) { n += ch; idx.push(i); }
  }
  return { n, idx };
}

/**
 * Parte un texto en trozos marcando los que casaron con los términos.
 *
 * Compara sobre la forma normalizada (sin tildes ni puntuación) pero devuelve
 * el texto original, así "PEÑA" se resalta buscando "pena" y "1.014.186.395"
 * buscando "1014".
 */
export function partirResaltado(texto: string, terminos: string[]): Segmento[] {
  if (!texto) return [];
  if (!terminos.length) return [{ texto, hit: false }];

  const { n, idx } = normalizarConIndice(texto);
  const marcado = new Array<boolean>(texto.length).fill(false);
  let hubo = false;

  for (const t of terminos) {
    let desde = n.indexOf(t);
    while (desde !== -1) {
      hubo = true;
      // El rango va del primer al último carácter original, así la puntuación
      // que quedó en medio ("1.014") se resalta junto con los dígitos.
      for (let i = idx[desde]; i <= idx[desde + t.length - 1]; i++) marcado[i] = true;
      desde = n.indexOf(t, desde + 1);
    }
  }
  if (!hubo) return [{ texto, hit: false }];

  const segs: Segmento[] = [];
  for (let i = 0; i < texto.length; i++) {
    const ultimo = segs[segs.length - 1];
    if (ultimo && ultimo.hit === marcado[i]) ultimo.texto += texto[i];
    else segs.push({ texto: texto[i], hit: marcado[i] });
  }
  return segs;
}

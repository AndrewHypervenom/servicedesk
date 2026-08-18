/**
 * El vocabulario del control de tickets y las cuentas que se hacen sobre él.
 *
 * El archivo del que sale esta pantalla lo llena gente distinta cada mes, así
 * que el mismo valor viene escrito de varias formas: "Baja", "baja" y " " en la
 * columna de prioridad; "100%" y "70%" en la de cumplimiento; fechas que unas
 * veces son número de serie de Excel y otras texto "8/4/26". Todo eso se
 * canoniza aquí, en un solo sitio, para que la tabla, los filtros y los
 * gráficos cuenten lo mismo.
 */

import type { EstadoTicket, PrioridadTicket, Ticket } from '@/types';

export const ESTADOS: EstadoTicket[] = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA'];
export const PRIORIDADES: PrioridadTicket[] = ['ALTA', 'MEDIA', 'BAJA'];

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Mayúsculas, sin acentos y sin espacios de sobra: la forma para comparar. */
const canon = (v: unknown): string =>
  sinAcentos(String(v ?? '').trim().replace(/\s+/g, ' ')).toUpperCase();

/**
 * "En progreso", "EN PROCESO", "Completada" → el estado canónico.
 *
 * Se compara por raíz y no por igualdad porque el archivo alterna sinónimos
 * ("En progreso" / "En proceso", "Completada" / "Cerrada"). Lo que no se
 * reconoce cae en PENDIENTE: una fila sin estado legible es trabajo por hacer,
 * no trabajo hecho, y equivocarse hacia el lado del pendiente es el error
 * barato.
 */
export function estadoCanonico(v: unknown): EstadoTicket {
  const e = canon(v);
  if (!e) return 'PENDIENTE';
  if (e.startsWith('COMPLET') || e.startsWith('CERRAD') || e.startsWith('FINALIZ')
    || e.startsWith('RESUELT')) return 'COMPLETADA';
  if (e.startsWith('BLOQUE') || e.startsWith('DETENID') || e.startsWith('CANCELAD')) return 'BLOQUEADA';
  if (e.includes('PROGRESO') || e.includes('PROCESO') || e.startsWith('CURSO')
    || e.startsWith('GESTION')) return 'EN_PROGRESO';
  return 'PENDIENTE';
}

/** "Baja", "baja ", "BAJA" → BAJA. Vacío → null: prioridad sin asignar. */
export function prioridadCanonica(v: unknown): PrioridadTicket | null {
  const p = canon(v);
  if (!p) return null;
  if (p.startsWith('ALT') || p.startsWith('URGENT') || p.startsWith('CRITIC')) return 'ALTA';
  if (p.startsWith('MEDI') || p.startsWith('NORMAL')) return 'MEDIA';
  if (p.startsWith('BAJ')) return 'BAJA';
  return null;
}

/**
 * "100%", "70 %", 0.7, "70" → 70.
 *
 * Excel guarda los porcentajes con formato como fracción (0.7) y sin formato
 * como texto ("70%"). Los dos llegan a esta función y los dos significan lo
 * mismo, así que un número entre 0 y 1 se lee como fracción — salvo el 1, que
 * es ambiguo y se resuelve como 100%, que es lo que dice el archivo real.
 */
export function cumplimientoCanonico(v: unknown): number | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().replace('%', '').replace(',', '.');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  const pct = typeof v === 'number' && n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** La descripción como se guarda: mayúsculas y sin espacios de sobra.
 *  Forma parte de la identidad de la fila, así que tiene que ser estable. */
export function descripcionCanonica(v: unknown): string | null {
  const d = String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return d === '' ? null : d;
}

/** El número de ticket sin el tabulador ni los espacios que trae el archivo. */
export function ticketCanonico(v: unknown): string | null {
  const t = String(v ?? '').replace(/\s+/g, '').trim();
  return t === '' ? null : t;
}

/**
 * Una fecha de la hoja en ISO ('AAAA-MM-DD').
 *
 * En el libro conviven dos formas: el número de serie de Excel (lo normal) y
 * el texto "8/4/26", que es MES/DÍA/AÑO porque el archivo se creó con la
 * configuración de Estados Unidos. Leerlo como día/mes convertiría el 8 de
 * abril en el 4 de agosto, así que el orden se fija aquí y no se adivina.
 */
export function fechaISO(v: unknown): string | null {
  if (v == null || v === '') return null;

  if (typeof v === 'number' && Number.isFinite(v)) return desdeSerialExcel(v);

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getFullYear()}-${dos(v.getMonth() + 1)}-${dos(v.getDate())}`;
  }

  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // Un número guardado como texto sigue siendo un serial de Excel.
  if (/^\d+(\.\d+)?$/.test(s)) return desdeSerialExcel(parseFloat(s));

  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const mes = Number(m[1]);
  const dia = Number(m[2]);
  let anio = Number(m[3]);
  if (anio < 100) anio += 2000;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return `${anio}-${dos(mes)}-${dos(dia)}`;
}

const dos = (n: number) => String(n).padStart(2, '0');

/** El serial de Excel cuenta días desde el 30/12/1899 (con su bug del 1900). */
function desdeSerialExcel(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(Date.UTC(1899, 11, 30));
  d.setUTCDate(d.getUTCDate() + Math.floor(n));
  const iso = d.toISOString().slice(0, 10);
  // Fuera de rango razonable es un error de captura, no una fecha.
  return iso >= '1990-01-01' && iso <= '2100-12-31' ? iso : null;
}

/** Días calendario entre dos fechas ISO. La misma cuenta que hace la base. */
export function diasEntre(inicio?: string | null, fin?: string | null): number | null {
  if (!inicio || !fin) return null;
  const a = Date.parse(`${inicio}T00:00:00Z`);
  const b = Date.parse(`${fin}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** El mes de un ticket, 'AAAA-MM'. Es el eje por el que se carga y se compara. */
export function periodoDe(fechaInicio?: string | null): string | null {
  return fechaInicio && fechaInicio.length >= 7 ? fechaInicio.slice(0, 7) : null;
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** '2026-06' → 'Junio 2026'. Para los selectores y los títulos. */
export function etiquetaPeriodo(periodo?: string | null): string {
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) return '—';
  const [a, m] = periodo.split('-');
  const nombre = MESES_ES[Number(m) - 1] ?? m;
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${a}`;
}

/**
 * El mes que sugiere el nombre de una hoja ("JUNIO" → 06).
 *
 * Solo se usa como último recurso, cuando la fila no trae fecha de inicio: una
 * hoja llamada "ABRIL Y MAYO" nombra dos meses, así que se queda con el
 * primero. La fecha de la propia fila siempre manda sobre esto.
 */
export function mesDeHoja(nombreHoja: string): number | null {
  const h = canon(nombreHoja);
  for (let i = 0; i < MESES_ES.length; i++) {
    if (h.includes(canon(MESES_ES[i]))) return i + 1;
  }
  return null;
}

/** Clases del distintivo de estado. El color acompaña a la etiqueta, no la sustituye. */
export const COLOR_ESTADO: Record<EstadoTicket, string> = {
  COMPLETADA: 'bg-success/15 text-emerald-700 dark:text-success',
  EN_PROGRESO: 'bg-info/20 text-magenta-600 dark:text-info',
  PENDIENTE: 'bg-warning/20 text-amber-700 dark:text-warning',
  BLOQUEADA: 'bg-danger/15 text-red-600 dark:text-danger',
};

export const COLOR_PRIORIDAD: Record<PrioridadTicket, string> = {
  ALTA: 'bg-danger/15 text-red-600 dark:text-danger',
  MEDIA: 'bg-warning/20 text-amber-700 dark:text-warning',
  BAJA: 'bg-ink-300/20 text-ink-500 dark:text-ink-300',
};

/** Clave i18n de cada estado y prioridad. */
export const ETIQUETA_ESTADO: Record<EstadoTicket, string> = {
  COMPLETADA: 'tickets.stDone',
  EN_PROGRESO: 'tickets.stProgress',
  PENDIENTE: 'tickets.stPending',
  BLOQUEADA: 'tickets.stBlocked',
};

export const ETIQUETA_PRIORIDAD: Record<PrioridadTicket, string> = {
  ALTA: 'tickets.prHigh',
  MEDIA: 'tickets.prMedium',
  BAJA: 'tickets.prLow',
};

/** Color de serie para los gráficos, uno por estado y siempre el mismo. */
export function colorEstado(e: EstadoTicket, oscuro: boolean): string {
  const claro: Record<EstadoTicket, string> = {
    COMPLETADA: '#0a9038', EN_PROGRESO: '#1d6fd4', PENDIENTE: '#b8860b', BLOQUEADA: '#b3261e',
  };
  const osc: Record<EstadoTicket, string> = {
    COMPLETADA: '#17a94f', EN_PROGRESO: '#3d84d6', PENDIENTE: '#e0b341', BLOQUEADA: '#e0685f',
  };
  return (oscuro ? osc : claro)[e];
}

/**
 * ¿Este ticket sigue abierto?
 *
 * Todo lo que no está completado cuenta como abierto, incluido lo bloqueado:
 * un ticket detenido por un tercero sigue siendo trabajo que la mesa tiene
 * encima, y esconderlo del conteo es justo lo que hacía el archivo.
 */
export const estaAbierto = (t: Ticket): boolean => t.estado !== 'COMPLETADA';

/**
 * Los días que lleva un ticket a día de hoy.
 *
 * Si está cerrado son los días que tardó; si sigue abierto, los que lleva
 * esperando. Es lo mismo que hacía la fórmula del archivo, que para las filas
 * sin fecha de fin contaba `TODAY() - inicio`. La diferencia está en que allí
 * el resultado se recalculaba al abrir el libro y se podía pisar escribiendo
 * encima —en dos filas del archivo real pasó—, y aquí sale de las fechas
 * siempre.
 */
export function diasTranscurridos(t: Ticket, hoy = new Date()): number | null {
  if (!t.fecha_inicio) return null;
  const fin = t.fecha_fin ?? hoy.toISOString().slice(0, 10);
  return diasEntre(t.fecha_inicio, fin);
}

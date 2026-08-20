/**
 * Quién está saliendo de la empresa y qué equipos sigue teniendo.
 *
 * La pregunta que resuelve este módulo es una sola: "¿entregó el equipo este
 * colaborador?". Para poder hacerla a tiempo hay que detectar antes la salida,
 * y la base de Talento Humano la anuncia de tres maneras distintas, ninguna
 * pensada para el Service Desk:
 *
 *   · TERMINO CONTRATO dice "FIJO" y hay una fecha de fin → va a salir.
 *   · FECHA DE RETIRO trae una fecha → salió, o tiene día marcado.
 *   · ESTATUS INTERNO deja de ser ACTIVO → ya salió, con o sin fecha.
 *
 * Las tres se leen aquí y se traducen a una sola idea (`Salida`) con su motivo,
 * porque en pantalla se ven mezcladas y ordenadas por urgencia, no por regla.
 *
 * Todo es cálculo en memoria sobre listas que la app ya tiene cargadas
 * (colaboradores, equipos, líneas): no hay consulta nueva por persona, que con
 * ~2.000 colaboradores serían 2.000 peticiones.
 */

import { diasRestantes } from '@/lib/format';
import { esEstatusActivo } from '@/lib/colaboradores/estatus';
import { normNombre } from '@/lib/importador/normalizar';
import type { Colaborador, Equipo, LineaMovil, RevisionSalida } from '@/types';

/** Qué regla disparó la alerta. Se muestra en la fila: sin el porqué, un aviso
 *  sobre alguien que sigue "activo" parece un error de los datos. */
export type MotivoSalida = 'CONTRATO_POR_VENCER' | 'RETIRO_REGISTRADO' | 'ESTATUS_RETIRO';

/** Si la salida está por venir o ya ocurrió. Es lo que separa "avisar a tiempo"
 *  de "ir a buscar el equipo". */
export type FaseSalida = 'PROXIMA' | 'RETIRADO';

export interface Salida {
  colaborador: Colaborador;
  fase: FaseSalida;
  motivo: MotivoSalida;
  /** Día de la salida. `null` cuando solo el estatus la delata. */
  fecha: string | null;
  /** Días hasta la salida; negativo si ya pasó. `null` sin fecha. */
  dias: number | null;
  /** Equipos todavía en su poder (ASIGNADO). */
  equipos: Equipo[];
  /** Líneas móviles todavía a su nombre. */
  lineas: LineaMovil[];
  /** Equipos + líneas sin devolver. */
  pendientes: number;
  revision: RevisionSalida | null;
  /** Falta resolverla: hay pendientes y nadie ha respondido, o se respondió
   *  que no entregó. */
  abierta: boolean;
  /**
   * Se respondió que entregó (o que no tenía nada) pero sigue habiendo equipos
   * a su nombre. No se corrige solo: o la devolución no se registró, o le
   * volvieron a asignar algo después de responder.
   */
  contradictoria: boolean;
}

/**
 * Contratos con fecha de fin conocida.
 *
 * El indefinido no vence, y por eso una fecha de retiro en un indefinido no es
 * un contrato por vencer sino una salida ya decidida — la diferencia importa,
 * porque con el fijo se puede agendar la recogida meses antes.
 */
export function esContratoFijo(termino?: string | null): boolean {
  const n = normNombre(termino);
  if (!n) return false;
  return ['FIJO', 'OBRA', 'LABOR', 'TEMPORAL', 'APRENDIZ', 'PRACTICANTE'].some((p) => n.includes(p));
}

/** ¿Esta persona sigue vinculada? El estatus manda; el booleano es el respaldo
 *  para las fichas creadas a mano, que no traen estatus. */
function sigueVinculado(c: Colaborador): boolean {
  return c.estado_interno ? esEstatusActivo(c.estado_interno) : c.activo;
}

/** Fecha de retiro utilizable: la base trae celdas con un espacio en blanco. */
function fechaRetiro(c: Colaborador): string | null {
  const f = c.fecha_retiro?.trim();
  return f ? f : null;
}

export interface EntradaSalidas {
  colaboradores: Colaborador[];
  equipos: Equipo[];
  lineas: LineaMovil[];
  revisiones: RevisionSalida[];
  /** Con cuántos días de anticipación se avisa de una salida futura. */
  umbralDias?: number;
  /**
   * Cuánto hacia atrás sigue siendo noticia una salida ya saldada.
   *
   * Sin este corte la lista sería la planta retirada entera —más de quinientas
   * personas en la base actual—, y "salidas resueltas" acabaría contando gente
   * que se fue hace tres años. Lo que tiene equipo pendiente NO caduca: ese
   * portátil sigue fuera por viejo que sea el retiro.
   */
  diasHistoria?: number;
}

/** La salida sigue dando trabajo: falta responderla, o la respuesta no cuadra
 *  con lo que dice el inventario. Es el criterio de "pendiente" en todas las
 *  pantallas; escribirlo dos veces sería tener dos definiciones. */
export function sinResolver(s: Salida): boolean {
  return s.abierta || s.contradictoria;
}

/**
 * Todas las salidas vivas, ordenadas por urgencia.
 *
 * Orden: primero lo que ya pasó y sigue sin resolverse (cuanto más viejo, más
 * arriba: es el equipo que más cuesta recuperar), después lo que viene (cuanto
 * más cerca, más arriba). Lo ya resuelto baja al final, porque se consulta,
 * no se trabaja.
 */
export function detectarSalidas({
  colaboradores, equipos, lineas, revisiones, umbralDias = 30, diasHistoria = 90,
}: EntradaSalidas): Salida[] {
  // Solo cuenta lo que sigue en sus manos: un equipo ya en devolución está de
  // camino a bodega y preguntarlo otra vez sería ruido.
  const porCedula = new Map<string, Equipo[]>();
  for (const e of equipos) {
    if (!e.cedula_asignado || e.estado_asignacion !== 'ASIGNADO') continue;
    const previos = porCedula.get(e.cedula_asignado);
    if (previos) previos.push(e); else porCedula.set(e.cedula_asignado, [e]);
  }

  const lineasPorCedula = new Map<string, LineaMovil[]>();
  for (const l of lineas) {
    if (!l.cedula_asignado) continue;
    const previas = lineasPorCedula.get(l.cedula_asignado);
    if (previas) previas.push(l); else lineasPorCedula.set(l.cedula_asignado, [l]);
  }

  const porRevisar = new Map(revisiones.map((r) => [r.cedula, r]));

  const salidas: Salida[] = [];

  for (const c of colaboradores) {
    const fecha = fechaRetiro(c);
    const dias = fecha ? diasRestantes(fecha) : null;
    const vinculado = sigueVinculado(c);

    let fase: FaseSalida;
    let motivo: MotivoSalida;

    if (!vinculado) {
      fase = 'RETIRADO';
      // El estatus es el dato más explícito ("RENUNCIA VOLUNTARIA"): cuando lo
      // hay, es el que se enseña, aunque además exista fecha de retiro.
      motivo = c.estado_interno ? 'ESTATUS_RETIRO' : 'RETIRO_REGISTRADO';
    } else if (fecha && dias !== null && dias < 0) {
      // Sigue marcado como activo pero su fecha de retiro ya pasó: la base va
      // con retraso. Se trata como retirado — el equipo hay que ir a buscarlo.
      fase = 'RETIRADO';
      motivo = 'RETIRO_REGISTRADO';
    } else if (fecha && dias !== null && dias <= umbralDias) {
      fase = 'PROXIMA';
      motivo = esContratoFijo(c.termino_contrato) ? 'CONTRATO_POR_VENCER' : 'RETIRO_REGISTRADO';
    } else {
      continue; // Ni sale ni ha salido.
    }

    const equiposPend = porCedula.get(c.cedula) ?? [];
    const lineasPend = lineasPorCedula.get(c.cedula) ?? [];
    const pendientes = equiposPend.length + lineasPend.length;
    const revision = porRevisar.get(c.cedula) ?? null;
    const respondidaCerrada = revision?.respuesta === 'ENTREGO' || revision?.respuesta === 'SIN_EQUIPOS';

    // Retiro viejo, sin nada a su nombre y sin nadie que lo haya tocado: es
    // historia de Talento Humano, no trabajo del Service Desk.
    if (fase === 'RETIRADO' && pendientes === 0 && !revision) {
      if (dias === null || -dias > diasHistoria) continue;
    }

    salidas.push({
      colaborador: c,
      fase,
      motivo,
      fecha,
      dias,
      equipos: equiposPend,
      lineas: lineasPend,
      pendientes,
      revision,
      abierta: pendientes > 0 && (!revision || revision.respuesta === 'NO_ENTREGO'),
      contradictoria: pendientes > 0 && respondidaCerrada,
    });
  }

  return salidas.sort(comparar);
}

/** Sin fecha se ordena al final de su grupo: un vacío no es "hoy". */
const SIN_FECHA = Number.MAX_SAFE_INTEGER;

function comparar(a: Salida, b: Salida): number {
  // Lo pendiente pesa más que lo resuelto, pase lo que pase con las fechas.
  const pa = sinResolver(a);
  const pb = sinResolver(b);
  if (pa !== pb) return pa ? -1 : 1;
  if (a.fase !== b.fase) return a.fase === 'RETIRADO' ? -1 : 1;
  const da = a.dias ?? SIN_FECHA;
  const db = b.dias ?? SIN_FECHA;
  // Retirados: el más antiguo primero (días más negativos). Próximos: el más
  // cercano primero. En ambos casos, de menor a mayor.
  return da - db || a.colaborador.nombre.localeCompare(b.colaborador.nombre);
}

export interface ResumenSalidas {
  /** Salidas futuras dentro de la ventana de aviso. */
  proximas: number;
  /** Ya retirados con algo todavía a su nombre y sin resolver. */
  retiradosConEquipo: number;
  /** Equipos + líneas sin devolver, sumando todas las salidas abiertas. */
  equiposPendientes: number;
  /** Salidas resueltas (respondidas o sin nada pendiente). */
  cerradas: number;
  /** Días de retraso promedio de las salidas abiertas ya vencidas. */
  retrasoPromedio: number;
}

export function resumirSalidas(salidas: Salida[]): ResumenSalidas {
  let proximas = 0;
  let retiradosConEquipo = 0;
  let equiposPendientes = 0;
  let cerradas = 0;
  let retrasoTotal = 0;
  let conRetraso = 0;

  for (const s of salidas) {
    if (s.fase === 'PROXIMA') proximas++;
    if (sinResolver(s)) {
      if (s.fase === 'RETIRADO') {
        // Solo cuenta lo de quien YA se fue: el portátil de quien sale el mes
        // que viene no está "sin devolver", está en uso.
        equiposPendientes += s.pendientes;
        retiradosConEquipo++;
        if (s.dias !== null && s.dias < 0) { retrasoTotal += -s.dias; conRetraso++; }
      }
    } else if (s.fase === 'RETIRADO') {
      // Las próximas no se cuentan como resueltas: todavía no han pasado.
      cerradas++;
    }
  }

  return {
    proximas,
    retiradosConEquipo,
    equiposPendientes,
    cerradas,
    retrasoPromedio: conRetraso ? Math.round(retrasoTotal / conRetraso) : 0,
  };
}

/** Clases del badge de días: rojo cuando ya venció o falta menos de una semana. */
export function colorDias(dias: number | null): string {
  if (dias === null) return 'bg-ink-300/20 text-ink-500 dark:text-ink-300';
  if (dias < 0) return 'bg-danger/12 text-red-600 dark:text-danger';
  if (dias <= 7) return 'bg-danger/12 text-red-600 dark:text-danger';
  if (dias <= 15) return 'bg-warning/15 text-amber-600 dark:text-warning';
  return 'bg-ink-300/20 text-ink-500 dark:text-ink-300';
}

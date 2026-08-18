/**
 * Panel de operaciones — la hoja "DASHBOARD" del archivo, reconstruida.
 *
 * Se respeta su disposición, que es la que la gente ya sabe leer: los seis
 * recuadros a la izquierda en dos filas de tres —TOTAL, COMPLETADAS,
 * PENDIENTES arriba; % CUMPL, EN PROCESO, BLOQUEADAS abajo— y a la derecha el
 * "📈 RESUMEN EJECUTIVO" con sus cuatro columnas: MÉTRICA, CANTIDAD, % TOTAL y
 * ESTADO, ese último con el emoji de cada métrica.
 *
 * Cambian tres cosas, y las tres por el mismo motivo:
 *
 *   · Los números se calculan sobre lo que hay en pantalla. En el archivo eran
 *     fórmulas contra un rango fijo que se quedó corto al crecer el libro: el
 *     dashboard decía 229 tickets arriba y 99 abajo, y daba "297%" de
 *     completadas. Aquí no hay rango que se quede corto.
 *   · Obedece al mes y a los filtros. La hoja era una foto del libro entero;
 *     esto responde a "¿cómo va julio?" sin tocar ninguna fórmula.
 *   · Los recuadros y las filas filtran al pulsarlos. El número que responde la
 *     pregunta es también la puerta a las filas que hay detrás.
 *
 * El emoji de la columna ESTADO es decoración heredada del archivo: va marcado
 * como tal para los lectores de pantalla, porque la métrica ya la dice su
 * nombre y el emoji no añade información, solo la repite en otro idioma.
 */

import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, ListChecks, Pause, Percent, PlayCircle,
} from 'lucide-react';
import { NumeroAnimado } from '@/components/ui/NumeroAnimado';
import { fmtDateTime } from '@/lib/format';
import { etiquetaPeriodo } from '@/lib/tickets/modelo';
import type { EstadoTicket } from '@/types';

/** Los grupos a los que puede saltar el panel. Espejo del `Foco` de la pantalla. */
export type FocoPanel = '' | EstadoTicket | 'ABIERTOS' | 'ATRASADOS';

export interface ResumenPanel {
  total: number;
  COMPLETADA: number;
  EN_PROGRESO: number;
  PENDIENTE: number;
  BLOQUEADA: number;
  atrasados: number;
  /** Promedio del %Cumpl. `null` cuando ninguna fila lo trae. */
  cumplimiento: number | null;
  /** Días medios hasta el cierre. `null` si todavía no se ha cerrado nada. */
  dias: number | null;
}

interface Props {
  panel: ResumenPanel;
  /** Qué porcentaje del total representa un número. */
  pct: (n: number) => number;
  /** Mes seleccionado ('AAAA-MM'), o '' si están todos. */
  periodo: string;
  /** Si hay algún filtro activo, el panel deja de ser el retrato del conjunto. */
  filtrado: boolean;
  /**
   * Ir a la lista de esos tickets.
   *
   * El panel no filtra sobre sí mismo: pulsar un número lleva a la tabla con
   * ese foco puesto. Filtrar el propio tablero convertía "¿cuáles son los 4
   * bloqueados?" en un tablero que decía "4 tickets, 100% bloqueadas" — cierto,
   * inútil, y sin forma evidente de volver.
   */
  onVer: (foco: FocoPanel) => void;
  /** El foco puesto ahora mismo, para que se vea cuál es sin salir del panel. */
  foco: FocoPanel;
  /** Días a partir de los cuales un ticket abierto se considera atrasado. */
  diasAtraso: number;
}

/** Recuadro grande: el número, qué es y a cuánto del total equivale. */
function Recuadro({ etiqueta, valor, sufijo, parte, icono: Icono, tono, onClick, activo }: {
  etiqueta: string;
  valor: number | null;
  sufijo?: string;
  parte?: string;
  icono: React.ElementType;
  tono: string;
  onClick?: () => void;
  /** Es el grupo que la lista está enseñando ahora mismo. */
  activo?: boolean;
}) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 truncate">
            {etiqueta}
          </div>
          <div className="text-3xl font-bold tabular-nums leading-none mt-2">
            {valor == null ? <span className="text-ink-400 text-2xl">—</span> : <NumeroAnimado value={valor} />}
            {valor != null && sufijo && <span className="text-xl font-semibold">{sufijo}</span>}
          </div>
        </div>
        <span className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${tono} text-white grid place-items-center shadow-card transition-transform group-hover:scale-105`}>
          <Icono size={18} />
        </span>
      </div>
      {parte && <div className="text-[11px] text-ink-400 mt-2">{parte}</div>}
      {/* La flecha aparece al pasar por encima: dice que el recuadro lleva a
          algún sitio, sin gritarlo seis veces cuando nadie lo está tocando. */}
      {onClick && (
        <ArrowRight
          size={14}
          className="absolute bottom-3 right-3 text-brand-600 dark:text-brand-400 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0"
        />
      )}
    </>
  );

  return onClick
    ? (
      <button
        onClick={onClick} aria-pressed={activo}
        className={`card-interactive relative p-4 text-left group w-full h-full transition-shadow ${
          activo ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-ink-50 dark:ring-offset-ink-900' : ''
        }`}
      >
        {contenido}
      </button>
    )
    : <div className="card relative p-4 group h-full">{contenido}</div>;
}

/** Una fila del resumen ejecutivo: métrica, cantidad, % del total y su emoji. */
function Fila({ etiqueta, cantidad, porcentaje, emoji, icono: Icono, onClick, aparte }: {
  etiqueta: string;
  cantidad: React.ReactNode;
  porcentaje?: string;
  emoji: string;
  icono: React.ElementType;
  onClick?: () => void;
  /** Las medidas de tiempo no son un reparto del total: van separadas. */
  aparte?: boolean;
}) {
  const celdas = (
    <>
      <span className="flex items-center gap-2 min-w-0">
        <Icono size={13} className="shrink-0 text-ink-400" />
        <span className="truncate">{etiqueta}</span>
      </span>
      <span className="text-right font-semibold tabular-nums">{cantidad}</span>
      <span className="text-right tabular-nums text-ink-400 text-xs">{porcentaje ?? ''}</span>
      <span className="text-center text-sm leading-none" aria-hidden>{emoji}</span>
    </>
  );

  const clases = `grid grid-cols-[1fr_3.5rem_3rem_1.75rem] items-center gap-2 px-2 py-2 rounded-lg text-sm ${
    aparte ? 'text-ink-500 dark:text-ink-300' : ''
  }`;
  return onClick
    ? (
      <button onClick={onClick} className={`${clases} w-full text-left hover:bg-ink-100/70 dark:hover:bg-white/5 transition-colors`}>
        {celdas}
      </button>
    )
    : <div className={clases}>{celdas}</div>;
}

export function PanelOperaciones({
  panel, pct, periodo, filtrado, onVer, foco, diasAtraso,
}: Props) {
  const { t, i18n } = useTranslation();

  const alcance = periodo
    ? etiquetaPeriodo(periodo)
    : filtrado ? t('tickets.panelScopeFiltered') : t('tickets.panelScopeAll');

  const porcentaje = (n: number) => `${pct(n)}%`;

  return (
    <div className="space-y-4">
      {/* Cabecera: qué se está mirando y desde cuándo. En el archivo la fecha
          era un texto que había que reescribir a mano ("Actualizado: 13 de Mayo
          de 2026 - 14:11"), así que envejecía sin que nadie lo notara. */}
      <div className="card p-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{t('tickets.panelTitle')}</h2>
          {/* Sobre cuántos tickets y con qué alcance: lo dice el panel mismo,
              porque es la primera pregunta al mirar un número grande. */}
          <p className="text-sm text-ink-400">
            {t('tickets.ticketsCount', { count: panel.total })} · {alcance}
          </p>
        </div>
        <p className="text-xs text-ink-400">
          {t('tickets.panelUpdated', { fecha: fmtDateTime(new Date().toISOString(), i18n.language) })}
        </p>
      </div>

      {/* Recuadros a la izquierda, resumen a la derecha: la misma disposición
          de la hoja. En pantalla estrecha se apilan, que es lo único que el
          Excel no podía hacer. */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:items-start">
        <div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Recuadro
            etiqueta={t('tickets.panelTotal')} valor={panel.total} icono={ListChecks}
            tono="from-brand-400 to-brand-600" onClick={() => onVer('')}
          />
          <Recuadro
            etiqueta={t('tickets.stDone')} valor={panel.COMPLETADA} icono={CheckCircle2}
            tono="from-emerald-400 to-emerald-600"
            parte={t('tickets.panelOfTotal', { pct: pct(panel.COMPLETADA) })}
            onClick={() => onVer('COMPLETADA')} activo={foco === 'COMPLETADA'}
          />
          <Recuadro
            etiqueta={t('tickets.stPending')} valor={panel.PENDIENTE} icono={Clock}
            tono="from-amber-400 to-amber-600"
            parte={t('tickets.panelOfTotal', { pct: pct(panel.PENDIENTE) })}
            onClick={() => onVer('PENDIENTE')} activo={foco === 'PENDIENTE'}
          />
          {/* No filtra: el cumplimiento es una media, no un grupo de filas. */}
          <Recuadro
            etiqueta={t('tickets.panelCompliance')} valor={panel.cumplimiento} sufijo="%"
            icono={Percent} tono="from-violet-400 to-violet-600"
            parte={panel.cumplimiento == null ? t('tickets.panelNoCompliance') : undefined}
          />
          <Recuadro
            etiqueta={t('tickets.stProgress')} valor={panel.EN_PROGRESO} icono={PlayCircle}
            tono="from-sky-400 to-sky-600"
            parte={t('tickets.panelOfTotal', { pct: pct(panel.EN_PROGRESO) })}
            onClick={() => onVer('EN_PROGRESO')} activo={foco === 'EN_PROGRESO'}
          />
          <Recuadro
            etiqueta={t('tickets.stBlocked')} valor={panel.BLOQUEADA} icono={Pause}
            tono="from-red-400 to-red-600"
            parte={t('tickets.panelOfTotal', { pct: pct(panel.BLOQUEADA) })}
            onClick={() => onVer('BLOQUEADA')} activo={foco === 'BLOQUEADA'}
          />
        </div>
        <p className="text-[11px] text-ink-400 mt-2 px-1">{t('tickets.panelGoHint')}</p>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">📈 {t('tickets.panelSummary')}</h3>

          <div className="grid grid-cols-[1fr_3.5rem_3rem_1.75rem] gap-2 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-400 border-b border-ink-100 dark:border-white/10">
            <span>{t('tickets.panelMetric')}</span>
            <span className="text-right">{t('tickets.panelAmount')}</span>
            <span className="text-right">{t('tickets.panelShare')}</span>
            <span className="text-center">{t('tickets.panelStatus')}</span>
          </div>

          <div className="divide-y divide-ink-100/70 dark:divide-white/5">
            <Fila
              etiqueta={t('tickets.panelTotalTickets')} icono={ListChecks} emoji="📊"
              cantidad={panel.total} porcentaje={panel.total ? '100%' : '0%'}
              onClick={() => onVer('')}
            />
            <Fila
              etiqueta={t('tickets.stDone')} icono={CheckCircle2} emoji="✅"
              cantidad={panel.COMPLETADA} porcentaje={porcentaje(panel.COMPLETADA)}
              onClick={() => onVer('COMPLETADA')}
            />
            <Fila
              etiqueta={t('tickets.stPending')} icono={Clock} emoji="⏳"
              cantidad={panel.PENDIENTE} porcentaje={porcentaje(panel.PENDIENTE)}
              onClick={() => onVer('PENDIENTE')}
            />
            <Fila
              etiqueta={t('tickets.stProgress')} icono={PlayCircle} emoji="⚙️"
              cantidad={panel.EN_PROGRESO} porcentaje={porcentaje(panel.EN_PROGRESO)}
              onClick={() => onVer('EN_PROGRESO')}
            />
            <Fila
              etiqueta={t('tickets.stBlocked')} icono={Pause} emoji="🚨"
              cantidad={panel.BLOQUEADA} porcentaje={porcentaje(panel.BLOQUEADA)}
              onClick={() => onVer('BLOQUEADA')}
            />
            {/* Días promedio va sin porcentaje, igual que en la hoja: no es una
                parte del total, es una medida de tiempo. */}
            <Fila
              etiqueta={t('tickets.panelAvgDays')} icono={Clock} emoji="⏱️" aparte
              cantidad={panel.dias == null ? '—' : panel.dias.toFixed(2)}
            />
            {/* Esta no estaba en la hoja. Los días de un ticket abierto sí los
                tenía —su fórmula contaba hasta hoy—, pero nada los agregaba: el
                dato estaba fila por fila y nadie lo miraba, así que un ticket
                podía llevar tres meses esperando sin que saliera en ningún
                resumen. */}
            <Fila
              etiqueta={t('tickets.kpiLate', { dias: diasAtraso })} icono={AlertTriangle}
              emoji="⚠️" aparte cantidad={panel.atrasados}
              onClick={panel.atrasados ? () => onVer('ATRASADOS') : undefined}
            />
          </div>

          <p className="text-[11px] text-ink-400 mt-3 px-2">{t('tickets.panelSummaryHint')}</p>
        </div>
      </div>
    </div>
  );
}

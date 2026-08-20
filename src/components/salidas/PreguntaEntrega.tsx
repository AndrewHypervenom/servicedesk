/**
 * "¿Entregó el equipo este colaborador?" — la pregunta y su respuesta.
 *
 * Es el único sitio donde se responde, y lo usan tanto la pantalla de Salidas
 * como el aviso del panel: la pregunta tiene que verse y contestarse igual en
 * los dos, porque es la misma decisión con las mismas consecuencias.
 *
 * Tres respuestas, no dos. "No tenía equipos" existe porque la alerta también
 * salta con líneas móviles o con asignaciones viejas mal cerradas, y sin esa
 * salida la única forma de quitar el aviso sería mentir en una de las otras.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CircleSlash, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fmtDateTime } from '@/lib/format';
import type { Salida } from '@/lib/salidas';
import type { RespuestaEntrega } from '@/types';

interface Props {
  salida: Salida;
  onResponder: (r: RespuestaEntrega) => void;
  onDeshacer: () => void;
  /** Falso para quien solo consulta, o mientras la tabla no exista todavía. */
  puedeResponder: boolean;
  guardando?: boolean;
  /** Versión de una línea, para el aviso del panel. */
  compacto?: boolean;
}

/** Marco de aviso: mismo cuerpo para los cuatro estados, distinto color. */
function Banda({ tono, children }: { tono: 'aviso' | 'ok' | 'malo' | 'neutro'; children: React.ReactNode }) {
  const tonos = {
    aviso: 'bg-warning/10 ring-warning/30',
    ok: 'bg-success/10 ring-success/30',
    malo: 'bg-danger/10 ring-danger/30',
    neutro: 'bg-ink-100/70 dark:bg-white/5 ring-ink-200/60 dark:ring-white/10',
  } as const;
  return (
    <div className={`rounded-2xl px-4 py-3.5 ring-1 ring-inset ${tonos[tono]}
                     flex flex-wrap items-center gap-3`}>
      {children}
    </div>
  );
}

export function PreguntaEntrega({
  salida, onResponder, onDeshacer, puedeResponder, guardando = false, compacto = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const { revision, pendientes, contradictoria } = salida;

  const cuantos = t('exits.pendingCount', { count: pendientes });

  // Todavía sin responder: la pregunta, tal cual.
  if (!revision) {
    if (pendientes === 0) return null;
    return (
      <Banda tono="aviso">
        <AlertTriangle size={20} className="text-amber-600 dark:text-warning shrink-0" />
        <div className="min-w-0">
          <div className={compacto ? 'text-sm font-semibold' : 'text-[15px] font-bold text-amber-700 dark:text-warning'}>
            {t('exits.question')}
          </div>
          {!compacto && (
            <div className="text-xs text-ink-500 dark:text-ink-300 mt-0.5">
              {t('exits.questionSub', { fecha: salida.fecha ?? '—', cuantos })}
            </div>
          )}
        </div>
        <div className="flex-1" />
        {puedeResponder ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Check} loading={guardando}
              onClick={() => onResponder('ENTREGO')}>{t('exits.answerYes')}</Button>
            <Button variant="danger" icon={XCircle} disabled={guardando}
              onClick={() => onResponder('NO_ENTREGO')}>{t('exits.answerNo')}</Button>
            <Button icon={CircleSlash} disabled={guardando}
              onClick={() => onResponder('SIN_EQUIPOS')}>{t('exits.answerNone')}</Button>
          </div>
        ) : (
          <span className="text-xs text-ink-400">{t('exits.readOnly')}</span>
        )}
      </Banda>
    );
  }

  const quien = revision.revisado_en ? fmtDateTime(revision.revisado_en, i18n.language) : '';
  const deshacer = puedeResponder && (
    <Button icon={RotateCcw} disabled={guardando} onClick={onDeshacer} className="!py-1.5 !px-3 text-xs">
      {t('exits.undo')}
    </Button>
  );

  // Respondida, pero el equipo sigue apareciendo a su nombre. No es un detalle
  // menor: mientras el equipo esté ASIGNADO no se le puede entregar a nadie.
  if (contradictoria) {
    return (
      <Banda tono="malo">
        <AlertTriangle size={20} className="text-danger shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-red-600 dark:text-danger">{t('exits.stillAssigned')}</div>
          <div className="text-xs text-ink-500 dark:text-ink-300 mt-0.5">
            {t('exits.stillAssignedSub', { cuantos })}
          </div>
        </div>
        <div className="flex-1" />
        <Link to="/devolucion" className="btn-primary !py-2 !px-3.5 text-sm">
          <Undo2 size={16} /> {t('exits.goReturn')}
        </Link>
        {deshacer}
      </Banda>
    );
  }

  if (revision.respuesta === 'ENTREGO') {
    return (
      <Banda tono="ok">
        <Check size={20} className="text-emerald-700 dark:text-success shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-emerald-700 dark:text-success">{t('exits.doneYes')}</div>
          <div className="text-xs text-ink-500 dark:text-ink-300 mt-0.5">{quien}</div>
        </div>
        <div className="flex-1" />
        {deshacer}
      </Banda>
    );
  }

  if (revision.respuesta === 'NO_ENTREGO') {
    return (
      <Banda tono="malo">
        <XCircle size={20} className="text-danger shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-red-600 dark:text-danger">{t('exits.doneNo')}</div>
          <div className="text-xs text-ink-500 dark:text-ink-300 mt-0.5">{t('exits.doneNoSub')} · {quien}</div>
        </div>
        <div className="flex-1" />
        {deshacer}
      </Banda>
    );
  }

  return (
    <Banda tono="neutro">
      <CircleSlash size={20} className="text-ink-400 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold">{t('exits.doneNone')}</div>
        <div className="text-xs text-ink-500 dark:text-ink-300 mt-0.5">{quien}</div>
      </div>
      <div className="flex-1" />
      {deshacer}
    </Banda>
  );
}

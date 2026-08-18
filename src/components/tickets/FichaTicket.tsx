/**
 * Ficha de un ticket: todo lo que se sabe de él en una pantalla.
 *
 * Lo que la tabla no puede enseñar sin volverse ilegible acaba aquí, y por
 * encima de todo las NOTAS. En el archivo eran una celda de una línea, así que
 * la gente escribía abreviado o directamente no escribía; aquí ocupan un bloque
 * propio, se leen enteras y respetan los saltos de línea.
 *
 * Los días se muestran con su significado, no como un número suelto: si el
 * ticket está cerrado son los que tardó, y si sigue abierto los que lleva
 * esperando. Es la misma cuenta que hacía la fórmula del archivo
 * (`IF(AND(E<>"";F<>"");F-E;IF(E<>"";TODAY()-E;0))`), con la diferencia de que
 * aquí nadie puede teclear un número encima.
 */

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  CalendarDays, CalendarCheck, Clock, Hash, MapPin, Pencil, Percent, StickyNote, User,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { fmtDate, fmtDateTime } from '@/lib/format';
import {
  COLOR_ESTADO, COLOR_PRIORIDAD, ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD,
  diasTranscurridos, etiquetaPeriodo,
} from '@/lib/tickets/modelo';
import type { Ticket } from '@/types';

function Dato({ etiqueta, valor, icono: Icono }: {
  etiqueta: string; valor?: React.ReactNode; icono?: React.ElementType;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1 flex items-center gap-1.5">
        {Icono && <Icono size={11} />} {etiqueta}
      </div>
      <div className="text-sm text-ink-700 dark:text-ink-100 break-words">
        {valor || <span className="text-ink-400">—</span>}
      </div>
    </div>
  );
}

interface Props {
  ticket: Ticket | null;
  /** Nombre del analista enlazado, ya resuelto por la pantalla. */
  analista?: string | null;
  sede?: string | null;
  onClose: () => void;
  onEditar?: (t: Ticket) => void;
}

export function FichaTicket({ ticket, analista, sede, onClose, onEditar }: Props) {
  const { t, i18n } = useTranslation();
  if (!ticket) return null;

  const abierto = ticket.estado !== 'COMPLETADA';
  const dias = diasTranscurridos(ticket);

  return (
    <Modal
      open={!!ticket} onClose={onClose} size="md"
      title={ticket.ticket}
      subtitle={ticket.descripcion ?? undefined}
    >
      <div className="space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className={`badge ${COLOR_ESTADO[ticket.estado]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {t(ETIQUETA_ESTADO[ticket.estado])}
          </span>
          {ticket.prioridad && (
            <span className={`badge ${COLOR_PRIORIDAD[ticket.prioridad]}`}>
              {t(ETIQUETA_PRIORIDAD[ticket.prioridad])}
            </span>
          )}
          {ticket.periodo && (
            <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200">
              <CalendarDays size={11} /> {etiquetaPeriodo(ticket.periodo)}
            </span>
          )}
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Dato etiqueta={t('tickets.fTicket')} valor={ticket.ticket} icono={Hash} />
          <Dato
            etiqueta={t('tickets.fDays')} icono={Clock}
            valor={dias == null ? null : (
              <span>
                <span className="font-semibold tabular-nums">{dias}</span>{' '}
                {abierto ? t('tickets.daysOpen') : t('tickets.daysTook')}
              </span>
            )}
          />
          <Dato etiqueta={t('tickets.fStart')} valor={fmtDate(ticket.fecha_inicio, i18n.language)} icono={CalendarDays} />
          <Dato
            etiqueta={t('tickets.fEnd')} icono={CalendarCheck}
            valor={ticket.fecha_fin
              ? fmtDate(ticket.fecha_fin, i18n.language)
              : <span className="text-amber-600 dark:text-warning">{t('tickets.stillOpen')}</span>}
          />
          {/* El analista enlazado manda; el texto del archivo se enseña debajo
              solo cuando NO coincide, que es la señal de que hay que revisarlo. */}
          <Dato
            etiqueta={t('tickets.fAnalyst')} icono={User}
            valor={analista ? (
              <span>
                {analista}
                {ticket.analista_texto && ticket.analista_texto !== analista && (
                  <span className="block text-xs text-ink-400">
                    {t('tickets.inFile')}: {ticket.analista_texto}
                  </span>
                )}
              </span>
            ) : ticket.analista_texto ? (
              <span>
                {ticket.analista_texto}
                <span className="block text-xs text-amber-600 dark:text-warning">
                  {t('tickets.notLinked')}
                </span>
              </span>
            ) : null}
          />
          <Dato
            etiqueta={t('tickets.fCity')} icono={MapPin}
            valor={sede ?? ticket.ciudad_texto}
          />
          <Dato
            etiqueta={t('tickets.fCompliance')} icono={Percent}
            valor={ticket.cumplimiento == null ? null : `${ticket.cumplimiento}%`}
          />
          <Dato etiqueta={t('tickets.fSheet')} valor={ticket.hoja_origen} />
        </div>

        {/* Las notas, enteras y con sus saltos de línea. Es el campo por el que
            existe esta ficha: en el archivo no cabían. */}
        <div className="rounded-2xl border border-ink-100 dark:border-white/10 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-2 flex items-center gap-1.5">
            <StickyNote size={11} /> {t('tickets.fNotes')}
          </div>
          {ticket.notas
            ? <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{ticket.notas}</p>
            : <p className="text-sm text-ink-400">{t('tickets.noNotes')}</p>}
        </div>

        <p className="text-[11px] text-ink-400">
          {t('tickets.updatedAt', {
            fecha: fmtDateTime(ticket.actualizado_en ?? ticket.creado_en, i18n.language),
          })}
        </p>

        {onEditar && (
          <div className="flex justify-end">
            <Button variant="primary" icon={Pencil} onClick={() => onEditar(ticket)}>
              {t('common.edit')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

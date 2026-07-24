/**
 * Ficha completa de un colaborador.
 *
 * La tarjeta del listado muestra lo justo para reconocer a la persona; aquí
 * está todo lo que trajo la base de Talento Humano, agrupado por lo que
 * responde cada bloque (quién es, desde cuándo, de quién depende), más los
 * equipos que tiene en su poder —el dato por el que se abre esta ficha nueve de
 * cada diez veces—.
 */

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Briefcase, Building2, CalendarDays, Hash, Laptop, Mail, MapPin, Phone, UserCog,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useViewingPresence } from '@/lib/presence/hooks';
import { CoeditBanner } from '@/components/presence';
import { equiposDeColaborador } from '@/lib/api';
import { antiguedadTexto, colorEstatus, estatusLegible } from '@/lib/colaboradores/estatus';
import { fmtDate, initials } from '@/lib/format';
import type { Colaborador } from '@/types';

interface Props {
  colaborador: Colaborador | null;
  /** Nombre de la sede ya resuelto por el listado (evita otra consulta). */
  sede?: string | null;
  onClose: () => void;
  onEditar?: (c: Colaborador) => void;
}

function Dato({ icono: Icono, etiqueta, valor }: {
  icono?: React.ElementType; etiqueta: string; valor?: React.ReactNode;
}) {
  const vacio = valor === null || valor === undefined || valor === '' || valor === '—';
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 flex items-center gap-1.5">
        {Icono && <Icono size={12} />} {etiqueta}
      </dt>
      <dd className={`text-sm mt-0.5 break-words ${vacio ? 'text-ink-300 dark:text-ink-500' : ''}`}>
        {vacio ? '—' : valor}
      </dd>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink-100 dark:border-white/10 p-4">
      <h4 className="text-xs font-semibold text-ink-500 dark:text-ink-300 mb-3">{titulo}</h4>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
    </section>
  );
}

export function FichaColaborador({ colaborador: c, sede, onClose, onEditar }: Props) {
  const { t } = useTranslation();
  const { data: equipos = [], isLoading } = useQuery({
    queryKey: ['equiposColab', c?.cedula],
    queryFn: () => equiposDeColaborador(c!.cedula),
    enabled: !!c,
  });

  // Presencia: viendo esta ficha. El banner avisa si alguien la está editando.
  const coeditores = useViewingPresence(
    c ? { type: 'colaborador', id: c.cedula, title: c.nombre } : null,
  );

  return (
    <Modal open={!!c} onClose={onClose} size="lg" title={c?.nombre} subtitle={c ? `C.C. ${c.cedula}` : undefined}>
      {c && (
        <div className="space-y-4">
          {coeditores.length > 0 && <CoeditBanner peers={coeditores} />}

          {/* Cabecera: quién es y en qué estado está, de un vistazo. */}
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-100 dark:border-white/10 p-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 18, stiffness: 280 }}
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center text-xl font-bold shadow-card"
            >
              {initials(c.nombre)}
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">{c.cargo ?? t('ficha.noPosition')}</div>
              <div className="text-sm text-ink-400 truncate">{c.area ?? '—'}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className={`badge ${colorEstatus(c.estado_interno ?? (c.activo ? 'ACTIVO' : ''))}`}>
                  {c.estado_interno ? estatusLegible(c.estado_interno) : c.activo ? t('collaborators.active') : t('collaborators.inactive')}
                </span>
                {c.termino_contrato && (
                  <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200">
                    {estatusLegible(c.termino_contrato)}
                  </span>
                )}
                {c.fecha_ingreso && (
                  <span className="badge bg-brand-500/10 text-brand-600 dark:text-brand-400">
                    {t('ficha.seniorityBadge', { antiguedad: antiguedadTexto(c.fecha_ingreso) })}
                  </span>
                )}
              </div>
            </div>
            {onEditar && (
              <button onClick={() => onEditar(c)} className="btn-secondary shrink-0">
                <UserCog size={15} /> {t('common.edit')}
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Grupo titulo={t('ficha.groupContact')}>
              <Dato icono={Mail} etiqueta={t('colabField.correo')} valor={c.correo} />
              <Dato icono={Mail} etiqueta={t('colabField.correoPersonal')} valor={c.correo_personal} />
              <Dato icono={Phone} etiqueta={t('colabField.telefono')} valor={c.telefono} />
              <Dato icono={CalendarDays} etiqueta={t('colabField.nacimiento')} valor={c.fecha_nacimiento ? fmtDate(c.fecha_nacimiento) : null} />
            </Grupo>

            <Grupo titulo={t('ficha.groupEmployment')}>
              <Dato icono={CalendarDays} etiqueta={t('colabField.ingreso')} valor={c.fecha_ingreso ? fmtDate(c.fecha_ingreso) : null} />
              <Dato icono={CalendarDays} etiqueta={t('colabField.retiro')} valor={c.fecha_retiro ? fmtDate(c.fecha_retiro) : null} />
              <Dato etiqueta={t('colabField.antiguedad')} valor={c.fecha_ingreso ? antiguedadTexto(c.fecha_ingreso) : null} />
              <Dato etiqueta={t('colabField.contrato')} valor={c.termino_contrato} />
            </Grupo>

            <Grupo titulo={t('ficha.groupOrg')}>
              <Dato icono={Briefcase} etiqueta={t('colabField.centroCostos')} valor={c.centro_costos} />
              <Dato icono={Hash} etiqueta={t('colabField.ccSap')} valor={c.cc_sap} />
              <Dato icono={Building2} etiqueta={t('colabField.proyecto')} valor={c.proyecto} />
              <Dato icono={Building2} etiqueta={t('colabField.area')} valor={c.area} />
            </Grupo>

            <Grupo titulo={t('ficha.groupLocation')}>
              <Dato icono={MapPin} etiqueta={t('colabField.sede')} valor={sede ?? c.sede} />
              <Dato icono={MapPin} etiqueta={t('colabField.ciudadRRHH')} valor={c.ciudad} />
              <Dato etiqueta={t('colabField.lider')} valor={c.lider} />
              <Dato etiqueta={t('colabField.coordinador')} valor={c.coordinador} />
              <Dato etiqueta={t('colabField.gerente')} valor={c.gerente} />
              <Dato etiqueta={t('colabField.actualizado')} valor={c.actualizado_en ? fmtDate(c.actualizado_en) : null} />
            </Grupo>
          </div>

          {/* Equipos a cargo: la razón operativa de abrir la ficha. */}
          <section className="rounded-2xl border border-ink-100 dark:border-white/10 p-4">
            <h4 className="text-xs font-semibold text-ink-500 dark:text-ink-300 mb-3 flex items-center gap-1.5">
              <Laptop size={13} /> {t('ficha.assignedEquipment')}
              {!isLoading && (
                <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200 ml-1">
                  {equipos.length}
                </span>
              )}
            </h4>

            {isLoading && <div className="h-10 rounded-xl bg-ink-100 dark:bg-white/5 animate-pulse" />}

            {!isLoading && equipos.length === 0 && (
              <p className="text-sm text-ink-400">{t('ficha.noEquipment')}</p>
            )}

            <ul className="space-y-1.5">
              {equipos.map((e, i) => (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className="flex items-center gap-3 rounded-xl bg-ink-50 dark:bg-white/5 px-3 py-2 text-sm"
                >
                  <Laptop size={15} className="text-ink-400 shrink-0" />
                  <span className="min-w-0 truncate">
                    <strong className="font-medium">{e.marca} {e.linea_modelo}</strong>
                    <span className="text-ink-400"> · {e.serial}</span>
                  </span>
                  <span className="ml-auto badge bg-brand-500/10 text-brand-600 dark:text-brand-400 shrink-0">
                    {t(`estadoAsig.${e.estado_asignacion}`)}
                  </span>
                </motion.li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
}

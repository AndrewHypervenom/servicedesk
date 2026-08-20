/**
 * El aviso de salidas en el panel de control.
 *
 * El panel es la pantalla que se abre cada mañana, así que es donde la alerta
 * tiene que aparecer: dos columnas —lo que ya se venció y lo que viene— y la
 * pregunta contestable ahí mismo, sin ir a ninguna parte. Quien quiera el
 * detalle entra a Salidas; quien solo tenga que responder, responde aquí.
 *
 * Se calla solo: sin salidas que mostrar no pinta nada, para no ocupar un
 * bloque del panel con un "no hay nada".
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react';
import {
  borrarRevisionSalida, guardarRevisionSalida, listColaboradores, listEquipos,
  listLineas, listRevisionesSalida,
} from '@/lib/api';
import { colorDias, detectarSalidas, sinResolver, type Salida } from '@/lib/salidas';
import { fmtDate, initials } from '@/lib/format';
import { useFiltroPais } from '@/lib/pais';
import { useApp } from '@/store/useApp';
import { toast } from '@/components/ui/Toast';
import { PreguntaEntrega } from '@/components/salidas/PreguntaEntrega';
import type { RespuestaEntrega } from '@/types';

/** Cuántas filas caben antes de que el bloque deje de ser un aviso y pase a ser
 *  una lista. El resto se ve en Salidas. */
const MAX_FILAS = 4;

export function AvisoSalidas() {
  const { t, i18n } = useTranslation();
  const { perfil, canEdit } = useApp();
  const pais = useFiltroPais();

  const { data: colabs = [] } = useQuery({ queryKey: ['colabs'], queryFn: listColaboradores });
  const { data: equipos = [] } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: lineas = [] } = useQuery({ queryKey: ['lineas'], queryFn: listLineas, retry: false });
  const { data: revisiones, refetch } = useQuery({
    queryKey: ['revisionesSalida'], queryFn: listRevisionesSalida,
  });

  const [guardando, setGuardando] = useState<string | null>(null);

  const salidas = useMemo(() => detectarSalidas({
    colaboradores: colabs.filter((c) => pais.incluye(c.sede_id)),
    equipos,
    lineas,
    revisiones: revisiones?.filas ?? [],
  }), [colabs, equipos, lineas, revisiones, pais]);

  const pendientes = salidas.filter((s) => s.fase === 'RETIRADO' && sinResolver(s));
  const proximas = salidas.filter((s) => s.fase === 'PROXIMA');

  if (!pendientes.length && !proximas.length) return null;

  const puedeResponder = canEdit() && (revisiones?.disponible ?? false);

  const responder = async (s: Salida, respuesta: RespuestaEntrega) => {
    setGuardando(s.colaborador.cedula);
    try {
      await guardarRevisionSalida({ cedula: s.colaborador.cedula, respuesta, revisadoPor: perfil?.id ?? null });
      await refetch();
      toast.success(t('exits.saved'));
    } catch {
      toast.error(t('common.error'));
    } finally { setGuardando(null); }
  };

  const deshacer = async (s: Salida) => {
    setGuardando(s.colaborador.cedula);
    try {
      await borrarRevisionSalida(s.colaborador.cedula);
      await refetch();
    } catch {
      toast.error(t('common.error'));
    } finally { setGuardando(null); }
  };

  return (
    <motion.div
      initial={{ y: 16 }} animate={{ y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6"
    >
      {/* -------------------------------------------- retirados con equipo */}
      <div className="card xl:col-span-2 overflow-hidden">
        <div className="flex items-center gap-3 p-5 pb-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-400 to-red-600 text-white grid place-items-center shadow-card shrink-0">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold">{t('exits.panelTitle')}</h3>
            <p className="text-xs text-ink-400">{t('exits.panelSub')}</p>
          </div>
          <div className="flex-1" />
          {!!pendientes.length && (
            <span className="badge bg-danger/12 text-red-600 dark:text-danger">
              {t('exits.toResolve', { count: pendientes.length })}
            </span>
          )}
        </div>

        {pendientes.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-ink-400">{t('exits.panelClean')}</p>
        ) : (
          <div className="divide-y divide-ink-100/70 dark:divide-white/5 border-t border-ink-100/70 dark:border-white/5">
            {pendientes.slice(0, MAX_FILAS).map((s) => (
              <div key={s.colaborador.cedula} className="p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white
                                   grid place-items-center text-[11px] font-bold shrink-0">
                    {initials(s.colaborador.nombre)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{s.colaborador.nombre}</div>
                    <div className="text-xs text-ink-400 truncate">
                      {t(`exits.motive.${s.motivo}`)} · {t('exits.pendingCount', { count: s.pendientes })}
                    </div>
                  </div>
                  <div className="flex-1" />
                  {s.dias !== null && (
                    <span className={`badge ${colorDias(s.dias)}`}>
                      {t('exits.daysAgo', { count: -s.dias })}
                    </span>
                  )}
                </div>
                <PreguntaEntrega
                  salida={s}
                  onResponder={(r) => responder(s, r)}
                  onDeshacer={() => deshacer(s)}
                  puedeResponder={puedeResponder}
                  guardando={guardando === s.colaborador.cedula}
                  compacto
                />
              </div>
            ))}
          </div>
        )}

        <Link to="/salidas"
          className="flex items-center gap-1.5 px-5 py-3.5 text-sm font-semibold text-brand-600 dark:text-brand-300
                     border-t border-ink-100/70 dark:border-white/5 hover:bg-ink-50/70 dark:hover:bg-white/[0.03] transition-colors">
          {t('exits.seeAll')} <ArrowRight size={15} />
        </Link>
      </div>

      {/* -------------------------------------------------- salen pronto */}
      <div className="card overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 p-5 pb-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white grid place-items-center shadow-card shrink-0">
            <CalendarClock size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold">{t('exits.soonTitle')}</h3>
            <p className="text-xs text-ink-400">{t('exits.soonSub')}</p>
          </div>
        </div>

        {proximas.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-ink-400">{t('exits.soonEmpty')}</p>
        ) : (
          <div className="divide-y divide-ink-100/70 dark:divide-white/5 border-t border-ink-100/70 dark:border-white/5">
            {proximas.slice(0, MAX_FILAS).map((s) => (
              <div key={s.colaborador.cedula} className="flex items-center gap-3 px-5 py-3">
                <span className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white
                                 grid place-items-center text-[10px] font-bold shrink-0">
                  {initials(s.colaborador.nombre)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.colaborador.nombre}</div>
                  <div className="text-[11px] text-ink-400 tabular-nums truncate">
                    {s.fecha ? fmtDate(s.fecha, i18n.language) : t('exits.noDate')}
                  </div>
                </div>
                {s.dias !== null && (
                  <span className={`badge ${colorDias(s.dias)}`}>{t('exits.daysLeft', { count: s.dias })}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex-1" />
        <div className="m-5 mt-4 rounded-2xl px-4 py-3.5 bg-success/10 ring-1 ring-inset ring-success/25">
          <div className="text-sm font-semibold text-emerald-700 dark:text-success">{t('exits.scheduleTitle')}</div>
          <div className="text-xs text-ink-500 dark:text-ink-300 mt-1 text-pretty">{t('exits.scheduleSub')}</div>
        </div>
      </div>
    </motion.div>
  );
}

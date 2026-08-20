import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldQuestion, Undo2, Trash2, Loader2, Boxes, Users, Truck, CheckCircle2, Clock, SearchX,
  AlertTriangle, FileSignature,
} from 'lucide-react';
import { listSolicitudes, listPerfiles, restaurarRegistro, eliminarDefinitivo, getPlanDeBorrado } from '@/lib/api';
import type { PlanDeBorrado } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import { fmtDate } from '@/lib/format';
import type { SolicitudBorrado, EntidadBorrable } from '@/types';

const ICONO: Record<EntidadBorrable, React.ElementType> = {
  equipos: Boxes, colaboradores: Users, proveedores: Truck, actas: FileSignature,
};
const NOMBRE_KEY: Record<EntidadBorrable, string> = {
  equipos: 'requests.entityEquipo', colaboradores: 'requests.entityColaborador',
  proveedores: 'requests.entityProveedor', actas: 'requests.entityActa',
};

export function Solicitudes() {
  const { t, i18n } = useTranslation();
  const { perfil } = useApp();
  const NOMBRE = (e: EntidadBorrable) => t(NOMBRE_KEY[e]);
  const qc = useQueryClient();
  const [verResueltas, setVerResueltas] = useState(false);
  const [ocupada, setOcupada] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState<{ s: SolicitudBorrado; plan: PlanDeBorrado } | null>(null);
  const [borrando, setBorrando] = useState(false);

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ['solicitudes'], queryFn: () => listSolicitudes(false),
  });
  const { data: perfiles = [] } = useQuery({ queryKey: ['perfiles'], queryFn: listPerfiles });

  const nombreDe = (id?: string | null) =>
    perfiles.find((p) => p.id === id)?.nombre ?? '—';

  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE');
  const resueltas = solicitudes.filter((s) => s.estado !== 'PENDIENTE');
  const base = verResueltas ? resueltas : pendientes;
  const lista = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return base;
    return base.filter((s) =>
      [s.etiqueta, s.motivo, NOMBRE(s.entidad), nombreDe(s.solicitado_por)]
        .some((v) => v?.toLowerCase().includes(term)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, q, perfiles]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['solicitudes'] });
    // Los listados de datos también cambian: al restaurar reaparece la fila.
    ['equipos', 'colaboradores', 'proveedores', 'actas'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }));
  };

  const restaurar = async (s: SolicitudBorrado) => {
    setOcupada(s.id);
    try {
      await restaurarRegistro(s, perfil!.id);
      toast.success(t('requests.restored'));
      refrescar();
    } catch (e: any) {
      toast.error(e?.message ?? t('requests.errRestore'));
    } finally { setOcupada(null); }
  };

  /**
   * Paso 1: se consulta qué se llevaría el borrado y se abre el resumen.
   * Intentarlo a ciegas acababa en una violación de llave foránea que llegaba
   * como un 409 sin texto, y el ADMIN se quedaba sin saber por qué "no le
   * deja" ni qué tendría que hacer para poder.
   */
  const revisar = async (s: SolicitudBorrado) => {
    setOcupada(s.id);
    try {
      setPlan({ s, plan: await getPlanDeBorrado(s.entidad, s.registro_id) });
    } catch (e: any) {
      toast.error(e?.message ?? t('requests.errDelete'));
    } finally { setOcupada(null); }
  };

  /** Paso 2: ejecutar, ya con el plan a la vista y confirmado. */
  const eliminar = async () => {
    if (!plan) return;
    setBorrando(true);
    try {
      await eliminarDefinitivo(plan.s, perfil!.id, plan.plan);
      toast.success(t('requests.deletedForever'));
      setPlan(null);
      refrescar();
    } catch (e: any) {
      // Los bloqueos se revalidan en la base dentro de la transacción, por si
      // algo cambió entre el resumen y la confirmación. El texto viene de allí
      // y ya dice qué hay que resolver.
      toast.error(e?.message ?? t('requests.errDelete'));
    } finally { setBorrando(false); }
  };

  return (
    <div>
      <PageHeader
        title={t('requests.title')}
        subtitle={t('requests.subtitle')}
        icon={ShieldQuestion}
      />

      <div className="flex items-center gap-1 p-1 mb-5 rounded-xl bg-ink-100/70 dark:bg-white/5 w-fit">
        {[
          { k: false, txt: t('requests.tabPending', { count: pendientes.length }) },
          { k: true, txt: t('requests.tabResolved', { count: resueltas.length }) },
        ].map((o) => (
          <button key={String(o.k)} onClick={() => setVerResueltas(o.k)}
            className="relative px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors">
            {verResueltas === o.k && (
              <motion.span layoutId="tab-solicitudes"
                className="absolute inset-0 rounded-lg bg-white dark:bg-ink-700 shadow-sm"
                transition={{ type: 'spring', damping: 26, stiffness: 340 }} />
            )}
            <span className={`relative z-10 ${verResueltas === o.k ? 'text-brand-600 dark:text-brand-300' : 'text-ink-500'}`}>
              {o.txt}
            </span>
          </button>
        ))}
      </div>

      {!isLoading && base.length > 0 && (
        <div className="card p-4 mb-5">
          <SearchInput value={q} onChange={setQ} placeholder={t('requests.searchPlaceholder')} />
        </div>
      )}

      {isLoading ? (
        <div className="card p-5"><SkeletonText lines={5} /></div>
      ) : base.length === 0 ? (
        <EmptyState
          icon={verResueltas ? Clock : CheckCircle2}
          title={verResueltas ? t('requests.emptyResolvedTitle') : t('requests.emptyPendingTitle')}
          description={verResueltas
            ? t('requests.emptyResolvedDesc')
            : t('requests.emptyPendingDesc')}
        />
      ) : lista.length === 0 ? (
        <EmptyState icon={SearchX} title={t('requests.noResultsTitle')}
          description={t('requests.noResultsDesc')} />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {lista.map((s) => {
              const Icono = ICONO[s.entidad];
              const trabajando = ocupada === s.id;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="card p-4 flex flex-wrap items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-2xl bg-ink-100 dark:bg-white/5 grid place-items-center shrink-0">
                    <Icono size={20} className="text-ink-500" />
                  </div>

                  <div className="flex-1 min-w-[14rem]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{s.etiqueta}</span>
                      <span className="badge bg-ink-100 dark:bg-white/10 text-ink-500">
                        {NOMBRE(s.entidad)}
                      </span>
                      {s.estado !== 'PENDIENTE' && (
                        <span className={`badge ${s.estado === 'APROBADA'
                          ? 'bg-danger/15 text-danger' : 'bg-brand-500/15 text-brand-600 dark:text-brand-300'}`}>
                          {s.estado === 'APROBADA' ? t('requests.deleted') : t('requests.restoredBadge')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-400 mt-1">
                      {t('requests.requestedBy', { nombre: nombreDe(s.solicitado_por) })} · {fmtDate(s.solicitado_en, i18n.language)}
                      {s.resuelto_en && ` · ${t('requests.resolvedBy', { nombre: nombreDe(s.resuelto_por) })}`}
                    </div>
                    {s.motivo && (
                      <p className="text-sm text-ink-500 dark:text-ink-300 mt-1.5 leading-snug">
                        «{s.motivo}»
                      </p>
                    )}
                  </div>

                  {s.estado === 'PENDIENTE' && (
                    <div className="flex items-center gap-2 ml-auto">
                      <button onClick={() => restaurar(s)} disabled={trabajando}
                        className="btn-secondary text-sm">
                        {trabajando ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
                        {t('requests.restore')}
                      </button>
                      <button onClick={() => revisar(s)} disabled={trabajando}
                        className="btn-danger text-sm">
                        <Trash2 size={15} />
                        {t('requests.deleteForever')}
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <p className="text-xs text-ink-400 mt-6 leading-relaxed max-w-2xl">
        {t('requests.footerNote')}
      </p>

      <Modal
        open={!!plan}
        onClose={() => !borrando && setPlan(null)}
        title={t('requests.planTitle')}
        subtitle={plan?.s.etiqueta}
        size="sm"
      >
        {plan && (() => {
          const p = plan.plan;
          // Lo que impide continuar se resuelve fuera de esta pantalla, así que
          // el modal deja de ofrecer el botón y pasa a explicar el siguiente paso.
          // Cada bloqueo lleva su propia lista de registros concretos: decir
          // "borra primero las actas" sin nombrarlas deja al ADMIN sin saber
          // cuáles de todas las de la pantalla de Actas son.
          const bloqueos: { texto: string; items?: string[] }[] = [];
          if (p.equipos_asignados) {
            bloqueos.push({ texto: t('requests.blockAssigned', { count: p.equipos_asignados }) });
          }
          if (p.actas_compartidas.length) {
            bloqueos.push({
              texto: t('requests.blockShared', { count: p.actas_compartidas.length }),
              items: p.actas_compartidas.map((a) => a.consecutivo || a.id),
            });
          }

          const arrastre = [
            p.movimientos ? t('requests.dropMovimientos', { count: p.movimientos }) : null,
            p.actas.length ? t('requests.dropActas', { count: p.actas.length }) : null,
          ].filter(Boolean) as string[];

          return (
            <div className="space-y-4">
              {bloqueos.length > 0 ? (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/10 border border-warning/25">
                  <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                  <div className="text-sm leading-snug space-y-2">
                    <p className="font-medium">{t('requests.planBlockedTitle')}</p>
                    {bloqueos.map((b) => (
                      <div key={b.texto} className="space-y-1">
                        <p>{b.texto}</p>
                        {b.items && (
                          <ul className="list-disc pl-4 font-mono text-xs space-y-0.5">
                            {b.items.map((i) => <li key={i}>{i}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/25">
                    <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
                    <div className="text-sm leading-snug">
                      {arrastre.length
                        ? <>
                            <p className="mb-1.5">{t('requests.planWillDelete')}</p>
                            <ul className="list-disc pl-4 space-y-1">
                              {arrastre.map((a) => <li key={a}>{a}</li>)}
                            </ul>
                          </>
                        : t('requests.planNothingElse')}
                    </div>
                  </div>
                  {p.actas.length > 0 && (
                    <p className="text-sm text-ink-500">
                      {t('requests.planActasHint', {
                        lista: p.actas.map((a) => a.consecutivo ?? '—').join(', '),
                      })}
                    </p>
                  )}
                  <p className="text-sm text-ink-500">{t('requests.planIrreversible')}</p>
                </>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={() => setPlan(null)} disabled={borrando} className="btn-secondary">
                  {bloqueos.length ? t('common.close') : t('common.cancel')}
                </button>
                {bloqueos.length === 0 && (
                  <button onClick={eliminar} disabled={borrando} className="btn-danger">
                    {borrando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    {t('requests.deleteForever')}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

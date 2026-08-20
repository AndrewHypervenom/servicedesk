/**
 * Salidas — quién deja la empresa y qué equipos sigue teniendo.
 *
 * La pantalla existe para una pregunta que antes no tenía dónde hacerse: "¿este
 * colaborador entregó el equipo?". Se llegaba tarde a ella porque el aviso de
 * que alguien se iba vivía en la base de Talento Humano y el equipo vivía en el
 * inventario, y nadie cruzaba las dos cosas a tiempo.
 *
 * Tres capas, como en Colaboradores: KPIs que además filtran, pestañas por
 * fase de la salida, y filas que se despliegan para ver lo que falta y
 * responder. Lo que se ve no está guardado en ninguna parte: se recalcula con
 * `detectarSalidas` en cada carga (ver src/lib/salidas.ts). Lo único que se
 * escribe es la respuesta.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Boxes, CalendarClock, ChevronDown, Clock, Download, FileSignature,
  Laptop, LogOut, Search, Smartphone, Undo2, UserMinus,
} from 'lucide-react';
import { listColaboradores, listEquipos, listLineas, listRevisionesSalida, guardarRevisionSalida, borrarRevisionSalida } from '@/lib/api';
import { colorDias, detectarSalidas, resumirSalidas, sinResolver, type Salida } from '@/lib/salidas';
import { colorEstatus, estatusLegible } from '@/lib/colaboradores/estatus';
import { exportRowsExcel } from '@/lib/excel';
import { fmtDate, fmtSerial, initials } from '@/lib/format';
import { useFiltroPais } from '@/lib/pais';
import { useApp } from '@/store/useApp';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { NumeroAnimado } from '@/components/ui/NumeroAnimado';
import { SkeletonStats, SkeletonText } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { PreguntaEntrega } from '@/components/salidas/PreguntaEntrega';
import type { RespuestaEntrega } from '@/types';

type Pestana = 'proximas' | 'retirados' | 'cerrados';

/** Ventanas de aviso ofrecidas. 30 días es el valor de partida: es el plazo con
 *  el que Talento Humano avisa de un contrato fijo que no se renueva. */
const VENTANAS = [7, 15, 30, 60];
const CLAVE_VENTANA = 'salidasVentana';

export function Salidas() {
  const { t, i18n } = useTranslation();
  const { perfil, canEdit } = useApp();

  const { data: colabs = [], isLoading: cargandoColabs } = useQuery({
    queryKey: ['colabs'], queryFn: listColaboradores,
  });
  const { data: equipos = [] } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  // Las líneas móviles cuentan como pendiente igual que un portátil, pero no
  // todas las cuentas las ven: si la consulta falla, la alerta sigue teniendo
  // sentido con los equipos solos.
  const { data: lineas = [] } = useQuery({ queryKey: ['lineas'], queryFn: listLineas, retry: false });
  const { data: revisiones, refetch: recargarRevisiones } = useQuery({
    queryKey: ['revisionesSalida'], queryFn: listRevisionesSalida,
  });

  const pais = useFiltroPais();
  const [pestana, setPestana] = useState<Pestana>('retirados');
  const [ventana, setVentana] = useState<number>(
    () => Number(localStorage.getItem(CLAVE_VENTANA)) || 30,
  );
  const [q, setQ] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cambiarVentana = (v: number) => { setVentana(v); localStorage.setItem(CLAVE_VENTANA, String(v)); };

  const puedeResponder = canEdit() && (revisiones?.disponible ?? false);

  const salidas = useMemo(() => detectarSalidas({
    colaboradores: colabs.filter((c) => pais.incluye(c.sede_id)),
    equipos,
    lineas,
    revisiones: revisiones?.filas ?? [],
    umbralDias: ventana,
  }), [colabs, equipos, lineas, revisiones, ventana, pais]);

  const resumen = useMemo(() => resumirSalidas(salidas), [salidas]);

  const grupos = useMemo(() => ({
    proximas: salidas.filter((s) => s.fase === 'PROXIMA'),
    retirados: salidas.filter((s) => s.fase === 'RETIRADO' && sinResolver(s)),
    cerrados: salidas.filter((s) => s.fase === 'RETIRADO' && !sinResolver(s)),
  }), [salidas]);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    const lista = grupos[pestana];
    if (!term) return lista;
    return lista.filter(({ colaborador: c }) => [c.nombre, c.cedula, c.cargo, c.area, c.lider]
      .some((v) => v?.toLowerCase().includes(term)));
  }, [grupos, pestana, q]);

  // Cambiar de pestaña o de filtro deja abierta una fila que ya no se ve.
  useEffect(() => { setAbierta(null); }, [pestana, q, ventana, pais.valor]);

  const responder = async (s: Salida, respuesta: RespuestaEntrega) => {
    setGuardando(s.colaborador.cedula);
    try {
      await guardarRevisionSalida({
        cedula: s.colaborador.cedula, respuesta, revisadoPor: perfil?.id ?? null,
      });
      await recargarRevisiones();
      toast.success(t('exits.saved'));
    } catch {
      toast.error(t('common.error'));
    } finally { setGuardando(null); }
  };

  const deshacer = async (s: Salida) => {
    setGuardando(s.colaborador.cedula);
    try {
      await borrarRevisionSalida(s.colaborador.cedula);
      await recargarRevisiones();
    } catch {
      toast.error(t('common.error'));
    } finally { setGuardando(null); }
  };

  const exportar = () => {
    exportRowsExcel(
      filtradas.map((s) => ({
        [t('colabField.cedula')]: s.colaborador.cedula,
        [t('colabField.nombre')]: s.colaborador.nombre,
        [t('colabField.cargo')]: s.colaborador.cargo ?? '',
        [t('colabField.area')]: s.colaborador.area ?? '',
        [t('common.status')]: s.colaborador.estado_interno ?? '',
        [t('exits.reason')]: t(`exits.motive.${s.motivo}`),
        [t('exits.date')]: s.fecha ?? '',
        [t('exits.days')]: s.dias ?? '',
        [t('exits.pending')]: s.pendientes,
        [t('exits.answer')]: s.revision ? t(`exits.answerShort.${s.revision.respuesta}`) : '',
      })),
      t('exits.title'),
      `salidas_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    toast.success(t('collaborators.exported', { count: filtradas.length }));
  };

  const kpis = [
    {
      id: 'proximas', label: t('exits.kpiUpcoming', { dias: ventana }), n: resumen.proximas,
      icon: CalendarClock, tono: 'from-amber-400 to-orange-600', al: () => setPestana('proximas'),
    },
    {
      id: 'retirados', label: t('exits.kpiWithGear'), n: resumen.retiradosConEquipo,
      icon: AlertTriangle, tono: 'from-red-400 to-red-600', al: () => setPestana('retirados'),
    },
    {
      id: 'equipos', label: t('exits.kpiGear'), n: resumen.equiposPendientes,
      icon: Boxes, tono: 'from-magenta-400 to-magenta-600', al: () => setPestana('retirados'),
    },
    {
      id: 'cerrados', label: t('exits.kpiClosed'), n: resumen.cerradas,
      icon: FileSignature, tono: 'from-brand-400 to-brand-600', al: () => setPestana('cerrados'),
    },
    {
      id: 'retraso', label: t('exits.kpiDelay'), n: resumen.retrasoPromedio,
      icon: Clock, tono: 'from-ink-300 to-ink-500', al: () => setPestana('retirados'),
    },
  ];

  const pestanas: { id: Pestana; label: string }[] = [
    { id: 'proximas', label: `${t('exits.tabUpcoming')} · ${grupos.proximas.length}` },
    { id: 'retirados', label: `${t('exits.tabPending')} · ${grupos.retirados.length}` },
    { id: 'cerrados', label: `${t('exits.tabClosed')} · ${grupos.cerrados.length}` },
  ];

  return (
    <div>
      <PageHeader
        title={t('exits.title')} subtitle={t('exits.subtitle')} icon={LogOut}
        action={(
          <div className="flex flex-wrap gap-2">
            {pais.mostrar && (
              <Select className="!w-auto min-w-[10rem]" value={pais.valor} onChange={pais.setValor} options={pais.opciones} />
            )}
            <Button icon={Download} onClick={exportar} disabled={!filtradas.length}>{t('common.exportExcel')}</Button>
          </div>
        )}
      />

      {revisiones && !revisiones.disponible && (
        <div className="card p-4 mb-5 flex items-start gap-3 border-warning/40">
          <AlertTriangle size={18} className="text-amber-600 dark:text-warning shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold">{t('exits.noTable')}</div>
            <div className="text-ink-400 mt-0.5">{t('exits.noTableSub')}</div>
          </div>
        </div>
      )}

      {cargandoColabs ? <SkeletonStats /> : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          {kpis.map((k, i) => (
            <motion.button
              key={k.id}
              initial={{ y: 10 }} animate={{ y: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', damping: 24, stiffness: 240 }}
              onClick={k.al}
              className="card-interactive p-4 text-left group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-2xl font-bold tabular-nums"><NumeroAnimado value={k.n} /></div>
                  <div className="text-xs text-ink-400 mt-0.5 truncate">{k.label}</div>
                </div>
                <span className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${k.tono} text-white grid place-items-center shadow-card transition-transform group-hover:scale-105`}>
                  <k.icon size={17} />
                </span>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* --------------------------------------------------- pestañas y filtros */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex gap-1 p-1 rounded-2xl bg-ink-100/70 dark:bg-white/5 self-start">
          {pestanas.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                pestana === p.id
                  ? 'bg-white dark:bg-ink-800 shadow-card text-ink-800 dark:text-ink-100'
                  : 'text-ink-500 dark:text-ink-300 hover:text-ink-800 dark:hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('exits.searchPlaceholder')}
            className="input !pl-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-400 whitespace-nowrap">{t('exits.window')}</span>
          {VENTANAS.map((v) => (
            <button
              key={v}
              onClick={() => cambiarVentana(v)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ring-1 ring-inset transition-colors ${
                ventana === v
                  ? 'bg-brand-500/15 text-brand-600 dark:text-brand-300 ring-brand-500/30'
                  : 'text-ink-500 dark:text-ink-300 ring-ink-200/70 dark:ring-white/10 hover:bg-ink-100/70 dark:hover:bg-white/5'
              }`}
            >
              {t('exits.days_n', { count: v })}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- lista */}
      {cargandoColabs ? <div className="card p-6"><SkeletonText lines={6} /></div> : filtradas.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={pestana === 'cerrados' ? FileSignature : UserMinus}
            title={t(`exits.empty.${pestana}`)}
            description={t(`exits.emptyDesc.${pestana}`)}
            variant={q ? 'search' : 'default'}
          />
        </div>
      ) : (
        <div className="card divide-y divide-ink-100/70 dark:divide-white/5 overflow-hidden">
          {filtradas.map((s) => (
            <FilaSalida
              key={s.colaborador.cedula}
              salida={s}
              idioma={i18n.language}
              abierta={abierta === s.colaborador.cedula}
              onAbrir={() => setAbierta(abierta === s.colaborador.cedula ? null : s.colaborador.cedula)}
              onResponder={(r) => responder(s, r)}
              onDeshacer={() => deshacer(s)}
              puedeResponder={puedeResponder}
              guardando={guardando === s.colaborador.cedula}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 text-xs text-ink-400">
        <Clock size={14} />
        {t('exits.recalcNote')}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── una fila

interface FilaProps {
  salida: Salida;
  idioma: string;
  abierta: boolean;
  onAbrir: () => void;
  onResponder: (r: RespuestaEntrega) => void;
  onDeshacer: () => void;
  puedeResponder: boolean;
  guardando: boolean;
}

function FilaSalida({
  salida, idioma, abierta, onAbrir, onResponder, onDeshacer, puedeResponder, guardando,
}: FilaProps) {
  const { t } = useTranslation();
  const c = salida.colaborador;
  // La pregunta solo tiene sentido cuando la persona YA salió: a quien todavía
  // trabaja aquí no se le reclama nada, se le agenda la recogida.
  const preguntar = salida.fase === 'RETIRADO' || salida.contradictoria;

  return (
    <div>
      <button onClick={onAbrir} className="w-full flex flex-wrap items-center gap-4 p-4 text-left
                                           hover:bg-ink-50/70 dark:hover:bg-white/[0.03] transition-colors">
        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white
                         grid place-items-center text-xs font-bold shrink-0">
          {initials(c.nombre)}
        </span>

        <div className="w-56 min-w-0">
          <div className="font-semibold truncate">{c.nombre}</div>
          <div className="text-xs text-ink-400 truncate">C.C. {c.cedula} · {c.cargo ?? '—'}</div>
        </div>

        <div className="w-56 min-w-0">
          <div className="text-xs text-ink-500 dark:text-ink-300 truncate">{t(`exits.motive.${salida.motivo}`)}</div>
          <div className="text-xs text-ink-400 tabular-nums mt-0.5">
            {salida.fecha
              ? t(salida.fase === 'PROXIMA' ? 'exits.leavesOn' : 'exits.leftOn', { fecha: fmtDate(salida.fecha, idioma) })
              : t('exits.noDate')}
          </div>
        </div>

        {salida.dias !== null && (
          <span className={`badge ${colorDias(salida.dias)}`}>
            {salida.dias < 0
              ? t('exits.daysAgo', { count: -salida.dias })
              : t('exits.daysLeft', { count: salida.dias })}
          </span>
        )}

        {c.estado_interno && (
          <span className={`badge ${colorEstatus(c.estado_interno)} hidden xl:inline-flex`}>
            {estatusLegible(c.estado_interno)}
          </span>
        )}

        <div className="flex-1" />

        <span className={`badge ${salida.pendientes
          ? 'bg-magenta-500/15 text-magenta-600 dark:text-magenta-300'
          : 'bg-ink-300/20 text-ink-500 dark:text-ink-300'}`}>
          <Boxes size={13} />
          {salida.pendientes ? t('exits.pendingCount', { count: salida.pendientes }) : t('exits.nothingPending')}
        </span>

        <span className="flex items-center gap-1.5 text-xs font-medium text-ink-500 dark:text-ink-300">
          {abierta ? t('common.hide') : t('common.details')}
          <ChevronDown size={14} className={`transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 pl-4 sm:pl-[4.5rem] space-y-3">
              {preguntar ? (
                <PreguntaEntrega
                  salida={salida}
                  onResponder={onResponder}
                  onDeshacer={onDeshacer}
                  puedeResponder={puedeResponder}
                  guardando={guardando}
                />
              ) : salida.pendientes > 0 && (
                <div className="rounded-2xl px-4 py-3.5 ring-1 ring-inset bg-success/10 ring-success/30
                                flex flex-wrap items-center gap-3">
                  <CalendarClock size={20} className="text-emerald-700 dark:text-success shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-emerald-700 dark:text-success">{t('exits.scheduleTitle')}</div>
                    <div className="text-xs text-ink-500 dark:text-ink-300 mt-0.5">{t('exits.scheduleSub')}</div>
                  </div>
                  <div className="flex-1" />
                  <Link to="/devolucion" className="btn-secondary !py-2 !px-3.5 text-sm">
                    <Undo2 size={16} /> {t('exits.goReturn')}
                  </Link>
                </div>
              )}

              {salida.pendientes === 0 ? (
                <p className="text-sm text-ink-400">{t('exits.nothingPendingLong')}</p>
              ) : (
                <div className="flex flex-wrap gap-2.5">
                  {salida.equipos.map((e) => (
                    <Link
                      key={e.id} to={`/equipo/${e.id}`}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl w-full sm:w-[19rem]
                                 bg-ink-100/70 dark:bg-white/5 hover:bg-ink-200/70 dark:hover:bg-white/10 transition-colors"
                    >
                      <span className="w-9 h-9 rounded-xl bg-white dark:bg-ink-800 grid place-items-center text-ink-500 dark:text-ink-300 shrink-0">
                        <Laptop size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{e.marca} {e.linea_modelo}</span>
                        <span className="block text-[11px] text-ink-400 tabular-nums truncate">
                          {fmtSerial(e.serial)} · {t(`tipo.${e.tipo}`)}
                        </span>
                      </span>
                    </Link>
                  ))}
                  {salida.lineas.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl w-full sm:w-[19rem] bg-ink-100/70 dark:bg-white/5"
                    >
                      <span className="w-9 h-9 rounded-xl bg-white dark:bg-ink-800 grid place-items-center text-ink-500 dark:text-ink-300 shrink-0">
                        <Smartphone size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate">{l.numero ?? l.clave ?? '—'}</span>
                        <span className="block text-[11px] text-ink-400 truncate">
                          {[l.operador, l.estado].filter(Boolean).join(' · ') || t('lines.title')}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

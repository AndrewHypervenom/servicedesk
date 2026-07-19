import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  LayoutDashboard, Boxes, CheckCircle2, UserCheck, Wrench, AlertTriangle,
  UserPlus, Undo2, ScanLine, ArrowRight, Clock, TrendingUp,
} from 'lucide-react';
import { useMemo } from 'react';
import { listEquipos, recentMovimientos } from '@/lib/api';
import { fmtDate, diasRestantes } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonStats, SkeletonChart, SkeletonText } from '@/components/ui/Skeleton';
import { NumeroAnimado } from '@/components/ui/NumeroAnimado';
import { paletaPara } from '@/lib/paletaGraficos';
import { useEsOscuro } from '@/lib/useEsOscuro';
import { useApp } from '@/store/useApp';
import { scopeEquipos } from '@/lib/roles';

/**
 * Orden fijo de los estados. El color se asigna por la posición en ESTA lista,
 * no por el índice del array ya filtrado: si un estado se queda sin equipos y
 * desaparece del gráfico, los colores de los demás no deben desplazarse. Con el
 * índice del filtrado, "Asignado" cambiaba de color según qué otros estados
 * tuvieran valor, y dos lecturas seguidas del mismo panel se contradecían.
 */
const ORDEN_ESTADOS = ['DISPONIBLE', 'ASIGNADO', 'EN_MANTENIMIENTO', 'EN_DEVOLUCION', 'DE_BAJA'] as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const color = p.color ?? p.payload?.fill ?? 'currentColor';
  return (
    <div className="rounded-xl border border-ink-100 dark:border-white/10 bg-white/95 dark:bg-ink-800/95 backdrop-blur-md px-3 py-2 shadow-card-hover">
      <div className="text-xs font-medium text-ink-500 dark:text-ink-300 mb-0.5">{label ?? p.name}</div>
      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-800 dark:text-ink-100">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
        {p.value}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { t, i18n } = useTranslation();
  const { canEdit, perfil } = useApp();
  const { data: equiposRaw = [], isLoading } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const equipos = useMemo(() => scopeEquipos(equiposRaw, perfil), [equiposRaw, perfil]);
  const { data: movs = [], isLoading: loadingMovs } = useQuery({ queryKey: ['recentMov'], queryFn: () => recentMovimientos(6) });

  const oscuro = useEsOscuro();
  const paleta = paletaPara(oscuro);

  const count = (fn: (e: typeof equipos[number]) => boolean) => equipos.filter(fn).length;

  // Crecimiento real del parque en los últimos 30 días, a partir de `creado_en`.
  // Se compara contra el total de hace 30 días (total - altas), no contra el
  // total actual: dividir entre el total actual daría siempre menos del 100% e
  // infravaloraría el crecimiento (10 equipos que pasan a 20 son +100%, no +50%).
  const tendencia = useMemo(() => {
    const corte = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const altas = equipos.filter((e) => new Date(e.creado_en).getTime() >= corte).length;
    const base = equipos.length - altas;
    // Sin base no hay porcentaje que calcular: todo el parque se creó dentro de
    // la ventana, así que se informa el número de altas en vez de un ratio.
    if (base <= 0 || altas === 0) return { altas, pct: null as number | null };
    return { altas, pct: Math.round((altas / base) * 100) };
  }, [equipos]);

  // Anotado explícitamente: sin esto, TS infiere el tipo del array a partir del
  // primer elemento y `tendencia` no existiría en los otros tres.
  const stats: {
    label: string; value: number; icon: React.ElementType; color: string;
    tendencia?: { altas: number; pct: number | null };
  }[] = [
    { label: t('dashboard.total'), value: equipos.length, icon: Boxes, color: 'from-brand-500 to-brand-700', tendencia },
    { label: t('dashboard.available'), value: count((e) => e.estado_asignacion === 'DISPONIBLE'), icon: CheckCircle2, color: 'from-green-400 to-emerald-600' },
    { label: t('dashboard.assigned'), value: count((e) => e.estado_asignacion === 'ASIGNADO'), icon: UserCheck, color: 'from-magenta-400 to-magenta-600' },
    { label: t('dashboard.maintenance'), value: count((e) => e.estado_asignacion === 'EN_MANTENIMIENTO'), icon: Wrench, color: 'from-amber-400 to-orange-600' },
  ];

  // Cada entrada se queda con el color de su posición fija antes de filtrar.
  const byStatus = ORDEN_ESTADOS
    .map((s, i) => ({
      name: t(`estadoAsig.${s}`),
      value: count((e) => e.estado_asignacion === s),
      color: paleta[i % paleta.length],
    }))
    .filter((d) => d.value > 0);

  const byType = Array.from(new Set(equipos.map((e) => e.tipo)))
    .map((tp) => ({ name: t(`tipo.${tp}`), value: count((e) => e.tipo === tp) }));

  const expiring = equipos
    .filter((e) => e.propiedad === 'RENTADO' && e.fecha_vencimiento_contrato)
    .map((e) => ({ e, dias: diasRestantes(e.fecha_vencimiento_contrato) ?? 999 }))
    .filter((x) => x.dias >= 0 && x.dias <= 30)
    .sort((a, b) => a.dias - b.dias);

  const quick = [
    { to: '/asignar', icon: UserPlus, label: t('nav.assign'), show: canEdit() },
    { to: '/devolucion', icon: Undo2, label: t('nav.return'), show: canEdit() },
    { to: '/escanear', icon: ScanLine, label: t('nav.scan'), show: true },
  ].filter((q) => q.show);

  return (
    <div>
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} icon={LayoutDashboard} />

      {isLoading ? <SkeletonStats /> : (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="card p-5 relative overflow-hidden group
                       transition-shadow duration-300 hover:shadow-card-hover">
            {/* La mancha de color crece al pasar el puntero: da respuesta a la
                tarjeta sin desplazarla, que aquí no procede porque no se puede
                hacer clic en ella. */}
            <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full bg-gradient-to-br ${s.color} opacity-10
                             transition-transform duration-500 ease-out group-hover:scale-[1.6]`} />
            <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} grid place-items-center text-white shadow-sm mb-3
                             transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}>
              <s.icon size={20} />
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <NumeroAnimado value={s.value} className="text-3xl font-bold tracking-tight" />
              {/* Solo se pinta si hubo altas en la ventana. Un "+0%" permanente
                  ocupa sitio y no informa de nada. */}
              {s.tendencia && s.tendencia.altas > 0 && (
                <span
                  title={t('dashboard.trendTitle', { count: s.tendencia.altas })}
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300"
                >
                  <TrendingUp size={12} />
                  {s.tendencia.pct !== null ? `+${s.tendencia.pct}%` : `+${s.tendencia.altas}`}
                </span>
              )}
            </div>
            <div className="text-sm text-ink-400">{s.label}</div>
          </motion.div>
        ))}
      </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-1">
          <h3 className="font-semibold mb-1">{t('dashboard.byStatus')}</h3>
          {isLoading ? <SkeletonChart /> : (
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                {/* El separador entre segmentos lleva el color de la tarjeta.
                    Recharts usa blanco por defecto, que en modo oscuro dibuja
                    un aro claro alrededor de cada porción. */}
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}
                  paddingAngle={3} stroke={oscuro ? '#1c201f' : '#ffffff'} strokeWidth={2}>
                  {byStatus.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {byStatus.map((d) => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-ink-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />{d.name}
              </span>
            ))}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3">{t('dashboard.byType')}</h3>
          {isLoading ? <SkeletonChart /> : (
          <div className="h-56 text-ink-500 dark:text-ink-400">
            <ResponsiveContainer>
              <BarChart data={byType} margin={{ left: -20 }}>
                <defs>
                  {/* Serie única: un solo tono, el paso validado de la paleta.
                      El brand-500 puro daba 1,94:1 contra el fondo claro, por
                      debajo del mínimo de 3:1. */}
                  <linearGradient id="gradBarras" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={paleta[0]} stopOpacity={1} />
                    <stop offset="100%" stopColor={paleta[0]} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,128,0.15)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.06, radius: 8 }} />
                <Bar dataKey="value" fill="url(#gradBarras)" radius={[8, 8, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-warning" />
            <div>
              <h3 className="font-semibold">{t('dashboard.expiring')}</h3>
              <p className="text-xs text-ink-400">{t('dashboard.expiringSub')}</p>
            </div>
          </div>
          {isLoading ? (
            <SkeletonText lines={4} className="py-2" />
          ) : expiring.length === 0 ? (
            <EmptyState variant="search" icon={CheckCircle2} title={t('dashboard.noExpiring')} className="!py-8" />
          ) : (
            <div className="space-y-2">
              {expiring.map(({ e, dias }, i) => (
                <motion.div key={e.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                <Link to={`/equipo/${e.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-warning/5 hover:bg-warning/10
                             hover:translate-x-1 transition-[background-color,transform] duration-200">
                  <div className="w-10 h-10 rounded-xl bg-warning/15 text-amber-600 dark:text-warning grid place-items-center font-bold text-sm">{dias}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.marca} {e.linea_modelo}</div>
                    <div className="text-xs text-ink-400">{e.serial} · {e.proveedor_propietario} · {e.numero_contrato}</div>
                  </div>
                  <div className="text-xs text-ink-400">{fmtDate(e.fecha_vencimiento_contrato, i18n.language)}</div>
                </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-brand-500" />
            <h3 className="font-semibold">{t('dashboard.recentMovements')}</h3>
          </div>
          {loadingMovs && <SkeletonText lines={5} className="py-2" />}
          {!loadingMovs && movs.length === 0 && (
            <EmptyState
              icon={Clock}
              title={t('dashboard.noMovements')}
              description={t('dashboard.noMovementsDesc')}
              className="!py-8"
              action={canEdit() && <Link to="/asignar" className="btn-primary"><UserPlus size={16} /> {t('nav.assign')}</Link>}
            />
          )}
          <div className="space-y-1.5">
            {movs.map((m, i) => (
              <motion.div key={m.id}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 p-2 rounded-lg transition-colors hover:bg-ink-50 dark:hover:bg-white/5">
                <div className="w-2 h-2 rounded-full bg-brand-500" />
                <div className="flex-1 text-sm">{t(`movimiento.${m.tipo_movimiento}`)}
                  {m.nombre_destino && <span className="text-ink-400"> → {m.nombre_destino}</span>}
                </div>
                <span className="text-xs text-ink-400">{fmtDate(m.fecha, i18n.language)}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {quick.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-3">{t('dashboard.quickActions')}</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {quick.map((q) => (
              <Link key={q.to} to={q.to}
                className="card-interactive shine p-5 flex items-center gap-4 group">
                <div className="w-11 h-11 rounded-2xl bg-brand-500/10 text-brand-600 grid place-items-center group-hover:bg-brand-500 group-hover:text-white transition-colors">
                  <q.icon size={22} />
                </div>
                <span className="font-medium flex-1">{q.label}</span>
                <ArrowRight size={18} className="text-ink-300 group-hover:text-brand-500 group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

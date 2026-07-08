import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  LayoutDashboard, Boxes, CheckCircle2, UserCheck, Wrench, AlertTriangle,
  UserPlus, Undo2, ScanLine, ArrowRight, Clock,
} from 'lucide-react';
import { useMemo } from 'react';
import { listEquipos, recentMovimientos } from '@/lib/api';
import { fmtDate, diasRestantes } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { useApp } from '@/store/useApp';
import { scopeEquipos } from '@/lib/roles';

const COLORS = ['#10D451', '#B33D9E', '#ff9f0a', '#0a9038', '#ff453a', '#A1ADAD'];

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const color = p.color ?? p.payload?.fill ?? '#10D451';
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
  const { data: equiposRaw = [] } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const equipos = useMemo(() => scopeEquipos(equiposRaw, perfil), [equiposRaw, perfil]);
  const { data: movs = [] } = useQuery({ queryKey: ['recentMov'], queryFn: () => recentMovimientos(6) });

  const count = (fn: (e: typeof equipos[number]) => boolean) => equipos.filter(fn).length;
  const stats = [
    { label: t('dashboard.total'), value: equipos.length, icon: Boxes, color: 'from-brand-500 to-brand-700' },
    { label: t('dashboard.available'), value: count((e) => e.estado_asignacion === 'DISPONIBLE'), icon: CheckCircle2, color: 'from-green-400 to-emerald-600' },
    { label: t('dashboard.assigned'), value: count((e) => e.estado_asignacion === 'ASIGNADO'), icon: UserCheck, color: 'from-magenta-400 to-magenta-600' },
    { label: t('dashboard.maintenance'), value: count((e) => e.estado_asignacion === 'EN_MANTENIMIENTO'), icon: Wrench, color: 'from-amber-400 to-orange-600' },
  ];

  const byStatus = ['DISPONIBLE', 'ASIGNADO', 'EN_MANTENIMIENTO', 'EN_DEVOLUCION', 'DE_BAJA']
    .map((s) => ({ name: t(`estadoAsig.${s}`), value: count((e) => e.estado_asignacion === s) }))
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="card p-5 relative overflow-hidden">
            <div className={`absolute -right-6 -top-6 w-20 h-20 rounded-full bg-gradient-to-br ${s.color} opacity-10`} />
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} grid place-items-center text-white shadow-sm mb-3`}>
              <s.icon size={20} />
            </div>
            <div className="text-3xl font-bold tracking-tight">{s.value}</div>
            <div className="text-sm text-ink-400">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card p-5 lg:col-span-1">
          <h3 className="font-semibold mb-1">{t('dashboard.byStatus')}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {byStatus.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-ink-500">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{d.name}
              </span>
            ))}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold mb-3">{t('dashboard.byType')}</h3>
          <div className="h-56 text-ink-500 dark:text-ink-400">
            <ResponsiveContainer>
              <BarChart data={byType} margin={{ left: -20 }}>
                <defs>
                  <linearGradient id="barBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10D451" stopOpacity={1} />
                    <stop offset="100%" stopColor="#10D451" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,128,0.15)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.06, radius: 8 }} />
                <Bar dataKey="value" fill="url(#barBlue)" radius={[8, 8, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
          {expiring.length === 0 ? (
            <p className="text-sm text-ink-400 py-6 text-center">{t('dashboard.noExpiring')}</p>
          ) : (
            <div className="space-y-2">
              {expiring.map(({ e, dias }) => (
                <Link to={`/equipo/${e.id}`} key={e.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-warning/5 hover:bg-warning/10 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-warning/15 text-amber-600 dark:text-warning grid place-items-center font-bold text-sm">{dias}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{e.marca} {e.linea_modelo}</div>
                    <div className="text-xs text-ink-400">{e.serial} · {e.proveedor_propietario} · {e.numero_contrato}</div>
                  </div>
                  <div className="text-xs text-ink-400">{fmtDate(e.fecha_vencimiento_contrato, i18n.language)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-brand-500" />
            <h3 className="font-semibold">{t('dashboard.recentMovements')}</h3>
          </div>
          <div className="space-y-1.5">
            {movs.length === 0 && <p className="text-sm text-ink-400 py-6 text-center">{t('common.empty')}</p>}
            {movs.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-ink-50 dark:hover:bg-white/5">
                <div className="w-2 h-2 rounded-full bg-brand-500" />
                <div className="flex-1 text-sm">{t(`movimiento.${m.tipo_movimiento}`)}
                  {m.nombre_destino && <span className="text-ink-400"> → {m.nombre_destino}</span>}
                </div>
                <span className="text-xs text-ink-400">{fmtDate(m.fecha, i18n.language)}</span>
              </div>
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
                className="card p-5 flex items-center gap-4 hover:shadow-card-hover transition-all group">
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

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, LabelList,
} from 'recharts';
import { ChartPie, FileDown, Loader2 } from 'lucide-react';
import { listEquipos, listSedes, movimientosDesde } from '@/lib/api';
import { scopeEquipos } from '@/lib/roles';
import { useApp } from '@/store/useApp';
import { PageHeader } from '@/components/ui/PageHeader';
import { NumeroAnimado } from '@/components/ui/NumeroAnimado';
import { GraficoCard, type GraficoHandle } from '@/components/analitica/GraficoCard';
import { paletaPara, ESTADO } from '@/lib/paletaGraficos';
import { useEsOscuro } from '@/lib/useEsOscuro';
import { exportarPdf } from '@/lib/exportarGrafico';
import { toast } from '@/components/ui/Toast';
import type { Equipo } from '@/types';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function Analitica() {
  const { t } = useTranslation();
  const { perfil } = useApp();
  const oscuro = useEsOscuro();
  const paleta = paletaPara(oscuro);

  // Tokens de texto: los ejes y etiquetas llevan tinta, nunca el color de serie.
  const tinta = oscuro ? '#A1ADAD' : '#6a7473';
  const tintaFuerte = oscuro ? '#E0EBE7' : '#2c3130';
  const rejilla = oscuro ? 'rgba(255,255,255,0.07)' : 'rgba(120,120,128,0.13)';
  const superficie = oscuro ? '#1c201f' : '#ffffff';

  const { data: equiposRaw = [], isLoading } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  // Normalizado al primer día del mes a medianoche. Sin esto la fecha lleva la
  // hora actual con milisegundos, la clave de caché cambia en cada montaje y
  // React Query refetchea los 12 meses de movimientos en cada navegación.
  const desde12m = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const claveMes = `${desde12m.getFullYear()}-${desde12m.getMonth()}`;
  const { data: movs = [] } = useQuery({
    queryKey: ['movs12m', claveMes],
    queryFn: () => movimientosDesde(desde12m),
  });

  const alcance = useMemo(() => scopeEquipos(equiposRaw, perfil), [equiposRaw, perfil]);

  // ── Filtros ───────────────────────────────────────────────────────────
  const [sedeFiltro, setSedeFiltro] = useState<string>('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('');

  const equipos = useMemo(() => alcance.filter((e) =>
    (!sedeFiltro || e.sede_id === sedeFiltro) && (!tipoFiltro || e.tipo === tipoFiltro),
  ), [alcance, sedeFiltro, tipoFiltro]);

  const tipos = useMemo(() => Array.from(new Set(alcance.map((e) => e.tipo))).sort(), [alcance]);
  const nombreSede = useMemo(() => {
    const m = new Map(sedes.map((s) => [s.id, s.nombre]));
    return (id?: string | null) => (id && m.get(id)) || 'Sin sede';
  }, [sedes]);

  const cuenta = (fn: (e: Equipo) => boolean) => equipos.filter(fn).length;

  // ── KPIs ──────────────────────────────────────────────────────────────
  const total = equipos.length;
  const asignados = cuenta((e) => e.estado_asignacion === 'ASIGNADO');
  const disponibles = cuenta((e) => e.estado_asignacion === 'DISPONIBLE');
  // Sobre el parque operativo, excluyendo bajas: incluirlas hundiría la tasa
  // sin que signifique nada, porque un equipo dado de baja no es asignable.
  const operativo = total - cuenta((e) => e.estado_asignacion === 'DE_BAJA');
  const utilizacion = operativo > 0 ? Math.round((asignados / operativo) * 100) : 0;

  const porVencer = useMemo(() => {
    const limite = Date.now() + 30 * 24 * 60 * 60 * 1000;
    return equipos.filter((e) => {
      if (e.propiedad !== 'RENTADO' || !e.fecha_vencimiento_contrato) return false;
      const v = new Date(e.fecha_vencimiento_contrato).getTime();
      return v >= Date.now() && v <= limite;
    }).length;
  }, [equipos]);

  // ── Series ────────────────────────────────────────────────────────────
  const porEstado = useMemo(() => {
    const ord = ['DISPONIBLE', 'ASIGNADO', 'EN_MANTENIMIENTO', 'EN_DEVOLUCION', 'DE_BAJA'];
    return ord.map((s) => ({ clave: s, name: t(`estadoAsig.${s}`), value: cuenta((e) => e.estado_asignacion === s) }))
      .filter((d) => d.value > 0);
  }, [equipos, t]);

  const porTipo = useMemo(() => Array.from(new Set(equipos.map((e) => e.tipo)))
    .map((tp) => ({ name: t(`tipo.${tp}`), value: cuenta((e) => e.tipo === tp) }))
    .sort((a, b) => b.value - a.value), [equipos, t]);

  const porSede = useMemo(() => {
    const m = new Map<string, number>();
    equipos.forEach((e) => {
      const k = nombreSede(e.sede_id);
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
  }, [equipos, nombreSede]);

  // Antigüedad: escala ordinal, así que un solo tono en rampa clara→oscura.
  // Un arcoíris aquí sugeriría categorías sin orden, que es justo lo contrario.
  const porAntiguedad = useMemo(() => {
    const cubos = [
      { name: '< 1 año', min: 0, max: 1 },
      { name: '1–2', min: 1, max: 2 },
      { name: '2–3', min: 2, max: 3 },
      { name: '3–4', min: 3, max: 4 },
      { name: '4–5', min: 4, max: 5 },
      { name: '5+ años', min: 5, max: Infinity },
    ];
    const ahora = Date.now();
    return cubos.map((c) => ({
      name: c.name,
      value: equipos.filter((e) => {
        if (!e.fecha_ingreso) return false;
        const años = (ahora - new Date(e.fecha_ingreso).getTime()) / (365.25 * 24 * 3600 * 1000);
        return años >= c.min && años < c.max;
      }).length,
    }));
  }, [equipos]);

  const porEstadoFisico = useMemo(() => {
    const mapa: Record<string, string> = {
      BUENO: ESTADO.bien, REGULAR: ESTADO.aviso, CON_FALLA: ESTADO.serio,
      DANADO: ESTADO.critico, DE_BAJA: oscuro ? '#6a7473' : '#86908f',
    };
    return ['BUENO', 'REGULAR', 'CON_FALLA', 'DANADO', 'DE_BAJA']
      .map((s) => ({ name: t(`estadoFis.${s}`), value: cuenta((e) => e.estado_fisico === s), fill: mapa[s] }))
      .filter((d) => d.value > 0);
  }, [equipos, t, oscuro]);

  const movPorMes = useMemo(() => {
    const buckets = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(desde12m);
      d.setMonth(d.getMonth() + i);
      buckets.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
    }
    movs.forEach((m) => {
      const d = new Date(m.fecha);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (buckets.has(k)) buckets.set(k, buckets.get(k)! + 1);
    });
    return Array.from(buckets, ([k, value]) => {
      const [, mes] = k.split('-').map(Number);
      return { name: MESES[mes], value };
    });
  }, [movs, desde12m]);

  // ── Exportación ───────────────────────────────────────────────────────
  const refs = {
    estado: useRef<GraficoHandle>(null),
    tipo: useRef<GraficoHandle>(null),
    antiguedad: useRef<GraficoHandle>(null),
    sede: useRef<GraficoHandle>(null),
    fisico: useRef<GraficoHandle>(null),
    movs: useRef<GraficoHandle>(null),
  };
  const [exportando, setExportando] = useState(false);

  const pdf = async () => {
    setExportando(true);
    try {
      const bloques = [
        { titulo: 'Estado del parque', ref: refs.estado },
        { titulo: 'Equipos por tipo', ref: refs.tipo },
        { titulo: 'Antigüedad del parque', ref: refs.antiguedad },
        { titulo: 'Equipos por sede', ref: refs.sede },
        { titulo: 'Estado físico', ref: refs.fisico },
        { titulo: 'Movimientos por mes', ref: refs.movs },
      ]
        .map((b) => ({ titulo: b.titulo, contenedor: b.ref.current?.contenedor() }))
        .filter((b): b is { titulo: string; contenedor: HTMLElement } => !!b.contenedor);

      await exportarPdf(bloques, {
        titulo: 'Informe de inventario',
        subtitulo: 'Service Desk · Positivo S+ IT Solutions',
        fondo: superficie,
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el PDF');
    } finally { setExportando(false); }
  };

  const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-ink-100 dark:border-white/10 bg-white dark:bg-ink-800 px-3 py-2 shadow-card-hover">
        <div className="text-xs text-ink-400 mb-0.5">{label ?? payload[0].name}</div>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: payload[0].payload.fill ?? payload[0].color }} />
          {payload[0].value}
        </div>
      </div>
    );
  };

  const kpis = [
    { label: 'Equipos totales', value: total, sufijo: '' },
    { label: 'Tasa de utilización', value: utilizacion, sufijo: '%', nota: 'Asignados sobre parque operativo' },
    { label: 'Disponibles', value: disponibles, sufijo: '' },
    { label: 'Contratos por vencer', value: porVencer, sufijo: '', nota: 'Rentados, próximos 30 días' },
  ];

  return (
    <div>
      <PageHeader
        title="Analítica"
        subtitle="Indicadores del parque de equipos, listos para presentar"
        icon={ChartPie}
        action={
          <button onClick={pdf} disabled={exportando || isLoading} className="btn-primary shine">
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            Exportar informe PDF
          </button>
        }
      />

      {/* Filtros en una sola fila sobre los gráficos, no repartidos por tarjeta:
          así se ve de un vistazo qué recorte se está mirando. */}
      <div className="card p-3 mb-6 flex flex-wrap items-center gap-3">
        <select value={sedeFiltro} onChange={(e) => setSedeFiltro(e.target.value)}
          className="input !w-auto min-w-[11rem]" aria-label="Filtrar por sede">
          <option value="">Todas las sedes</option>
          {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}
          className="input !w-auto min-w-[11rem]" aria-label="Filtrar por tipo">
          <option value="">Todos los tipos</option>
          {tipos.map((tp) => <option key={tp} value={tp}>{t(`tipo.${tp}`)}</option>)}
        </select>
        {(sedeFiltro || tipoFiltro) && (
          <button onClick={() => { setSedeFiltro(''); setTipoFiltro(''); }} className="btn-ghost text-sm">
            Limpiar filtros
          </button>
        )}
        <span className="ml-auto text-sm text-ink-400">
          {total.toLocaleString('es-CO')} equipos en la selección
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="card p-5">
            <div className="flex items-baseline gap-0.5">
              <NumeroAnimado value={k.value} className="text-3xl font-bold tracking-tight" />
              {k.sufijo && <span className="text-xl font-bold">{k.sufijo}</span>}
            </div>
            <div className="text-sm text-ink-400 mt-0.5">{k.label}</div>
            {k.nota && <div className="text-[11px] text-ink-400/80 mt-1 leading-snug">{k.nota}</div>}
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <GraficoCard ref={refs.estado} titulo="Estado del parque" fondoExport={superficie}
          lectura="Dónde está cada equipo ahora mismo."
          tabla={{ columnas: [{ key: 'name', label: 'Estado' }, { key: 'value', label: 'Equipos' }], filas: porEstado }}
          className="group/card">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porEstado} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid horizontal={false} stroke={rejilla} />
              <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: rejilla }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                {porEstado.map((_, i) => <Cell key={i} fill={paleta[i % paleta.length]} />)}
                <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>

        <GraficoCard ref={refs.tipo} titulo="Equipos por tipo" fondoExport={superficie}
          lectura="Qué compone el parque, de mayor a menor."
          tabla={{ columnas: [{ key: 'name', label: 'Tipo' }, { key: 'value', label: 'Equipos' }], filas: porTipo }}
          className="group/card">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porTipo} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid horizontal={false} stroke={rejilla} />
              <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: rejilla }} />
              {/* Una sola serie: un único tono, sin leyenda. El título ya la nombra. */}
              <Bar dataKey="value" fill={paleta[0]} radius={[0, 4, 4, 0]} barSize={18}>
                <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>

        <GraficoCard ref={refs.antiguedad} titulo="Antigüedad del parque" fondoExport={superficie}
          lectura="Cuánto lleva cada equipo en servicio. Los tramos altos anticipan renovación."
          tabla={{ columnas: [{ key: 'name', label: 'Antigüedad' }, { key: 'value', label: 'Equipos' }], filas: porAntiguedad }}
          className="group/card">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porAntiguedad} margin={{ left: -18, top: 16 }}>
              <CartesianGrid vertical={false} stroke={rejilla} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<Tip />} cursor={{ fill: rejilla }} />
              {/* Escala ordinal: un solo tono en rampa, de claro a oscuro. */}
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={46}>
                {porAntiguedad.map((_, i) => (
                  <Cell key={i} fill={oscuro
                    ? ['#0b722f', '#0a9038', '#0cb544', '#10D451', '#26d968', '#52e089'][i]
                    : ['#8fedb4', '#52e089', '#26d968', '#0cb544', '#0a9038', '#0b722f'][i]} />
                ))}
                <LabelList dataKey="value" position="top" fill={tinta} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>

        <GraficoCard ref={refs.sede} titulo="Equipos por sede" fondoExport={superficie}
          lectura="Las diez sedes con más equipos asignados."
          tabla={{ columnas: [{ key: 'name', label: 'Sede' }, { key: 'value', label: 'Equipos' }], filas: porSede }}
          className="group/card">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porSede} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid horizontal={false} stroke={rejilla} />
              <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: rejilla }} />
              <Bar dataKey="value" fill={paleta[2]} radius={[0, 4, 4, 0]} barSize={16}>
                <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>

        <GraficoCard ref={refs.fisico} titulo="Estado físico" fondoExport={superficie}
          lectura="Salud del parque. Con falla y dañado son los que exigen acción."
          tabla={{ columnas: [{ key: 'name', label: 'Estado' }, { key: 'value', label: 'Equipos' }], filas: porEstadoFisico }}
          className="group/card">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porEstadoFisico} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid horizontal={false} stroke={rejilla} />
              <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip />} cursor={{ fill: rejilla }} />
              {/* Colores de estado reservados, siempre con la etiqueta al lado:
                  el significado no puede quedar solo en el color. */}
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
                {porEstadoFisico.map((d, i) => <Cell key={i} fill={d.fill} />)}
                <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GraficoCard>

        <GraficoCard ref={refs.movs} titulo="Movimientos por mes" fondoExport={superficie}
          lectura="Actividad de los últimos 12 meses: asignaciones, devoluciones y bajas."
          tabla={{ columnas: [{ key: 'name', label: 'Mes' }, { key: 'value', label: 'Movimientos' }], filas: movPorMes }}
          className="group/card">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={movPorMes} margin={{ left: -18, top: 8 }}>
              <defs>
                <linearGradient id="gradMovs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={paleta[0]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={paleta[0]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={rejilla} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip content={<Tip />} cursor={{ stroke: rejilla, strokeWidth: 1 }} />
              <Area type="monotone" dataKey="value" stroke={paleta[0]} strokeWidth={2}
                fill="url(#gradMovs)" dot={{ r: 3, fill: paleta[0], strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: superficie, strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </GraficoCard>
      </div>
    </div>
  );
}

/**
 * Planta de colaboradores.
 *
 * Esta vista dejó de ser una lista de tarjetas cuando la base pasó a venir de
 * Talento Humano: son ~2.000 personas, la mayoría ya retiradas, y lo que se
 * necesita es encontrar a una. De ahí las tres capas de la pantalla:
 *
 *   · KPIs que además son filtros — el número que llama la atención es el que
 *     se quiere ver, así que se puede hacer clic en él.
 *   · Buscador y filtros combinables, con los valores sacados de los datos
 *     reales (no hay catálogos fijos: las ciudades y áreas salen de la base).
 *   · Dos vistas del mismo resultado: tarjetas para reconocer a alguien de un
 *     vistazo, tabla para comparar y ordenar.
 *
 * El listado se pinta por tandas (`PASO_VISIBLES`): pintar 2.000 tarjetas de
 * golpe congela el navegador, y nadie mira más de las primeras treinta.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, CalendarDays, Download, LayoutGrid, Mail, MapPin, Pencil, Plus, Search,
  Table2, Upload, UserCheck, UserMinus, UserPlus, Users, X,
} from 'lucide-react';
import { BotonBorrar } from '@/components/ui/BotonBorrar';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { NumeroAnimado } from '@/components/ui/NumeroAnimado';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { FichaColaborador } from '@/components/colaboradores/FichaColaborador';
import { ImportarBaseModal } from '@/components/colaboradores/ImportarBaseModal';
import {
  actualizarColaborador, campoDuplicado, crearColaborador, listColaboradores, listSedes,
} from '@/lib/api';
import { colorEstatus, esEstatusActivo, estatusLegible } from '@/lib/colaboradores/estatus';
import { exportRowsExcel } from '@/lib/excel';
import { fmtDate, initials } from '@/lib/format';
import { normNombre } from '@/lib/importador/normalizar';
import { useApp } from '@/store/useApp';
import type { Colaborador, Sede } from '@/types';

const PASO_VISIBLES = 30;
const SIN_SEDE = '__sin_sede';

type Orden = 'nombre' | 'nombre_desc' | 'ingreso' | 'antiguedad' | 'actualizado';
type Estado = 'todos' | 'activos' | 'inactivos';

const sedeOption = (s: Sede): SelectOption =>
  ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre });

/** Opciones de un filtro sacadas de los propios datos, ordenadas por frecuencia. */
function opcionesDe(colabs: Colaborador[], campo: keyof Colaborador): SelectOption[] {
  const m = new Map<string, number>();
  for (const c of colabs) {
    const v = c[campo];
    if (typeof v !== 'string' || !v.trim()) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v, n]) => ({ value: v, label: v, description: i18n.t('collaborators.peopleCount', { count: n }) }));
}

/** Todo lo buscable de una persona en una sola cadena normalizada. */
const heno = (c: Colaborador): string => normNombre([
  c.nombre, c.cedula, c.correo, c.correo_personal, c.cargo, c.area, c.ciudad,
  c.proyecto, c.centro_costos, c.lider, c.coordinador, c.gerente, c.telefono,
].filter(Boolean).join(' '));

export function Colaboradores() {
  const { t, i18n } = useTranslation();
  const { canEdit, can } = useApp();
  // La carga masiva la autoriza el RPC solo a estos tres roles; el Técnico
  // edita fichas sueltas pero no reemplaza la planta entera.
  const puedeCargarBase = can('ADMIN', 'LIDER', 'JEFE_SEDE');

  const { data: colabs = [], refetch, isLoading } = useQuery({
    queryKey: ['colabs'], queryFn: listColaboradores,
  });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const nombreSede = (c: Colaborador) => sedes.find((s) => s.id === c.sede_id)?.nombre ?? c.sede ?? null;

  // ------------------------------------------------------------- filtros
  const [q, setQ] = useState('');
  const qDiferida = useDeferredValue(q);
  const [estado, setEstado] = useState<Estado>('todos');
  const [sedeF, setSedeF] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [area, setArea] = useState('');
  const [contrato, setContrato] = useState('');
  const [orden, setOrden] = useState<Orden>('nombre');
  const [vista, setVista] = useState<'tarjetas' | 'tabla'>(
    () => (localStorage.getItem('colabsVista') as 'tarjetas' | 'tabla') ?? 'tarjetas',
  );
  const [visibles, setVisibles] = useState(PASO_VISIBLES);
  const buscadorRef = useRef<HTMLInputElement>(null);

  // ------------------------------------------------------------- modales
  const [ficha, setFicha] = useState<Colaborador | null>(null);
  const [importar, setImportar] = useState(false);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [f, setF] = useState<Partial<Colaborador>>({});
  const [busy, setBusy] = useState(false);

  const cambiarVista = (v: 'tarjetas' | 'tabla') => { setVista(v); localStorage.setItem('colabsVista', v); };

  // Atajo "/" para saltar al buscador, como en las herramientas que se usan a diario.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dentroDeCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if (e.key === '/' && !dentroDeCampo) { e.preventDefault(); buscadorRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // El índice de búsqueda se calcula una vez por carga, no en cada tecla.
  const indice = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of colabs) m.set(c.cedula, heno(c));
    return m;
  }, [colabs]);

  const activo = (c: Colaborador) => (c.estado_interno ? esEstatusActivo(c.estado_interno) : c.activo);

  const kpis = useMemo(() => {
    const hace30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    let activos = 0;
    let nuevos = 0;
    const sedesCubiertas = new Set<string>();
    for (const c of colabs) {
      if (activo(c)) activos++;
      if (c.sede_id) sedesCubiertas.add(c.sede_id);
      if (c.fecha_ingreso && c.fecha_ingreso >= hace30) nuevos++;
    }
    return { total: colabs.length, activos, inactivos: colabs.length - activos, sedes: sedesCubiertas.size, nuevos };
  }, [colabs]);

  const filtrados = useMemo(() => {
    const terminos = normNombre(qDiferida).split(' ').filter(Boolean);
    const res = colabs.filter((c) => {
      if (estado === 'activos' && !activo(c)) return false;
      if (estado === 'inactivos' && activo(c)) return false;
      if (sedeF === SIN_SEDE ? !!c.sede_id : sedeF && c.sede_id !== sedeF) return false;
      if (ciudad && c.ciudad !== ciudad) return false;
      if (area && c.area !== area) return false;
      if (contrato && c.termino_contrato !== contrato) return false;
      if (terminos.length) {
        const h = indice.get(c.cedula) ?? '';
        // Todos los términos deben aparecer: "juan bogota" busca ambos, no uno u otro.
        if (!terminos.every((x) => h.includes(x))) return false;
      }
      return true;
    });

    const cmp: Record<Orden, (a: Colaborador, b: Colaborador) => number> = {
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      nombre_desc: (a, b) => b.nombre.localeCompare(a.nombre),
      // Sin fecha van al final en ambos casos: un vacío no es "el más antiguo".
      ingreso: (a, b) => (b.fecha_ingreso ?? '').localeCompare(a.fecha_ingreso ?? ''),
      antiguedad: (a, b) => (a.fecha_ingreso ?? '9999').localeCompare(b.fecha_ingreso ?? '9999'),
      actualizado: (a, b) => (b.actualizado_en ?? b.creado_en ?? '').localeCompare(a.actualizado_en ?? a.creado_en ?? ''),
    };
    return [...res].sort(cmp[orden]);
  }, [colabs, indice, qDiferida, estado, sedeF, ciudad, area, contrato, orden]);

  // Cualquier cambio de filtro reinicia la tanda: quedarse en la página 4 de un
  // resultado que ya no existe desorienta más de lo que ahorra.
  useEffect(() => { setVisibles(PASO_VISIBLES); }, [qDiferida, estado, sedeF, ciudad, area, contrato, orden]);

  // Carga la siguiente tanda al llegar al final del listado.
  const centinela = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = centinela.current;
    if (!el) return;
    const io = new IntersectionObserver((entradas) => {
      if (entradas[0]?.isIntersecting) setVisibles((v) => (v < filtrados.length ? v + PASO_VISIBLES : v));
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [filtrados.length]);

  const mostrados = filtrados.slice(0, visibles);
  const hayFiltros = !!(q || estado !== 'todos' || sedeF || ciudad || area || contrato);
  const limpiar = () => { setQ(''); setEstado('todos'); setSedeF(''); setCiudad(''); setArea(''); setContrato(''); };

  const exportar = () => {
    exportRowsExcel(
      filtrados.map((c) => ({
        [t('colabField.cedula')]: c.cedula,
        [t('colabField.nombre')]: c.nombre,
        [t('common.status')]: c.estado_interno ?? (c.activo ? 'ACTIVO' : 'INACTIVO'),
        [t('colabField.cargo')]: c.cargo ?? '',
        [t('colabField.area')]: c.area ?? '',
        [t('colabField.sede')]: nombreSede(c) ?? '',
        [t('colabField.ciudad')]: c.ciudad ?? '',
        [t('colabField.centroCostos')]: c.centro_costos ?? '',
        [t('colabField.ccSap')]: c.cc_sap ?? '',
        [t('colabField.correo')]: c.correo ?? '',
        [t('colabField.correoPersonal')]: c.correo_personal ?? '',
        [t('colabField.telefono')]: c.telefono ?? '',
        [t('colabField.lider')]: c.lider ?? '',
        [t('colabField.coordinador')]: c.coordinador ?? '',
        [t('colabField.gerente')]: c.gerente ?? '',
        [t('colabField.contrato')]: c.termino_contrato ?? '',
        [t('colabField.ingreso')]: c.fecha_ingreso ?? '',
        [t('colabField.retiro')]: c.fecha_retiro ?? '',
      })),
      t('collaborators.title'),
      `colaboradores_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    toast.success(t('collaborators.exported', { count: filtrados.length }));
  };

  // ------------------------------------------------------------ formulario
  const abrirNuevo = () => { setEditando(null); setF({}); setOpen(true); };
  const abrirEdicion = (c: Colaborador) => { setEditando(c.cedula); setF(c); setOpen(true); setFicha(null); };
  const cerrar = () => { if (!busy) { setOpen(false); setEditando(null); setF({}); } };

  const guardar = async () => {
    const cedula = (f.cedula ?? '').trim();
    // La sede es obligatoria: sin ella, un Técnico o Líder de sede no podría
    // asignarle equipos (no hay contra qué comparar sus sedes).
    if (!cedula || !f.nombre || !f.sede_id) { toast.error(t('form.requiredFields')); return; }
    setBusy(true);
    try {
      // El estatus manda sobre el booleano: son el mismo dato en dos formatos y
      // dejarlos discrepar rompería los filtros.
      const activoCalculado = f.estado_interno ? esEstatusActivo(f.estado_interno) : (f.activo ?? true);
      const datos = { ...f, activo: activoCalculado };
      if (editando) await actualizarColaborador(editando, datos);
      else await crearColaborador({ ...datos, cedula, creado_en: new Date().toISOString() } as Colaborador);
      toast.success(t('common.success'));
      setOpen(false); setEditando(null); setF({}); refetch();
    } catch (e) {
      const campo = campoDuplicado(e);
      if (campo === 'correo') toast.error(t('collaborators.duplicateEmail', { correo: (f.correo ?? '').trim() }));
      else if (campo === 'cedula') toast.error(t('collaborators.duplicate', { cedula }));
      else toast.error(t('common.error'));
    } finally { setBusy(false); }
  };

  // --------------------------------------------------------------- tabla
  const columnas: Column<Colaborador>[] = [
    {
      key: 'nombre',
      header: t('auth.name'),
      sortValue: (c) => c.nombre,
      cell: (c) => (
        <button onClick={() => setFicha(c)} className="flex items-center gap-2.5 text-left group/nombre">
          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center text-[11px] font-bold shrink-0">
            {initials(c.nombre)}
          </span>
          <span className="min-w-0">
            <span className="block font-medium truncate group-hover/nombre:text-brand-600 dark:group-hover/nombre:text-brand-400 transition-colors">
              {c.nombre}
            </span>
            <span className="block text-xs text-ink-400">C.C. {c.cedula}</span>
          </span>
        </button>
      ),
    },
    { key: 'cargo', header: t('colabField.cargo'), sortValue: (c) => c.cargo, cell: (c) => <span className="text-ink-500 dark:text-ink-300">{c.cargo ?? '—'}</span> },
    { key: 'area', header: t('colabField.area'), sortValue: (c) => c.area, cell: (c) => c.area ?? '—' },
    { key: 'sede', header: t('users.sede'), sortValue: (c) => nombreSede(c), cell: (c) => nombreSede(c) ?? <span className="text-amber-600 dark:text-warning">{t('collaborators.noSede')}</span> },
    {
      key: 'estatus',
      header: t('common.status'),
      sortValue: (c) => c.estado_interno ?? (c.activo ? 'ACTIVO' : 'ZZ'),
      cell: (c) => (
        <span className={`badge ${colorEstatus(c.estado_interno ?? (c.activo ? 'ACTIVO' : ''))}`}>
          {c.estado_interno ? estatusLegible(c.estado_interno) : c.activo ? t('collaborators.active') : t('collaborators.inactive')}
        </span>
      ),
    },
    { key: 'ingreso', header: t('colabField.ingreso'), sortValue: (c) => c.fecha_ingreso, cell: (c) => <span className="tabular-nums text-ink-500 dark:text-ink-300">{c.fecha_ingreso ? fmtDate(c.fecha_ingreso, i18n.language) : '—'}</span> },
    {
      key: 'acciones',
      header: '',
      headerClassName: 'w-20',
      cell: (c) => (
        <div className="flex items-center justify-end gap-0.5">
          {canEdit() && (
            <button onClick={() => abrirEdicion(c)} title={t('common.edit')}
              className="p-1.5 rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10 transition">
              <Pencil size={14} />
            </button>
          )}
          <BotonBorrar
            entidad="colaboradores" id={c.cedula} etiqueta={`${c.nombre} · C.C. ${c.cedula}`}
            invalidar={['colabs', 'colaboradores', 'solicitudesPendientes']}
            className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition"
          />
        </div>
      ),
    },
  ];

  // --------------------------------------------------------------- campos
  const CAMPOS_TEXTO: [keyof Colaborador, string, string?][] = [
    ['cargo', t('colabField.cargo')], ['area', t('colabField.area')], ['correo', t('colabField.correo')], ['correo_personal', t('colabField.correoPersonal')],
    ['telefono', t('colabField.telefono')], ['proyecto', t('colabField.proyecto')], ['centro_costos', t('colabField.centroCostos')],
    ['cc_sap', t('colabField.ccSap')], ['lider', t('colabField.lider')], ['coordinador', t('colabField.coordinador')], ['gerente', t('colabField.gerente')],
    ['ciudad', t('colabField.ciudad')], ['termino_contrato', t('colabField.terminoContrato')],
  ];
  const CAMPOS_FECHA: [keyof Colaborador, string][] = [
    ['fecha_ingreso', t('colabField.fechaIngreso')], ['fecha_retiro', t('colabField.fechaRetiro')], ['fecha_nacimiento', t('colabField.fechaNacimiento')],
  ];

  const chips: { id: string; texto: string; quitar: () => void }[] = [
    estado !== 'todos' && { id: 'estado', texto: estado === 'activos' ? t('collaborators.onlyActive') : t('collaborators.onlyInactive'), quitar: () => setEstado('todos') },
    sedeF && { id: 'sede', texto: sedeF === SIN_SEDE ? t('collaborators.noSede') : (sedes.find((s) => s.id === sedeF)?.nombre ?? ''), quitar: () => setSedeF('') },
    ciudad && { id: 'ciudad', texto: ciudad, quitar: () => setCiudad('') },
    area && { id: 'area', texto: area, quitar: () => setArea('') },
    contrato && { id: 'contrato', texto: estatusLegible(contrato), quitar: () => setContrato('') },
    q && { id: 'q', texto: `"${q}"`, quitar: () => setQ('') },
  ].filter(Boolean) as { id: string; texto: string; quitar: () => void }[];

  const tarjetasKpi = [
    { id: 'total', label: t('collaborators.kpiTotal'), n: kpis.total, icon: Users, tono: 'from-brand-400 to-brand-600', al: () => { limpiar(); } },
    { id: 'activos', label: t('collaborators.kpiActive'), n: kpis.activos, icon: UserCheck, tono: 'from-emerald-400 to-emerald-600', al: () => setEstado('activos') },
    { id: 'inactivos', label: t('collaborators.kpiInactive'), n: kpis.inactivos, icon: UserMinus, tono: 'from-ink-300 to-ink-500', al: () => setEstado('inactivos') },
    { id: 'nuevos', label: t('collaborators.kpiNew'), n: kpis.nuevos, icon: UserPlus, tono: 'from-magenta-400 to-magenta-600', al: () => setOrden('ingreso') },
    { id: 'sedes', label: t('collaborators.kpiSedes'), n: kpis.sedes, icon: Building2, tono: 'from-sky-400 to-sky-600', al: () => {} },
  ];

  return (
    <div>
      <PageHeader
        title={t('collaborators.title')} subtitle={t('collaborators.subtitle')} icon={Users}
        action={(
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={exportar} disabled={!filtrados.length}>{t('common.exportExcel')}</Button>
            {puedeCargarBase && <Button icon={Upload} onClick={() => setImportar(true)}>{t('collaborators.importBase')}</Button>}
            {canEdit() && <Button variant="primary" icon={Plus} onClick={abrirNuevo}>{t('collaborators.new')}</Button>}
          </div>
        )}
      />

      {/* ------------------------------------------------------------ KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {tarjetasKpi.map((k, i) => (
          <motion.button
            key={k.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, type: 'spring', damping: 24, stiffness: 240 }}
            onClick={k.al}
            className="card-interactive p-4 text-left group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-2xl font-bold tabular-nums">
                  <NumeroAnimado value={k.n} />
                </div>
                <div className="text-xs text-ink-400 mt-0.5 truncate">{k.label}</div>
              </div>
              <span className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${k.tono} text-white grid place-items-center shadow-card transition-transform group-hover:scale-105`}>
                <k.icon size={17} />
              </span>
            </div>
          </motion.button>
        ))}
      </div>

      {/* --------------------------------------------------------- filtros */}
      <div className="card p-4 mb-5">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
            <input
              ref={buscadorRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('collaborators.searchPlaceholder')}
              className="input pl-10 pr-16"
            />
            <AnimatePresence>
              {q && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                  onClick={() => { setQ(''); buscadorRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10"
                  aria-label={t('common.clear')}
                >
                  <X size={14} />
                </motion.button>
              )}
            </AnimatePresence>
            {!q && (
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:block text-[10px] font-mono text-ink-400 border border-ink-200 dark:border-white/10 rounded px-1.5 py-0.5">
                /
              </kbd>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Select
              className="!w-auto min-w-[8.5rem]" value={estado} onChange={(v) => setEstado(v as Estado)}
              options={[
                { value: 'todos', label: t('common.all') },
                { value: 'activos', label: t('collaborators.onlyActive') },
                { value: 'inactivos', label: t('collaborators.onlyInactive') },
              ]}
            />
            <Select
              className="!w-auto min-w-[9rem]" value={sedeF} onChange={setSedeF} placeholder={t('users.sede')}
              options={[
                { value: '', label: t('collaborators.allSedes') },
                ...sedes.map(sedeOption),
                { value: SIN_SEDE, label: t('collaborators.noSede') },
              ]}
            />
            <Select
              className="!w-auto min-w-[8.5rem]" value={ciudad} onChange={setCiudad} placeholder={t('colabField.ciudad')}
              options={[{ value: '', label: t('collaborators.allCities') }, ...opcionesDe(colabs, 'ciudad')]}
            />
            <Select
              className="!w-auto min-w-[8.5rem]" value={area} onChange={setArea} placeholder={t('colabField.area')}
              options={[{ value: '', label: t('collaborators.allAreas') }, ...opcionesDe(colabs, 'area')]}
            />
            <Select
              className="!w-auto min-w-[9rem]" value={contrato} onChange={setContrato} placeholder={t('colabField.contrato')}
              options={[{ value: '', label: t('collaborators.allContracts') }, ...opcionesDe(colabs, 'termino_contrato')]}
            />
            <Select
              className="!w-auto min-w-[9.5rem]" value={orden} onChange={(v) => setOrden(v as Orden)}
              options={[
                { value: 'nombre', label: t('collaborators.sortName') },
                { value: 'nombre_desc', label: t('collaborators.sortNameDesc') },
                { value: 'ingreso', label: t('collaborators.sortRecent') },
                { value: 'antiguedad', label: t('collaborators.sortSeniority') },
                { value: 'actualizado', label: t('collaborators.sortUpdated') },
              ]}
            />

            <div className="flex rounded-xl border border-ink-200 dark:border-white/10 overflow-hidden">
              {([['tarjetas', LayoutGrid], ['tabla', Table2]] as const).map(([v, Icono]) => (
                <button
                  key={v}
                  onClick={() => cambiarVista(v)}
                  aria-label={v}
                  aria-pressed={vista === v}
                  className={`px-3 py-2.5 transition-colors ${
                    vista === v
                      ? 'bg-brand-500 text-white'
                      : 'text-ink-400 hover:bg-ink-100 dark:hover:bg-white/5'
                  }`}
                >
                  <Icono size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filtros activos: visibles y quitables uno a uno. */}
        <AnimatePresence initial={false}>
          {chips.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-1.5 pt-3">
                {chips.map((c) => (
                  <motion.button
                    key={c.id} layout
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    onClick={c.quitar}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 transition-colors"
                  >
                    {c.texto} <X size={11} />
                  </motion.button>
                ))}
                <button onClick={limpiar} className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 px-1.5">
                  {t('common.clearFilters')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* -------------------------------------------------------- resultado */}
      {!isLoading && (
        <div className="flex items-center justify-between gap-3 mb-3 px-1">
          <p className="text-sm text-ink-400">
            {t('collaborators.showing', { visibles: mostrados.length, total: filtrados.length })}
            {hayFiltros && colabs.length !== filtrados.length && (
              <span className="text-ink-300 dark:text-ink-500"> · {t('collaborators.ofTotal', { total: colabs.length })}</span>
            )}
          </p>
        </div>
      )}

      {isLoading && <SkeletonGrid count={6} />}

      {!isLoading && colabs.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Users}
            title={t('collaborators.emptyTitle')}
            description={t('collaborators.emptyDesc')}
            action={canEdit() && (
              <>
                {puedeCargarBase && (
                  <Button variant="primary" icon={Upload} onClick={() => setImportar(true)}>{t('collaborators.importBase')}</Button>
                )}
                <Button icon={Plus} onClick={abrirNuevo}>{t('collaborators.new')}</Button>
              </>
            )}
          />
        </div>
      )}

      {!isLoading && colabs.length > 0 && filtrados.length === 0 && (
        <div className="card">
          <EmptyState
            variant="search" icon={Search}
            title={t('common.noResultsTitle')} description={t('common.noResultsDesc')}
            action={<Button onClick={limpiar}>{t('common.clearFilters')}</Button>}
          />
        </div>
      )}

      {/* ------------------------------------------------------- tarjetas */}
      {!isLoading && vista === 'tarjetas' && filtrados.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mostrados.map((c, i) => (
            <motion.div
              key={c.cedula}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min((i % PASO_VISIBLES) * 0.02, 0.3), type: 'spring', damping: 26, stiffness: 260 }}
              className="card-interactive p-5 relative group cursor-pointer"
              onClick={() => setFicha(c)}
            >
              <div
                className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition"
                onClick={(e) => e.stopPropagation()}
              >
                {canEdit() && (
                  <button onClick={() => abrirEdicion(c)} title={t('common.edit')}
                    className="p-1.5 rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10 transition">
                    <Pencil size={15} />
                  </button>
                )}
                <BotonBorrar
                  entidad="colaboradores" id={c.cedula} etiqueta={`${c.nombre} · C.C. ${c.cedula}`}
                  invalidar={['colabs', 'colaboradores', 'solicitudesPendientes']}
                  className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition"
                />
              </div>

              <div className="flex items-center gap-3 mb-3 pr-14">
                <div className="w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center font-bold">
                  {initials(c.nombre)}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.nombre}</div>
                  <div className="text-xs text-ink-400">C.C. {c.cedula}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`badge ${colorEstatus(c.estado_interno ?? (c.activo ? 'ACTIVO' : ''))}`}>
                  {c.estado_interno ? estatusLegible(c.estado_interno) : c.activo ? t('collaborators.active') : t('collaborators.inactive')}
                </span>
                {c.area && <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200">{c.area}</span>}
              </div>

              <div className="space-y-1.5 text-sm text-ink-500 dark:text-ink-300">
                {c.cargo && <div className="truncate">{c.cargo}</div>}
                {(c.centro_costos ?? c.proyecto) && (
                  <div className="flex items-center gap-2 min-w-0"><Building2 size={14} className="shrink-0" /> <span className="truncate">{c.centro_costos ?? c.proyecto}</span></div>
                )}
                {c.correo && <div className="flex items-center gap-2 min-w-0"><Mail size={14} className="shrink-0" /> <span className="truncate">{c.correo}</span></div>}
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin size={14} className="shrink-0" />
                  <span className="truncate">
                    {nombreSede(c) ?? <span className="text-amber-600 dark:text-warning">{t('collaborators.noSede')}</span>}
                    {c.ciudad && nombreSede(c) !== c.ciudad && <span className="text-ink-400"> · {c.ciudad}</span>}
                  </span>
                </div>
                {c.fecha_ingreso && (
                  <div className="flex items-center gap-2"><CalendarDays size={14} className="shrink-0" /> {fmtDate(c.fecha_ingreso, i18n.language)}</div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------- tabla */}
      {!isLoading && vista === 'tabla' && filtrados.length > 0 && (
        <DataTable rows={mostrados} columns={columnas} rowKey={(c) => c.cedula} />
      )}

      {/* Centinela de scroll infinito + salida manual por si el observer no dispara. */}
      <div ref={centinela} className="h-10" />
      {visibles < filtrados.length && (
        <div className="flex justify-center pb-4">
          <button onClick={() => setVisibles((v) => v + PASO_VISIBLES)} className="btn-secondary">
            {t('collaborators.loadMore', { count: Math.min(PASO_VISIBLES, filtrados.length - visibles) })}
          </button>
        </div>
      )}

      {/* -------------------------------------------------------- modales */}
      <FichaColaborador
        colaborador={ficha}
        sede={ficha ? nombreSede(ficha) : null}
        onClose={() => setFicha(null)}
        onEditar={canEdit() ? abrirEdicion : undefined}
      />

      <ImportarBaseModal
        open={importar}
        onClose={() => setImportar(false)}
        existentes={colabs}
        onCargado={() => refetch()}
      />

      <Modal
        open={open} onClose={cerrar} size="lg"
        title={editando ? t('collaborators.edit') : t('collaborators.new')}
        subtitle={editando ? t('collaborators.editHint') : undefined}
      >
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label req">C.C.</label>
              <input
                className="input disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={!!editando}
                value={f.cedula ?? ''} onChange={(e) => setF({ ...f, cedula: e.target.value })}
              />
            </div>
            <div>
              <label className="label req">{t('auth.name')}</label>
              <input className="input" value={f.nombre ?? ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
            </div>
            <div>
              <label className="label req">{t('users.sede')}</label>
              <Select
                value={f.sede_id ?? ''} onChange={(v) => setF({ ...f, sede_id: v || null })}
                placeholder={t('users.selectSede')} options={sedes.map(sedeOption)}
              />
            </div>
            <div>
              <label className="label">{t('colabField.estatusInterno')}</label>
              <Select
                value={f.estado_interno ?? ''}
                onChange={(v) => setF({ ...f, estado_interno: v || null, activo: v ? esEstatusActivo(v) : true })}
                placeholder="ACTIVO"
                options={[
                  { value: '', label: t('collaborators.noStatus') },
                  { value: 'ACTIVO', label: t('collaborators.active') },
                  ...opcionesDe(colabs, 'estado_interno').filter((o) => o.value !== 'ACTIVO'),
                ]}
              />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-ink-500 dark:text-ink-300 mb-3">{t('collaborators.laborData')}</h4>
            <div className="grid sm:grid-cols-2 gap-4">
              {CAMPOS_TEXTO.map(([k, label]) => (
                <div key={k}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    value={(f[k] as string | null) ?? ''}
                    onChange={(e) => setF({ ...f, [k]: e.target.value })}
                  />
                </div>
              ))}
              {CAMPOS_FECHA.map(([k, label]) => (
                <div key={k}>
                  <label className="label">{label}</label>
                  <input
                    type="date" className="input"
                    value={((f[k] as string | null) ?? '').slice(0, 10)}
                    onChange={(e) => setF({ ...f, [k]: e.target.value || null })}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={cerrar} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={guardar} loading={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

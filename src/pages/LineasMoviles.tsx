/**
 * Líneas móviles · SIM corporativas.
 *
 * Esta pantalla reemplaza al archivo que se pasaba por correo. De ahí sus tres
 * capas, que son las mismas que en Colaboradores porque el problema es el
 * mismo —cientos de filas de las que solo interesa una— pero con las preguntas
 * propias del inventario de líneas:
 *
 *   · KPIs que además son filtros: "¿cuántas hay en stock?" es la pregunta que
 *     se hace todos los meses, y el número que la responde también la abre.
 *   · Buscador y filtros combinables, con los valores sacados de los propios
 *     datos (los proyectos y los centros de resultados no son un catálogo fijo).
 *   · Tres vistas del mismo resultado: tabla para comparar, tarjetas para
 *     reconocer una línea de un vistazo y gráficos para mirar el conjunto.
 *
 * Alcance por rol: ADMIN y Jefe (LIDER) ven todo el parque. El Líder de sede y
 * el Técnico ven las líneas de SUS sedes y, además, las que todavía no tienen
 * sede: son el fondo común de donde salen las asignaciones, y ocultárselas
 * dejaría a media empresa sin poder trabajar con lo recién cargado.
 */

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  Cell, LabelList,
} from 'recharts';
import {
  AlertTriangle, Building2, ChartPie, CreditCard, Download, FileDown, Layers, LayoutGrid,
  Loader2, MapPin, Package, Pencil, Plus, Signal, Smartphone, Table2, Trash2, Upload, User,
  UserCheck, X,
} from 'lucide-react';
import { BarraFiltros, type CampoFiltro, type ChipFiltro } from '@/components/ui/BarraFiltros';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { NumeroAnimado } from '@/components/ui/NumeroAnimado';
import { Resaltado } from '@/components/ui/Resaltado';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { GraficoCard, type GraficoHandle } from '@/components/analitica/GraficoCard';
import { FichaLinea } from '@/components/lineas/FichaLinea';
import { ImportarLineasModal } from '@/components/lineas/ImportarLineasModal';
import {
  actualizarLinea, crearLinea, lineaExiste, listColaboradores, listLineas, listSedes,
  ocultarLinea,
} from '@/lib/api';
import {
  CATEGORIAS, COLOR_CATEGORIA, ETIQUETA_CATEGORIA, categoriaEstado, colorCategoria,
  estadoCanonico, fmtNumero, normIccid, normImei, normNumero, type CategoriaLinea,
} from '@/lib/lineas/estado';
import {
  exportarLineasAmpliado, exportarLineasCsv, exportarLineasExcel,
} from '@/lib/lineas/exportar';
import { proponerEnlaces, type EnlacePropuesto } from '@/lib/lineas/base';
import { terminosDe } from '@/lib/colaboradores/buscar';
import { normNombre } from '@/lib/importador/normalizar';
import { exportarPdf } from '@/lib/exportarGrafico';
import { paletaPara } from '@/lib/paletaGraficos';
import { useEsOscuro } from '@/lib/useEsOscuro';
import { fmtDateTime } from '@/lib/format';
import { useApp } from '@/store/useApp';
import { ordenarSedesPorPais, useFiltroPais } from '@/lib/pais';
import type { Colaborador, LineaMovil, Sede } from '@/types';

const PASO_VISIBLES = 40;
const SIN_SEDE = '__sin_sede';

type Vista = 'tabla' | 'tarjetas' | 'graficos';
type Orden = 'numero' | 'estado' | 'proyecto' | 'titular' | 'actualizado';

const sedeOption = (s: Sede): SelectOption =>
  ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre });

/** Opciones de un filtro sacadas de los propios datos, ordenadas por frecuencia. */
function opcionesDe(lineas: LineaMovil[], campo: keyof LineaMovil, sufijo: string): SelectOption[] {
  const m = new Map<string, number>();
  for (const l of lineas) {
    const v = l[campo];
    if (typeof v !== 'string' || !v.trim()) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v, n]) => ({ value: v, label: v, description: `${n} ${sufijo}` }));
}

export function LineasMoviles() {
  const { t, i18n } = useTranslation();
  const { perfil, misSedes, canEdit, can, operaTodasLasSedes } = useApp();
  const oscuro = useEsOscuro();
  const paleta = paletaPara(oscuro);

  // Los cuatro roles operativos cargan y editan; el resto solo consulta. La
  // barrera real son las políticas RLS de `lineas_moviles`: esto solo decide
  // qué botones se pintan.
  const puedeEditar = canEdit();
  const puedeImportar = can('ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO');
  // Retirar una línea del inventario es una decisión de inventario, no de
  // operación diaria: la toman ADMIN y Jefe, y es reversible (borrado suave).
  const puedeRetirar = can('ADMIN', 'LIDER');

  const { data: todas = [], refetch, isLoading, error } = useQuery({
    queryKey: ['lineas'], queryFn: listLineas,
  });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const { data: colabs = [] } = useQuery({ queryKey: ['colabs'], queryFn: listColaboradores });
  // País de quien mira: el listado abre en el suyo y sus sedes van primero.
  const pais = useFiltroPais();

  const porCedula = useMemo(
    () => new Map(colabs.map((c) => [c.cedula, c])), [colabs],
  );
  const nombreSede = useMemo(() => {
    const m = new Map(sedes.map((s) => [s.id, s.nombre]));
    return (id?: string | null) => (id ? m.get(id) ?? null : null);
  }, [sedes]);

  // ------------------------------------------------------------- alcance
  const alcance = useMemo(() => {
    if (operaTodasLasSedes()) return todas;
    const permitidas = new Set(misSedes);
    if (perfil?.sede_id) permitidas.add(perfil.sede_id);
    return todas.filter((l) => !l.sede_id || permitidas.has(l.sede_id));
  }, [todas, misSedes, perfil, operaTodasLasSedes]);

  // ------------------------------------------------------------- filtros
  const [q, setQ] = useState('');
  const qDiferida = useDeferredValue(q);
  const [categoria, setCategoria] = useState<CategoriaLinea | ''>('');
  const [proyecto, setProyecto] = useState('');
  const [cr, setCr] = useState('');
  const [sedeF, setSedeF] = useState('');
  const [hojaF, setHojaF] = useState('');
  const [orden, setOrden] = useState<Orden>('numero');
  const [soloSinTitular, setSoloSinTitular] = useState(false);
  const [soloSinNumero, setSoloSinNumero] = useState(false);
  const [vista, setVista] = useState<Vista>(
    () => (localStorage.getItem('lineasVista') as Vista) ?? 'tabla',
  );
  const [visibles, setVisibles] = useState(PASO_VISIBLES);

  const cambiarVista = (v: Vista) => { setVista(v); localStorage.setItem('lineasVista', v); };

  // ------------------------------------------------------------- modales
  const [ficha, setFicha] = useState<LineaMovil | null>(null);
  const [importar, setImportar] = useState(false);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<LineaMovil | null>(null);
  const [f, setF] = useState<Partial<LineaMovil>>({});
  const [busy, setBusy] = useState(false);
  const [retirando, setRetirando] = useState<LineaMovil | null>(null);
  const [exportando, setExportando] = useState(false);
  const [enlazando, setEnlazando] = useState(false);
  const [verEnlaces, setVerEnlaces] = useState(false);
  const [avanceEnlace, setAvanceEnlace] = useState(0);

  // ------------------------------------------------------------ búsqueda
  // Los mismos términos normalizados que usa Colaboradores: sin acentos, en
  // mayúsculas y sin puntuación. Es lo que espera `Resaltado`, y además hace
  // que "310 234" encuentre a la 3102345678 sin lógica aparte para los dígitos.
  const terminos = useMemo(() => terminosDe(qDiferida), [qDiferida]);

  const kpis = useMemo(() => {
    let activas = 0; let stock = 0; let canceladas = 0; let sinTitular = 0; let sinNumero = 0;
    for (const l of alcance) {
      const c = categoriaEstado(l.estado);
      if (c === 'ACTIVA') activas++;
      else if (c === 'STOCK') stock++;
      else if (c === 'CANCELADA') canceladas++;
      if (!l.nombre && !l.cedula_asignado && !l.cedula_archivo) sinTitular++;
      // SIM en empaque: están en el inventario pero todavía no son una línea.
      if (!l.numero) sinNumero++;
    }
    return { total: alcance.length, activas, stock, canceladas, sinTitular, sinNumero };
  }, [alcance]);

  const filtradas = useMemo(() => {
    const cmp: Record<Orden, (a: LineaMovil, b: LineaMovil) => number> = {
      // Las SIM sin número van al final: no son una línea todavía.
      numero: (a, b) => (a.numero ?? 'ZZ').localeCompare(b.numero ?? 'ZZ'),
      estado: (a, b) => (a.estado ?? 'ZZ').localeCompare(b.estado ?? 'ZZ'),
      proyecto: (a, b) => (a.proyecto ?? 'ZZ').localeCompare(b.proyecto ?? 'ZZ'),
      titular: (a, b) => (a.nombre ?? 'ZZ').localeCompare(b.nombre ?? 'ZZ'),
      actualizado: (a, b) => (b.actualizado_en ?? b.creado_en ?? '').localeCompare(a.actualizado_en ?? a.creado_en ?? ''),
    };

    const res = alcance.filter((l) => {
      if (!pais.incluye(l.sede_id)) return false;
      if (categoria && categoriaEstado(l.estado) !== categoria) return false;
      if (proyecto && l.proyecto !== proyecto) return false;
      if (cr && l.cr !== cr) return false;
      if (sedeF === SIN_SEDE ? !!l.sede_id : sedeF && l.sede_id !== sedeF) return false;
      if (hojaF && (l.hoja_origen ?? '') !== hojaF) return false;
      if (soloSinTitular && (l.nombre || l.cedula_asignado || l.cedula_archivo)) return false;
      if (soloSinNumero && l.numero) return false;
      if (!terminos.length) return true;
      // Se busca sobre todo lo que identifica una línea: número, ICCID, titular
      // (el del archivo y el verificado), proyecto, CR, estado y las notas.
      const heno = normNombre([
        l.numero, l.iccid, l.imei, l.nombre, l.proyecto, l.cr, l.estado,
        l.solicitud_claro, l.observacion, l.hoja_origen, l.cedula_archivo,
        l.cedula_asignado ? porCedula.get(l.cedula_asignado)?.nombre : null,
      ].filter(Boolean).join(' '));
      return terminos.every((tm) => heno.includes(tm));
    });

    return [...res].sort(cmp[orden]);
  }, [alcance, terminos, pais, categoria, proyecto, cr, sedeF, hojaF, soloSinTitular, soloSinNumero, orden, porCedula]);

  useEffect(() => { setVisibles(PASO_VISIBLES); },
    [qDiferida, pais.valor, categoria, proyecto, cr, sedeF, hojaF, soloSinTitular, soloSinNumero, orden]);

  // Carga la siguiente tanda al llegar al final del listado.
  const centinela = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = centinela.current;
    if (!el) return;
    const io = new IntersectionObserver((entradas) => {
      if (entradas[0]?.isIntersecting) setVisibles((v) => (v < filtradas.length ? v + PASO_VISIBLES : v));
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [filtradas.length]);

  const mostradas = filtradas.slice(0, visibles);
  const hayFiltros = !!(q || categoria || proyecto || cr || pais.activo || sedeF || hojaF || soloSinTitular || soloSinNumero);
  const limpiar = () => {
    setQ(''); setCategoria(''); setProyecto(''); setCr(''); pais.setValor(''); setSedeF(''); setHojaF('');
    setSoloSinTitular(false); setSoloSinNumero(false);
  };

  /** Hojas del libro presentes en los datos; el filtro solo aparece si hay más de una. */
  const hojas = useMemo(
    () => [...new Set(alcance.map((l) => l.hoja_origen).filter(Boolean))] as string[],
    [alcance],
  );

  // ------------------------------------------------------------- series
  const porCategoria = useMemo(() => CATEGORIAS
    .map((c) => ({
      clave: c,
      name: t(ETIQUETA_CATEGORIA[c]),
      value: filtradas.filter((l) => categoriaEstado(l.estado) === c).length,
      fill: colorCategoria(c, oscuro),
    }))
    .filter((d) => d.value > 0), [filtradas, t, oscuro]);

  const agrupar = (campo: keyof LineaMovil, tope = 10) => {
    const m = new Map<string, number>();
    for (const l of filtradas) {
      const v = l[campo];
      const k = typeof v === 'string' && v.trim() ? v : t('lines.unassigned');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, tope);
  };

  const porProyecto = useMemo(() => agrupar('proyecto'), [filtradas, t]);
  const porCr = useMemo(() => agrupar('cr'), [filtradas, t]);
  const porHoja = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filtradas) {
      const k = l.hoja_origen?.trim() || t('lines.noSheet');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtradas, t]);

  const porSede = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filtradas) {
      const k = nombreSede(l.sede_id) ?? t('lines.noSede');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtradas, nombreSede, t]);

  // ---------------------------------------------------------- exportación
  const refs = {
    categoria: useRef<GraficoHandle>(null),
    proyecto: useRef<GraficoHandle>(null),
    cr: useRef<GraficoHandle>(null),
    sede: useRef<GraficoHandle>(null),
    hoja: useRef<GraficoHandle>(null),
  };
  const superficie = oscuro ? '#1c201f' : '#ffffff';
  const tinta = oscuro ? '#A1ADAD' : '#6a7473';
  const tintaFuerte = oscuro ? '#E0EBE7' : '#2c3130';
  const rejilla = oscuro ? 'rgba(255,255,255,0.07)' : 'rgba(120,120,128,0.13)';

  const exportarExcel = () => {
    exportarLineasExcel(filtradas);
    toast.success(t('lines.exported', { count: filtradas.length }));
  };
  const exportarCsv = () => {
    exportarLineasCsv(filtradas);
    toast.success(t('lines.exported', { count: filtradas.length }));
  };
  const exportarDetalle = () => {
    exportarLineasAmpliado(
      filtradas.map((l) => ({
        ICCID: l.iccid ?? '',
        NUMERO: l.numero,
        IMEI: l.imei ?? '',
        ESTADO: l.estado ?? '',
        [t('lines.colCategory')]: t(ETIQUETA_CATEGORIA[categoriaEstado(l.estado)]),
        [t('lines.fSheet')]: l.hoja_origen ?? '',
        NOMBRE: l.nombre ?? '',
        [t('lines.colVerifiedOwner')]: l.cedula_asignado
          ? `${porCedula.get(l.cedula_asignado)?.nombre ?? ''} (${l.cedula_asignado})` : '',
        [t('lines.fCedula')]: l.cedula_archivo ?? '',
        CR: l.cr ?? '',
        PROYECTO: l.proyecto ?? '',
        [t('users.sede')]: nombreSede(l.sede_id) ?? '',
        [t('lines.fOperator')]: l.operador ?? '',
        OBSERVACION: l.observacion ?? '',
        'FECHA DE CORTE': l.fecha_corte ?? '',
        'SOLICITUD CLARO': l.solicitud_claro ?? '',
        [t('lines.colUpdated')]: l.actualizado_en ?? l.creado_en ?? '',
      })),
      t('lines.title'),
    );
    toast.success(t('lines.exported', { count: filtradas.length }));
  };

  const exportarGraficosPdf = async () => {
    setExportando(true);
    try {
      const bloques = [
        { titulo: t('lines.chartState'), ref: refs.categoria },
        { titulo: t('lines.chartProject'), ref: refs.proyecto },
        { titulo: t('lines.chartCr'), ref: refs.cr },
        { titulo: t('lines.chartSede'), ref: refs.sede },
        { titulo: t('lines.chartSheet'), ref: refs.hoja },
      ]
        .map((b) => ({ titulo: b.titulo, contenedor: b.ref.current?.contenedor() }))
        .filter((b): b is { titulo: string; contenedor: HTMLElement } => !!b.contenedor);
      await exportarPdf(bloques, {
        titulo: t('lines.title'),
        subtitulo: t('lines.pdfSubtitle', { count: filtradas.length }),
        fondo: superficie,
      });
    } catch (e: any) {
      toast.error(e?.message ?? t('common.error'));
    } finally { setExportando(false); }
  };

  // ------------------------------------------------- enlazar con la planta
  //
  // El cruce con la planta se hace al importar, pero depende de que las
  // personas estén cargadas en ese momento: quien importa las líneas antes que
  // la planta se queda con todo sin titular y ya no tiene el archivo a mano
  // para repetirlo. Esto rehace el cruce sobre lo que ya está guardado.
  const enlaces = useMemo(
    () => proponerEnlaces(alcance, colabs), [alcance, colabs],
  );

  const aplicarEnlaces = async () => {
    if (!enlaces.length) return;
    setEnlazando(true);
    setAvanceEnlace(0);
    let hechos = 0;
    try {
      // De uno en uno y a propósito: son decenas, no miles, y así un fallo a
      // mitad deja enlazado lo que ya pasó en vez de perderlo todo.
      for (const e of enlaces) {
        await actualizarLinea(e.id, { cedula_asignado: e.cedula });
        hechos++;
        setAvanceEnlace(hechos / enlaces.length);
      }
      toast.success(t('lines.linkedOk', { count: hechos }));
      setVerEnlaces(false);
      refetch();
    } catch (err) {
      toast.error(t('lines.linkedPartial', { count: hechos, msg: (err as Error).message }));
      refetch();
    } finally { setEnlazando(false); }
  };

  // ------------------------------------------------------------ formulario
  const abrirNueva = () => { setEditando(null); setF({ operador: 'CLARO', estado: 'OK' }); setOpen(true); };
  const abrirEdicion = (l: LineaMovil) => { setEditando(l); setF(l); setOpen(true); setFicha(null); };
  const cerrar = () => { if (!busy) { setOpen(false); setEditando(null); setF({}); } };

  const guardar = async () => {
    // El número es opcional: una SIM en empaque todavía no tiene línea. Lo que
    // no puede faltar es ALGO que la identifique, número o ICCID.
    const numero = normNumero(f.numero);
    const iccid = normIccid(f.iccid);
    if (f.numero?.trim() && !numero) { toast.error(t('lines.badNumber')); return; }
    if (!numero && !iccid) { toast.error(t('lines.needId')); return; }
    setBusy(true);
    try {
      // Se avisa antes de que la base devuelva un choque de unicidad, que nadie
      // sabe interpretar.
      if (await lineaExiste({ numero, iccid }, editando?.id)) {
        toast.error(t('lines.duplicate', { numero: numero ? fmtNumero(numero) : iccid }));
        return;
      }
      const datos: Partial<LineaMovil> = {
        ...f,
        numero,
        iccid,
        imei: normImei(f.imei),
        estado: estadoCanonico(f.estado),
      };
      if (editando) await actualizarLinea(editando.id, datos);
      else await crearLinea(datos);
      toast.success(t('common.success'));
      setOpen(false); setEditando(null); setF({}); refetch();
    } catch (e) {
      toast.error((e as Error).message || t('common.error'));
    } finally { setBusy(false); }
  };

  const retirar = async () => {
    if (!retirando || !perfil) return;
    setBusy(true);
    try {
      await ocultarLinea(retirando.id, perfil.id);
      toast.success(t('lines.retired', { numero: etiquetaDe(retirando) }));
      setRetirando(null); setFicha(null); refetch();
    } catch (e) {
      toast.error((e as Error).message || t('common.error'));
    } finally { setBusy(false); }
  };

  // --------------------------------------------------------------- tabla
  const titularDe = (l: LineaMovil): Colaborador | null =>
    (l.cedula_asignado ? porCedula.get(l.cedula_asignado) ?? null : null);

  /** Cómo se nombra una línea: por su número, y si aún no tiene, por su ICCID. */
  const etiquetaDe = (l: LineaMovil): string =>
    (l.numero ? fmtNumero(l.numero) : `ICCID ${l.iccid ?? '—'}`);

  const columnas: Column<LineaMovil>[] = [
    {
      key: 'numero',
      header: t('lines.fNumero'),
      sortValue: (l) => l.numero,
      cell: (l) => (
        <button onClick={() => setFicha(l)} className="text-left group/num min-w-0">
          <span className="block font-medium tabular-nums group-hover/num:text-brand-600 dark:group-hover/num:text-brand-400 transition-colors">
            {l.numero
              ? <Resaltado texto={fmtNumero(l.numero)} terminos={terminos} />
              // Una SIM en empaque no tiene número: se dice, en vez de dejar el
              // hueco en blanco como si faltara el dato.
              : <span className="text-ink-400 italic font-normal">{t('lines.notActivated')}</span>}
          </span>
          {l.iccid && (
            <span className="block text-[11px] text-ink-400 tabular-nums truncate max-w-[13rem]">
              ICCID <Resaltado texto={l.iccid} terminos={terminos} />
            </span>
          )}
          {l.imei && (
            <span className="block text-[11px] text-ink-400 tabular-nums truncate max-w-[13rem]">
              IMEI <Resaltado texto={l.imei} terminos={terminos} />
            </span>
          )}
        </button>
      ),
    },
    {
      key: 'estado',
      header: t('common.status'),
      sortValue: (l) => l.estado,
      cell: (l) => {
        const c = categoriaEstado(l.estado);
        return (
          <span className={`badge ${COLOR_CATEGORIA[c]}`} title={t(ETIQUETA_CATEGORIA[c])}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {l.estado || t(ETIQUETA_CATEGORIA[c])}
          </span>
        );
      },
    },
    {
      key: 'titular',
      header: t('lines.fNombre'),
      sortValue: (l) => l.nombre,
      cell: (l) => {
        const c = titularDe(l);
        if (!l.nombre && !c && !l.cedula_archivo) {
          return <span className="text-amber-600 dark:text-warning text-xs">{t('lines.noOwner')}</span>;
        }
        return (
          <span className="min-w-0 block">
            <span className="block truncate"><Resaltado texto={c?.nombre ?? l.nombre ?? ''} terminos={terminos} /></span>
            {c ? (
              <span className="block text-[11px] text-ink-400">C.C. {c.cedula}</span>
            ) : l.cedula_archivo && (
              // La cédula está, la persona ya no: se dice, porque explica por
              // qué esta fila no lleva a ninguna ficha.
              <span className="block text-[11px] text-ink-400" title={t('lines.notInStaff')}>
                C.C. <Resaltado texto={l.cedula_archivo} terminos={terminos} />
                <span className="text-ink-300 dark:text-ink-500"> · {t('lines.notInStaff')}</span>
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'proyecto',
      header: t('lines.fProyecto'),
      sortValue: (l) => l.proyecto,
      cell: (l) => (
        <span className="min-w-0 block">
          <span className="block truncate max-w-[16rem] text-ink-600 dark:text-ink-200">
            <Resaltado texto={l.proyecto ?? '—'} terminos={terminos} />
          </span>
          {l.cr && <span className="block text-[11px] text-ink-400">CR {l.cr}</span>}
        </span>
      ),
    },
    {
      key: 'sede',
      header: t('users.sede'),
      sortValue: (l) => nombreSede(l.sede_id),
      cell: (l) => nombreSede(l.sede_id)
        ?? <span className="text-ink-400 text-xs">{t('lines.noSede')}</span>,
    },
    {
      key: 'acciones',
      header: '',
      headerClassName: 'w-24',
      cell: (l) => (
        <div className="flex items-center justify-end gap-0.5">
          {puedeEditar && (
            <button onClick={() => abrirEdicion(l)} title={t('common.edit')}
              className="p-1.5 rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10 transition">
              <Pencil size={14} />
            </button>
          )}
          {puedeRetirar && (
            <button onClick={() => setRetirando(l)} title={t('lines.retire')}
              className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // ---------------------------------------------------------------- KPIs
  const tarjetasKpi = [
    { id: 'total', label: t('lines.kpiTotal'), n: kpis.total, icon: Smartphone, tono: 'from-brand-400 to-brand-600', al: limpiar },
    { id: 'activas', label: t('lines.kpiActive'), n: kpis.activas, icon: Signal, tono: 'from-emerald-400 to-emerald-600', al: () => setCategoria('ACTIVA') },
    { id: 'stock', label: t('lines.kpiStock'), n: kpis.stock, icon: CreditCard, tono: 'from-sky-400 to-sky-600', al: () => setCategoria('STOCK') },
    { id: 'canceladas', label: t('lines.kpiCancelled'), n: kpis.canceladas, icon: X, tono: 'from-rose-400 to-rose-600', al: () => setCategoria('CANCELADA') },
    { id: 'sinTitular', label: t('lines.kpiNoOwner'), n: kpis.sinTitular, icon: User, tono: 'from-amber-400 to-amber-600', al: () => setSoloSinTitular(true) },
    // Las SIM sin estrenar son inventario disponible y nadie las tenía contadas
    // hasta ahora: vivían en una hoja aparte del libro.
    { id: 'sinNumero', label: t('lines.kpiNoNumber'), n: kpis.sinNumero, icon: Package, tono: 'from-violet-400 to-violet-600', al: () => setSoloSinNumero(true) },
  ];

  const campos: CampoFiltro[] = [
    {
      id: 'estado', label: t('common.status'), value: categoria, activo: !!categoria,
      onChange: (v) => setCategoria(v as CategoriaLinea | ''),
      options: [
        { value: '', label: t('lines.allStates') },
        ...CATEGORIAS.map((c) => ({ value: c, label: t(ETIQUETA_CATEGORIA[c]) })),
      ],
    },
    {
      id: 'proyecto', label: t('lines.fProyecto'), value: proyecto, onChange: setProyecto, activo: !!proyecto,
      options: [{ value: '', label: t('lines.allProjects') }, ...opcionesDe(alcance, 'proyecto', t('lines.linesCount'))],
    },
    {
      id: 'cr', label: 'CR', value: cr, onChange: setCr, activo: !!cr,
      options: [{ value: '', label: t('lines.allCr') }, ...opcionesDe(alcance, 'cr', t('lines.linesCount'))],
    },
    ...(pais.mostrar ? [{
      id: 'pais', label: t('common.country'), value: pais.valor, onChange: pais.setValor,
      options: pais.opciones, activo: pais.activo,
    }] : []),
    {
      id: 'sede', label: t('users.sede'), value: sedeF, onChange: setSedeF, activo: !!sedeF,
      options: [
        { value: '', label: t('lines.allSedes') },
        ...ordenarSedesPorPais(sedes, pais.paisPropio).map(sedeOption),
        { value: SIN_SEDE, label: t('lines.noSede') },
      ],
    },
    // La hoja del libro de la que salió cada línea. Solo aparece si de verdad
    // vinieron de varias: con una sola no dice nada.
    ...(hojas.length > 1 ? [{
      id: 'hoja', label: t('lines.fSheet'), value: hojaF, onChange: setHojaF, activo: !!hojaF,
      options: [
        { value: '', label: t('lines.allSheets') },
        ...hojas.map((h) => ({
          value: h,
          label: h,
          description: t('lines.linesCountN', { count: alcance.filter((l) => l.hoja_origen === h).length }),
        })),
      ],
    }] : []),
    {
      id: 'orden', label: t('common.sortBy'), value: orden, onChange: (v) => setOrden(v as Orden),
      // Ordenar no filtra: no se resalta ni sale en las pastillas.
      activo: false,
      options: [
        { value: 'numero', label: t('lines.sortNumber') },
        { value: 'estado', label: t('lines.sortState') },
        { value: 'proyecto', label: t('lines.sortProject') },
        { value: 'titular', label: t('lines.sortOwner') },
        { value: 'actualizado', label: t('lines.sortUpdated') },
      ],
    },
  ];

  const chips: ChipFiltro[] = [
    categoria && { id: 'cat', texto: t(ETIQUETA_CATEGORIA[categoria]), quitar: () => setCategoria('') },
    proyecto && { id: 'proy', texto: proyecto, quitar: () => setProyecto('') },
    cr && { id: 'cr', texto: `CR ${cr}`, quitar: () => setCr('') },
    pais.activo && { id: 'pais', texto: pais.etiqueta ?? '', quitar: () => pais.setValor('') },
    sedeF && {
      id: 'sede',
      texto: sedeF === SIN_SEDE ? t('lines.noSede') : (sedes.find((s) => s.id === sedeF)?.nombre ?? ''),
      quitar: () => setSedeF(''),
    },
    hojaF && { id: 'hoja', texto: hojaF, quitar: () => setHojaF('') },
    soloSinTitular && { id: 'sinTit', texto: t('lines.kpiNoOwner'), quitar: () => setSoloSinTitular(false) },
    soloSinNumero && { id: 'sinNum', texto: t('lines.kpiNoNumber'), quitar: () => setSoloSinNumero(false) },
    q && { id: 'q', texto: `"${q}"`, quitar: () => setQ('') },
  ].filter(Boolean) as ChipFiltro[];

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

  const CAMPOS_FORM: [keyof LineaMovil, string, string?][] = [
    ['iccid', t('lines.fIccid'), t('lines.hIccid')],
    ['imei', t('lines.fImei'), t('lines.hImei')],
    ['cedula_archivo', t('lines.fCedula'), t('lines.hCedula')],
    ['nombre', t('lines.fNombre'), t('lines.hNombre')],
    ['cr', t('lines.fCr')],
    ['proyecto', t('lines.fProyecto')],
    ['solicitud_claro', t('lines.fSolicitud')],
    ['fecha_corte', t('lines.fFechaCorte'), t('lines.hFechaCorte')],
  ];

  return (
    <div>
      <PageHeader
        title={t('lines.title')} subtitle={t('lines.subtitle')} icon={Smartphone}
        action={(
          <div className="flex flex-wrap gap-2">
            <Button icon={Download} onClick={exportarExcel} disabled={!filtradas.length}>
              {t('lines.exportOriginal')}
            </Button>
            {/* Solo aparece si de verdad hay algo que enlazar: un botón que no
                hace nada es peor que no tenerlo. */}
            {puedeEditar && enlaces.length > 0 && (
              <Button icon={UserCheck} onClick={() => setVerEnlaces(true)}>
                {t('lines.link', { count: enlaces.length })}
              </Button>
            )}
            {puedeImportar && (
              <Button icon={Upload} onClick={() => setImportar(true)}>{t('lines.import')}</Button>
            )}
            {puedeEditar && (
              <Button variant="primary" icon={Plus} onClick={abrirNueva}>{t('lines.new')}</Button>
            )}
          </div>
        )}
      />

      {/* ------------------------------------------------------------ KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
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

      {/* --------------------------------------------------------- filtros */}
      <BarraFiltros
        q={q} onQ={setQ} placeholder={t('lines.searchPlaceholder')}
        campos={campos} chips={chips} onLimpiar={limpiar}
        vista={vista} onVista={(v) => cambiarVista(v as Vista)}
        vistas={[
          { valor: 'tabla', icono: Table2, titulo: t('lines.view_tabla') },
          { valor: 'tarjetas', icono: LayoutGrid, titulo: t('lines.view_tarjetas') },
          { valor: 'graficos', icono: ChartPie, titulo: t('lines.view_graficos') },
        ]}
      />

      {/* ------------------------------------------------------- resultado */}
      {!isLoading && (
        <div className="mb-3 px-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-ink-400">
            {vista === 'graficos'
              ? t('lines.chartsOver', { count: filtradas.length })
              : t('lines.showing', { visibles: mostradas.length, total: filtradas.length })}
            {hayFiltros && alcance.length !== filtradas.length && (
              <span className="text-ink-300 dark:text-ink-500"> · {t('lines.ofTotal', { total: alcance.length })}</span>
            )}
          </p>
          <div className="ml-auto flex flex-wrap gap-2">
            {vista === 'graficos' ? (
              <button onClick={exportarGraficosPdf} disabled={exportando || !filtradas.length} className="btn-ghost text-xs">
                {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                {t('lines.exportChartsPdf')}
              </button>
            ) : (
              <>
                <button onClick={exportarCsv} disabled={!filtradas.length} className="btn-ghost text-xs">
                  <Download size={14} /> {t('lines.exportCsv')}
                </button>
                <button onClick={exportarDetalle} disabled={!filtradas.length} className="btn-ghost text-xs">
                  <Download size={14} /> {t('lines.exportDetail')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {isLoading && <SkeletonGrid count={6} />}

      {/* La tabla `lineas_moviles` la crea una migración que se corre a mano en
          Supabase. Si todavía no se ha corrido, la consulta falla y sin este
          aviso la pantalla diría "no hay líneas", que es justo lo contrario de
          lo que pasa: no hay dónde guardarlas. */}
      {!isLoading && error && (
        <div className="card p-5 flex items-start gap-3 border-l-4 border-l-danger">
          <AlertTriangle size={20} className="text-danger shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium">{t('lines.errLoadTitle')}</p>
            <p className="text-sm text-ink-400 mt-1 leading-relaxed">{t('lines.errLoadDesc')}</p>
            <p className="text-xs text-ink-400 mt-2 font-mono break-words">{(error as Error).message}</p>
            <Button className="mt-3" onClick={() => refetch()}>{t('common.retry')}</Button>
          </div>
        </div>
      )}

      {!isLoading && !error && alcance.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Smartphone}
            title={t('lines.emptyTitle')}
            description={t('lines.emptyDesc')}
            action={(
              <>
                {puedeImportar && (
                  <Button variant="primary" icon={Upload} onClick={() => setImportar(true)}>{t('lines.import')}</Button>
                )}
                {puedeEditar && <Button icon={Plus} onClick={abrirNueva}>{t('lines.new')}</Button>}
              </>
            )}
          />
        </div>
      )}

      {!isLoading && alcance.length > 0 && filtradas.length === 0 && (
        <div className="card">
          <EmptyState
            variant="search" icon={Smartphone}
            title={t('common.noResultsTitle')} description={t('common.noResultsDesc')}
            action={<Button onClick={limpiar}>{t('common.clearFilters')}</Button>}
          />
        </div>
      )}

      {/* ---------------------------------------------------------- tabla */}
      {!isLoading && vista === 'tabla' && filtradas.length > 0 && (
        <DataTable rows={mostradas} columns={columnas} rowKey={(l) => l.id} />
      )}

      {/* ------------------------------------------------------- tarjetas */}
      {!isLoading && vista === 'tarjetas' && filtradas.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mostradas.map((l, i) => {
            const cat = categoriaEstado(l.estado);
            const titular = titularDe(l);
            return (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min((i % PASO_VISIBLES) * 0.02, 0.3), type: 'spring', damping: 26, stiffness: 260 }}
                onClick={() => setFicha(l)}
                className="card-interactive p-5 relative group cursor-pointer"
              >
                <div
                  className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  {puedeEditar && (
                    <button onClick={() => abrirEdicion(l)} title={t('common.edit')}
                      className="p-1.5 rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10 transition">
                      <Pencil size={15} />
                    </button>
                  )}
                  {puedeRetirar && (
                    <button onClick={() => setRetirando(l)} title={t('lines.retire')}
                      className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 mb-3 pr-14">
                  <div className="w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center">
                    <Smartphone size={19} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium tabular-nums truncate">
                      <Resaltado texto={fmtNumero(l.numero)} terminos={terminos} />
                    </div>
                    <div className="text-[11px] text-ink-400 tabular-nums truncate">
                      {l.iccid ? <>ICCID <Resaltado texto={l.iccid} terminos={terminos} /></> : t('lines.noIccid')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`badge ${COLOR_CATEGORIA[cat]}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                    {l.estado || t(ETIQUETA_CATEGORIA[cat])}
                  </span>
                  {l.cr && <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200">CR {l.cr}</span>}
                </div>

                <div className="space-y-1.5 text-sm text-ink-500 dark:text-ink-300">
                  <div className="flex items-center gap-2 min-w-0">
                    <User size={14} className="shrink-0" />
                    <span className="truncate">
                      {titular?.nombre ?? l.nombre
                        ?? <span className="text-amber-600 dark:text-warning">{t('lines.noOwner')}</span>}
                    </span>
                  </div>
                  {l.proyecto && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 size={14} className="shrink-0" /> <span className="truncate">{l.proyecto}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={14} className="shrink-0" />
                    <span className="truncate">
                      {nombreSede(l.sede_id) ?? <span className="text-ink-400">{t('lines.noSede')}</span>}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* -------------------------------------------------------- gráficos */}
      {!isLoading && vista === 'graficos' && filtradas.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          <GraficoCard
            ref={refs.categoria} titulo={t('lines.chartState')} fondoExport={superficie}
            lectura={t('lines.readState')} className="group/card"
            tabla={{
              columnas: [{ key: 'name', label: t('common.status') }, { key: 'value', label: t('lines.colLines') }],
              filas: porCategoria.map(({ name, value }) => ({ name, value })),
            }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porCategoria} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid horizontal={false} stroke={rejilla} />
                <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                {/* Colores de estado reservados y siempre con su etiqueta al lado:
                    el significado nunca queda solo en el color. */}
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {porCategoria.map((d) => <Cell key={d.clave} fill={d.fill} />)}
                  <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>

          <GraficoCard
            ref={refs.proyecto} titulo={t('lines.chartProject')} fondoExport={superficie}
            lectura={t('lines.readProject')} className="group/card"
            tabla={{
              columnas: [{ key: 'name', label: t('lines.fProyecto') }, { key: 'value', label: t('lines.colLines') }],
              filas: porProyecto,
            }}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porProyecto} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid horizontal={false} stroke={rejilla} />
                <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: tintaFuerte }} tickLine={false} axisLine={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                <Bar dataKey="value" fill={paleta[0]} radius={[0, 4, 4, 0]} barSize={14}>
                  <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>

          <GraficoCard
            ref={refs.cr} titulo={t('lines.chartCr')} fondoExport={superficie}
            lectura={t('lines.readCr')} className="group/card"
            tabla={{
              columnas: [{ key: 'name', label: 'CR' }, { key: 'value', label: t('lines.colLines') }],
              filas: porCr,
            }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porCr} margin={{ left: -18, top: 16 }}>
                <CartesianGrid vertical={false} stroke={rejilla} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                <Bar dataKey="value" fill={paleta[1]} radius={[4, 4, 0, 0]} maxBarSize={42}>
                  <LabelList dataKey="value" position="top" fill={tinta} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>

          <GraficoCard
            ref={refs.sede} titulo={t('lines.chartSede')} fondoExport={superficie}
            lectura={t('lines.readSede')} className="group/card"
            tabla={{
              columnas: [{ key: 'name', label: t('users.sede') }, { key: 'value', label: t('lines.colLines') }],
              filas: porSede,
            }}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porSede} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid horizontal={false} stroke={rejilla} />
                <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: tintaFuerte }} tickLine={false} axisLine={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                <Bar dataKey="value" fill={paleta[2]} radius={[0, 4, 4, 0]} barSize={16}>
                  <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>

          {/* De qué hoja del libro salió cada línea. Solo tiene sentido cuando
              se cargó un libro con varias: con una sola sería una barra. */}
          {hojas.length > 1 && (
            <GraficoCard
              ref={refs.hoja} titulo={t('lines.chartSheet')} fondoExport={superficie}
              lectura={t('lines.readSheet')} className="group/card"
              tabla={{
                columnas: [{ key: 'name', label: t('lines.fSheet') }, { key: 'value', label: t('lines.colLines') }],
                filas: porHoja,
              }}
            >
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={porHoja} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid horizontal={false} stroke={rejilla} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10, fill: tintaFuerte }} tickLine={false} axisLine={false} />
                  <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                  <Bar dataKey="value" fill={paleta[4]} radius={[0, 4, 4, 0]} barSize={16}>
                    <LabelList dataKey="value" position="right" fill={tinta} fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </GraficoCard>
          )}
        </div>
      )}

      {/* Centinela del scroll infinito (solo en los listados). */}
      {vista !== 'graficos' && <div ref={centinela} className="h-10" />}
      {vista !== 'graficos' && visibles < filtradas.length && (
        <div className="flex justify-center pb-4">
          <button onClick={() => setVisibles((v) => v + PASO_VISIBLES)} className="btn-secondary">
            {t('lines.loadMore', { count: Math.min(PASO_VISIBLES, filtradas.length - visibles) })}
          </button>
        </div>
      )}

      {/* -------------------------------------------------------- modales */}
      <FichaLinea
        linea={ficha}
        sede={ficha ? nombreSede(ficha.sede_id) : null}
        titular={ficha ? titularDe(ficha) : null}
        onClose={() => setFicha(null)}
        onEditar={puedeEditar ? abrirEdicion : undefined}
      />

      <ImportarLineasModal
        open={importar}
        onClose={() => setImportar(false)}
        existentes={todas}
        onCargado={() => refetch()}
      />

      <Modal
        open={open} onClose={cerrar} size="lg"
        title={editando ? t('lines.edit') : t('lines.new')}
        subtitle={editando ? etiquetaDe(editando) : t('lines.newHint')}
      >
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              {/* Sin asterisco: el número es opcional porque una SIM en empaque
                  todavía no lo tiene. Lo obligatorio es número O ICCID, y eso
                  se dice en la ayuda, que es donde se lee. */}
              <label className="label">{t('lines.fNumero')}</label>
              <input
                className="input tabular-nums" inputMode="numeric"
                value={f.numero ?? ''} onChange={(e) => setF({ ...f, numero: e.target.value })}
                placeholder="3001234567"
              />
              <p className="text-[11px] text-ink-400 mt-1">{t('lines.hNumero')}</p>
            </div>
            <div>
              <label className="label">{t('lines.fEstado')}</label>
              <input
                className="input uppercase"
                value={f.estado ?? ''} onChange={(e) => setF({ ...f, estado: e.target.value })}
                placeholder="OK"
                list="estados-linea"
              />
              {/* Los estados los define el operador: se sugieren los que ya
                  existen en el parque, pero se admite escribir uno nuevo. */}
              <datalist id="estados-linea">
                {[...new Set(todas.map((l) => l.estado).filter(Boolean))].map((e) => (
                  <option key={e as string} value={e as string} />
                ))}
              </datalist>
              <p className="text-[11px] text-ink-400 mt-1">{t('lines.hEstado')}</p>
            </div>

            {CAMPOS_FORM.map(([k, label, ayuda]) => (
              <div key={k}>
                <label className="label">{label}</label>
                <input
                  className="input"
                  value={(f[k] as string | null) ?? ''}
                  onChange={(e) => setF({ ...f, [k]: e.target.value })}
                />
                {ayuda && <p className="text-[11px] text-ink-400 mt-1">{ayuda}</p>}
              </div>
            ))}

            <div>
              <label className="label">{t('users.sede')}</label>
              <Select
                value={f.sede_id ?? ''} onChange={(v) => setF({ ...f, sede_id: v || null })}
                placeholder={t('lines.noSede')}
                options={[{ value: '', label: t('lines.noSede') }, ...sedes.map(sedeOption)]}
              />
            </div>
            <div>
              <label className="label">{t('lines.owner')}</label>
              <Select
                value={f.cedula_asignado ?? ''} onChange={(v) => setF({ ...f, cedula_asignado: v || null })}
                placeholder={t('lines.noOwner')}
                options={[
                  { value: '', label: t('lines.noOwner') },
                  ...colabs.slice(0, 3000).map((c) => ({
                    value: c.cedula, label: c.nombre, description: `C.C. ${c.cedula}`,
                  })),
                ]}
              />
              <p className="text-[11px] text-ink-400 mt-1">{t('lines.hOwner')}</p>
            </div>
          </div>

          <div>
            <label className="label">{t('lines.fObservacion')}</label>
            <textarea
              className="input min-h-[5rem] resize-y"
              value={f.observacion ?? ''} onChange={(e) => setF({ ...f, observacion: e.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={cerrar} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={guardar} loading={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </Modal>

      {/* Enlazar titulares: se enseña qué se va a enlazar y por qué vía antes
          de tocar nada. */}
      <Modal
        open={verEnlaces} onClose={() => !enlazando && setVerEnlaces(false)} size="md"
        title={t('lines.linkTitle')}
        subtitle={t('lines.linkSubtitle', { count: enlaces.length })}
      >
        <p className="text-sm text-ink-500 dark:text-ink-300 leading-relaxed">
          {t('lines.linkHelp')}
        </p>

        <ul className="mt-4 max-h-64 overflow-y-auto divide-y divide-ink-100 dark:divide-white/5 text-sm">
          {enlaces.slice(0, 200).map((e: EnlacePropuesto) => (
            <li key={e.id} className="py-2 flex items-center gap-2">
              <span className="tabular-nums text-ink-500 dark:text-ink-300 shrink-0">
                {e.etiqueta}
              </span>
              <span className="text-ink-300 dark:text-ink-500">→</span>
              <span className="truncate">{e.nombrePersona}</span>
              <span className={`ml-auto shrink-0 badge ${e.via === 'cedula'
                ? 'bg-success/15 text-emerald-700 dark:text-success'
                : 'bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200'}`}>
                {e.via === 'cedula' ? t('lines.viaId') : t('lines.viaName')}
              </span>
            </li>
          ))}
        </ul>
        {enlaces.length > 200 && (
          <p className="mt-2 text-xs text-ink-400">{t('lines.linkMore', { count: enlaces.length - 200 })}</p>
        )}

        {enlazando && (
          <div className="mt-4">
            <div className="h-1.5 rounded-full bg-ink-100 dark:bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #10D451, #B33D9E)' }}
                animate={{ width: `${Math.max(avanceEnlace * 100, 4)}%` }}
                transition={{ type: 'spring', damping: 26, stiffness: 180 }}
              />
            </div>
            <p className="text-center text-xs text-ink-400 mt-1.5 tabular-nums">
              {Math.round(avanceEnlace * 100)}%
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={() => setVerEnlaces(false)} disabled={enlazando}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={aplicarEnlaces} loading={enlazando}>
            {t('lines.linkApply')}
          </Button>
        </div>
      </Modal>

      {/* Retirar: es reversible y lo dice, para que nadie dude antes de pulsar. */}
      <Modal
        open={!!retirando} onClose={() => !busy && setRetirando(null)} size="sm"
        title={t('lines.retireTitle')}
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-danger/10 text-danger grid place-items-center">
            <AlertTriangle size={20} />
          </span>
          <div className="text-sm text-ink-600 dark:text-ink-200 leading-relaxed">
            <p>{t('lines.retireQuestion', { numero: retirando ? etiquetaDe(retirando) : '' })}</p>
            <p className="mt-2 text-ink-400 text-xs">{t('lines.retireHint')}</p>
            {retirando?.actualizado_en && (
              <p className="mt-1 text-ink-400 text-[11px]">
                {t('lines.updatedAt', { fecha: fmtDateTime(retirando.actualizado_en, i18n.language) })}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={() => setRetirando(null)} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={retirar} loading={busy}>{t('lines.retire')}</Button>
        </div>
      </Modal>
    </div>
  );
}

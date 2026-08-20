/**
 * Control de tickets.
 *
 * Esta pantalla reemplaza al libro "CONTROL TICKETS.xlsx", que era una hoja por
 * mes con las mismas doce columnas repetidas. Lo que aquí cambia respecto al
 * archivo no es la estética, son tres cosas que en Excel no se podían hacer:
 *
 *   · Los meses conviven. En el archivo, comparar abril con julio era abrir dos
 *     hojas y contar a ojo; aquí el mes es un filtro y las cuentas salen solas.
 *   · Los días se calculan de las fechas, siempre. En el archivo eran una
 *     fórmula —que contaba hasta hoy mientras el ticket siguiera abierto, eso
 *     estaba bien resuelto—, pero una fórmula se puede pisar escribiendo
 *     encima, y en dos filas del archivo real alguien lo hizo: decían cuatro
 *     días donde sus propias fechas dan tres. Aquí el número no es un valor
 *     que se guarde, así que no hay nada que pisar.
 *   · Las notas caben. Eran una celda de una línea, así que se escribía
 *     abreviado o no se escribía; ahora son texto largo y se leen enteras.
 *
 * Alcance por rol: ADMIN y Jefe (LIDER) ven todos los tickets. El Líder de sede
 * y el Técnico ven los de SUS sedes y, además, los que no tienen sede asignada
 * —que es donde caen los que llegaron del archivo sin ciudad reconocible, y
 * ocultárselos les escondería trabajo propio.
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
  AlertTriangle, CalendarDays, ChartPie, CheckCircle2, Clock, Download, FileDown, Gauge,
  LayoutGrid, ListChecks, Pencil, Plus, StickyNote, Table2, Ticket as TicketIcon,
  Trash2, Upload, User,
} from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { BarraFiltros, type CampoFiltro, type ChipFiltro } from '@/components/ui/BarraFiltros';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { NumeroAnimado } from '@/components/ui/NumeroAnimado';
import { Resaltado } from '@/components/ui/Resaltado';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { GraficoCard, type GraficoHandle } from '@/components/analitica/GraficoCard';
import { FichaTicket } from '@/components/tickets/FichaTicket';
import { PanelOperaciones } from '@/components/tickets/PanelOperaciones';
import { ImportarTicketsModal } from '@/components/tickets/ImportarTicketsModal';
import {
  actualizarTicket, crearTicket, listAnalistasMesa, listSedes, listTickets, ocultarTicket,
} from '@/lib/api';
import {
  COLOR_ESTADO, COLOR_PRIORIDAD, ESTADOS, ETIQUETA_ESTADO, ETIQUETA_PRIORIDAD, PRIORIDADES,
  colorEstado, descripcionCanonica, diasEntre, diasTranscurridos, etiquetaPeriodo, periodoDe,
} from '@/lib/tickets/modelo';
import { nombrePorId, seleccionables } from '@/lib/tickets/analistas';
import { exportarTicketsCsv, exportarTicketsExcel } from '@/lib/tickets/exportar';
import { terminosDe } from '@/lib/colaboradores/buscar';
import { normNombre } from '@/lib/importador/normalizar';
import { exportarPdf } from '@/lib/exportarGrafico';
import { useEsOscuro } from '@/lib/useEsOscuro';
import { fmtDate } from '@/lib/format';
import { useApp } from '@/store/useApp';
import { puedeRetirar } from '@/lib/roles';
import { ordenarSedesPorPais, useFiltroPais } from '@/lib/pais';
import type { EstadoTicket, PrioridadTicket, Sede, Ticket } from '@/types';

const PASO_VISIBLES = 40;
const SIN_SEDE = '__sin_sede';
const SIN_ANALISTA = '__sin_analista';

/**
 * A partir de cuántos días un ticket abierto se considera atrasado.
 *
 * No sale de un acuerdo de servicio —el archivo no tenía ninguno—, sale de los
 * propios datos: la inmensa mayoría de los tickets del histórico se cierran en
 * menos de dos semanas, así que pasadas dos semanas abierto el ticket dejó de
 * comportarse como los demás y hay que mirarlo. Cuando exista un ANS de verdad,
 * este número se sustituye por él.
 */
const DIAS_ATRASO = 15;

type Vista = 'panel' | 'tabla' | 'tarjetas' | 'graficos';
type Orden = 'reciente' | 'antiguo' | 'dias' | 'ticket' | 'estado';

/**
 * En qué está puesto el foco: un estado concreto, o uno de los dos grupos que
 * cruzan varios estados.
 *
 * Es UN solo valor y no tres casillas sueltas, y eso es lo que arregla el
 * comportamiento raro que tenía la pantalla: antes convivían un selector de
 * estado y dos interruptores ("solo abiertos", "solo atrasados"), así que pulsar
 * una tarjeta apagaba en silencio lo que hubieras elegido en las otras y no
 * había forma de saber por qué. Con un único foco, las opciones son
 * excluyentes porque LO SON: un ticket no puede estar completado y atrasado a
 * la vez.
 */
type Foco = '' | EstadoTicket | 'ABIERTOS' | 'ATRASADOS';

const sedeOption = (s: Sede): SelectOption =>
  ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre });

export function Tickets() {
  const { t, i18n } = useTranslation();
  const { perfil, misSedes, canEdit, can, operaTodasLasSedes } = useApp();
  const oscuro = useEsOscuro();

  // Los cuatro roles operativos cargan y editan; la barrera real son las
  // políticas RLS de `tickets`, esto solo decide qué botones se pintan.
  const puedeEditar = canEdit();
  const puedeImportar = can('ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO');
  // Retirar es reversible (borrado suave) pero saca la fila del histórico de la
  // mesa: lo deciden quienes mandan en ella (ver `puedeRetirar`).
  const retirarPermitido = puedeRetirar(perfil?.rol);
  // Enlazar un ticket con una persona es decir quién hizo un trabajo, y de eso
  // responde quien manda en la mesa: ADMIN, Jefe y Líder de sede. El Técnico
  // carga el archivo igual, pero sin atribuir por parecido de nombre.
  const puedeEnlazar = can('ADMIN', 'LIDER', 'JEFE_SEDE');

  const { data: todos = [], refetch, isLoading, error } = useQuery({
    queryKey: ['tickets'], queryFn: listTickets,
  });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  // El directorio de la mesa, no la tabla de perfiles: al Líder de sede la RLS
  // de `perfiles` le devuelve una lista vacía, y sin esto no tenía a quién
  // enlazar. Ver supabase/migrations/20260818_analistas_de_mesa.sql.
  const { data: analistasMesa = [] } = useQuery({
    queryKey: ['analistasMesa'], queryFn: listAnalistasMesa,
  });

  // Quién puede figurar como analista: la lista corta, la misma en el
  // formulario y en la carga.
  const perfilesAnalistas = useMemo(() => seleccionables(analistasMesa), [analistasMesa]);

  // El nombre, en cambio, se resuelve contra la lista ENTERA: un ticket enlazado
  // con alguien que hoy es ADMIN o está de baja tiene que seguir diciendo de
  // quién era. Se deja de poder elegir, no de leer.
  const nombreAnalista = useMemo(() => nombrePorId(analistasMesa), [analistasMesa]);

  const nombreSede = useMemo(() => {
    const m = new Map(sedes.map((s) => [s.id, s.nombre]));
    return (id?: string | null) => (id ? m.get(id) ?? null : null);
  }, [sedes]);

  // País de quien mira: el control abre en el suyo y sus sedes van primero.
  const pais = useFiltroPais();

  // ------------------------------------------------------------- alcance
  const alcance = useMemo(() => {
    if (operaTodasLasSedes()) return todos;
    const permitidas = new Set(misSedes);
    if (perfil?.sede_id) permitidas.add(perfil.sede_id);
    return todos.filter((x) => !x.sede_id || permitidas.has(x.sede_id));
  }, [todos, misSedes, perfil, operaTodasLasSedes]);

  // ------------------------------------------------------------- filtros
  const [q, setQ] = useState('');
  const qDiferida = useDeferredValue(q);
  const [periodo, setPeriodo] = useState('');
  const [foco, setFoco] = useState<Foco>('');
  const [prioridad, setPrioridad] = useState<PrioridadTicket | ''>('');
  const [analista, setAnalista] = useState('');
  const [sedeF, setSedeF] = useState('');
  const [orden, setOrden] = useState<Orden>('reciente');
  const [vista, setVista] = useState<Vista>(
    // Se abre en el panel, que es la hoja "DASHBOARD" del archivo: la primera
    // pregunta al entrar es cómo va el mes, no qué dice la fila 300. Después
    // manda lo último que eligió cada quien.
    () => (localStorage.getItem('ticketsVista') as Vista) ?? 'panel',
  );
  const [visibles, setVisibles] = useState(PASO_VISIBLES);

  const cambiarVista = (v: Vista) => { setVista(v); localStorage.setItem('ticketsVista', v); };

  // ------------------------------------------------------------- modales
  const [ficha, setFicha] = useState<Ticket | null>(null);
  const [importar, setImportar] = useState(false);
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Ticket | null>(null);
  const [f, setF] = useState<Partial<Ticket>>({});
  const [busy, setBusy] = useState(false);
  const [retirando, setRetirando] = useState<Ticket | null>(null);
  const [exportando, setExportando] = useState(false);

  const terminos = useMemo(() => terminosDe(qDiferida), [qDiferida]);

  // Los meses que hay cargados, del más reciente al más antiguo: es el orden en
  // que se buscan, porque el mes que interesa casi siempre es el último.
  const periodos = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of alcance) {
      if (!x.periodo) continue;
      m.set(x.periodo, (m.get(x.periodo) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [alcance]);

  const analistas = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const x of alcance) {
      const id = x.analista_id ?? '';
      // Sin enlace, el nombre del archivo sigue siendo la mejor agrupación que
      // hay: agrupa peor que el enlace, pero es lo que había en el Excel.
      const label = nombreAnalista(x.analista_id) ?? x.analista_texto;
      if (!id && !label) continue;
      const clave = id || `texto:${normNombre(label ?? '')}`;
      const prev = m.get(clave);
      if (prev) prev.n++;
      else m.set(clave, { label: label ?? '—', n: 1 });
    }
    return [...m.entries()]
      .sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label));
  }, [alcance, nombreAnalista]);

  /** La clave con la que se agrupa y se filtra por analista. */
  const claveAnalista = (x: Ticket) => (
    x.analista_id
      || (x.analista_texto ? `texto:${normNombre(x.analista_texto)}` : SIN_ANALISTA)
  );

  /**
   * ¿Este ticket entra en el foco actual?
   *
   * "Abiertos" es todo lo que no está completado, bloqueados incluidos: un
   * ticket detenido por un tercero sigue siendo trabajo que la mesa tiene
   * encima. "Atrasados" es lo abierto que ya pasó de `DIAS_ATRASO`.
   */
  const pasaFoco = (x: Ticket): boolean => {
    if (!foco) return true;
    if (foco === 'ABIERTOS') return x.estado !== 'COMPLETADA';
    if (foco === 'ATRASADOS') {
      const d = diasTranscurridos(x);
      return x.estado !== 'COMPLETADA' && d != null && d >= DIAS_ATRASO;
    }
    return x.estado === foco;
  };

  /**
   * Pulsar lo que ya está puesto lo quita.
   *
   * Sin esto, una tarjeta era un camino de ida: se pulsaba "Completados", se
   * filtraba, y para volver había que buscar el aspa de la etiqueta de abajo o
   * el botón de limpiar. Lo que enciende, apaga.
   */
  const alternarFoco = (f: Foco) => setFoco((prev) => (prev === f ? '' : f));

  /** Poner el foco y saltar a la lista: se pulsa un número para VER esas filas. */
  const verTickets = (f: Foco) => { setFoco(f); cambiarVista('tabla'); };

  /**
   * Lo que hay bajo la selección actual SIN contar el foco.
   *
   * Esta separación es la que hace que los números tengan sentido. Las tarjetas
   * y el panel se calculan sobre esto, así que:
   *
   *   · responden al mes, al analista, a la sede y a la búsqueda —antes decían
   *     "899 tickets" con julio filtrado y la tabla debajo enseñando 195—;
   *   · pero NO se desmoronan al pulsar una tarjeta. Si contaran también el
   *     foco, pulsar "Completados" dejaría el resto de tarjetas en cero y el
   *     tablero diría "100% completadas", que es cierto y no sirve de nada.
   *
   * El foco es la profundización: se aplica solo a la lista que se enseña.
   */
  const base = useMemo(() => alcance.filter((x) => {
    if (!pais.incluye(x.sede_id)) return false;
    if (periodo && x.periodo !== periodo) return false;
    if (prioridad && x.prioridad !== prioridad) return false;
    if (analista && claveAnalista(x) !== analista) return false;
    if (sedeF === SIN_SEDE ? !!x.sede_id : sedeF && x.sede_id !== sedeF) return false;
    if (!terminos.length) return true;
    // Se busca sobre todo lo que identifica un ticket, notas incluidas: en el
    // archivo la nota era el único sitio donde quedaba el número de teléfono
    // o el nombre del asociado, y es por ahí por donde la gente lo busca.
    const heno = normNombre([
      x.ticket, x.descripcion, x.notas, x.analista_texto, x.ciudad_texto,
      nombreAnalista(x.analista_id), nombreSede(x.sede_id), x.hoja_origen,
    ].filter(Boolean).join(' '));
    return terminos.every((tm) => heno.includes(tm));
  }), [alcance, terminos, pais, periodo, prioridad, analista, sedeF, nombreAnalista, nombreSede]);

  const kpis = useMemo(() => {
    let abiertos = 0; let completados = 0; let atrasados = 0;
    let sumaDias = 0; let conDias = 0;
    for (const x of base) {
      const d = diasTranscurridos(x);
      if (x.estado === 'COMPLETADA') {
        completados++;
        // El promedio solo cuenta lo cerrado: mezclar un ticket que lleva
        // cuarenta días abierto con los que tardaron dos convertiría la media
        // en un número que no significa nada.
        if (d != null && d >= 0) { sumaDias += d; conDias++; }
      } else {
        abiertos++;
        if (d != null && d >= DIAS_ATRASO) atrasados++;
      }
    }
    return {
      total: base.length,
      abiertos,
      completados,
      atrasados,
      promedio: conDias ? Math.round((sumaDias / conDias) * 10) / 10 : 0,
    };
  }, [base]);

  const filtrados = useMemo(() => {
    const cmp: Record<Orden, (a: Ticket, b: Ticket) => number> = {
      // Los que no tienen fecha van al final en los dos sentidos: no se sabe
      // dónde ponerlos, y colarlos al principio taparía lo que sí importa.
      reciente: (a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''),
      antiguo: (a, b) => (a.fecha_inicio ?? 'zzzz').localeCompare(b.fecha_inicio ?? 'zzzz'),
      dias: (a, b) => (diasTranscurridos(b) ?? -1) - (diasTranscurridos(a) ?? -1),
      ticket: (a, b) => a.ticket.localeCompare(b.ticket, undefined, { numeric: true }),
      estado: (a, b) => ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado),
    };

    return [...base.filter(pasaFoco)].sort(cmp[orden]);
  }, [base, foco, orden]);

  useEffect(() => { setVisibles(PASO_VISIBLES); },
    [qDiferida, pais.valor, periodo, foco, prioridad, analista, sedeF, orden]);

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
  /** Tabla y tarjetas enseñan filas —y por eso paginan—; panel y gráficos, el conjunto. */
  const esListado = vista === 'tabla' || vista === 'tarjetas';
  const hayFiltros = !!(q || periodo || foco || prioridad || analista || pais.activo || sedeF);
  const limpiar = () => {
    setQ(''); setPeriodo(''); setFoco(''); setPrioridad(''); setAnalista(''); pais.setValor(''); setSedeF('');
  };

  // -------------------------------------------------------------- series
  const porEstado = useMemo(() => ESTADOS
    .map((e) => ({
      name: t(ETIQUETA_ESTADO[e]),
      value: filtrados.filter((x) => x.estado === e).length,
      fill: colorEstado(e, oscuro),
    }))
    .filter((d) => d.value > 0), [filtrados, t, oscuro]);

  /** Tickets y días medios de cierre, mes a mes. Es la vista que el archivo
   *  no podía dar sin abrir las cuatro hojas y sumarlas a mano. */
  const porMes = useMemo(() => {
    const m = new Map<string, { n: number; suma: number; cerrados: number }>();
    for (const x of filtrados) {
      const k = x.periodo ?? '—';
      const v = m.get(k) ?? { n: 0, suma: 0, cerrados: 0 };
      v.n++;
      const d = diasTranscurridos(x);
      if (x.estado === 'COMPLETADA' && d != null && d >= 0) { v.suma += d; v.cerrados++; }
      m.set(k, v);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        name: k === '—' ? t('tickets.noMonth') : etiquetaPeriodo(k),
        value: v.n,
        dias: v.cerrados ? Math.round((v.suma / v.cerrados) * 10) / 10 : 0,
      }));
  }, [filtrados, t]);

  const porAnalista = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of filtrados) {
      const k = nombreAnalista(x.analista_id) ?? x.analista_texto ?? t('tickets.noAnalyst');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtrados, nombreAnalista, t]);

  const porPrioridad = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of filtrados) {
      const k = x.prioridad ? t(ETIQUETA_PRIORIDAD[x.prioridad]) : t('tickets.noPriority');
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value }));
  }, [filtrados, t]);

  // ----------------------------------------------------------- el panel
  //
  // Las mismas cifras de la hoja "DASHBOARD" del archivo, pero calculadas.
  //
  // Las del archivo estaban rotas y nadie lo había notado: decía 229 tickets en
  // los recuadros y 99 en el resumen, y daba 294 completadas sobre 99 totales,
  // o sea "297%". Las fórmulas apuntaban a un rango que se quedó corto cuando
  // el libro creció. Aquí no hay rango que se quede corto: se cuenta sobre lo
  // que hay en pantalla, así que el panel obedece al mes y a los filtros.
  const panel = useMemo(() => {
    const cuenta = { COMPLETADA: 0, EN_PROGRESO: 0, PENDIENTE: 0, BLOQUEADA: 0 };
    let sumaCumpl = 0; let conCumpl = 0;
    let sumaDias = 0; let cerrados = 0;
    let atrasados = 0;
    for (const x of base) {
      cuenta[x.estado]++;
      if (x.cumplimiento != null) { sumaCumpl += x.cumplimiento; conCumpl++; }
      const d = diasTranscurridos(x);
      if (x.estado === 'COMPLETADA') {
        if (d != null && d >= 0) { sumaDias += d; cerrados++; }
      } else if (d != null && d >= DIAS_ATRASO) atrasados++;
    }
    return {
      total: base.length,
      ...cuenta,
      atrasados,
      // Sin datos de cumplimiento el promedio no es 0, es que no hay: un 0%
      // haría pensar que se incumplió todo.
      cumplimiento: conCumpl ? Math.round(sumaCumpl / conCumpl) : null,
      dias: cerrados ? Math.round((sumaDias / cerrados) * 100) / 100 : null,
    };
  }, [base]);

  /** Reparto porcentual sobre el total en pantalla, para el resumen ejecutivo. */
  const pct = (n: number) => (panel.total ? Math.round((n / panel.total) * 100) : 0);

  // ---------------------------------------------------------- exportación
  const refs = {
    estado: useRef<GraficoHandle>(null),
    mes: useRef<GraficoHandle>(null),
    analista: useRef<GraficoHandle>(null),
    prioridad: useRef<GraficoHandle>(null),
  };
  const superficie = oscuro ? '#1c201f' : '#ffffff';
  const tinta = oscuro ? '#A1ADAD' : '#6a7473';
  const rejilla = oscuro ? 'rgba(255,255,255,0.07)' : 'rgba(120,120,128,0.13)';

  const ctxExport = { nombreAnalista, nombreSede };

  // Asíncrono porque ExcelJS se carga solo al pulsar: es una librería grande y
  // no tiene por qué viajar en el arranque de la pantalla.
  const exportarExcel = async () => {
    setExportando(true);
    try {
      await exportarTicketsExcel(filtrados, ctxExport);
      toast.success(t('tickets.exported', { count: filtrados.length }));
    } catch (e) {
      toast.error((e as Error)?.message ?? t('common.error'));
    } finally { setExportando(false); }
  };
  const exportarCsv = () => {
    exportarTicketsCsv(filtrados, ctxExport);
    toast.success(t('tickets.exported', { count: filtrados.length }));
  };

  const exportarGraficos = async () => {
    setExportando(true);
    try {
      const bloques = [
        { titulo: t('tickets.chartState'), ref: refs.estado },
        { titulo: t('tickets.chartMonth'), ref: refs.mes },
        { titulo: t('tickets.chartAnalyst'), ref: refs.analista },
        { titulo: t('tickets.chartPriority'), ref: refs.prioridad },
      ]
        .map((b) => ({ titulo: b.titulo, contenedor: b.ref.current?.contenedor() }))
        .filter((b): b is { titulo: string; contenedor: HTMLElement } => !!b.contenedor);
      await exportarPdf(bloques, {
        titulo: t('tickets.title'),
        subtitulo: t('tickets.pdfSubtitle', { count: filtrados.length }),
        fondo: superficie,
      });
    } catch (e) {
      toast.error((e as Error)?.message ?? t('common.error'));
    } finally { setExportando(false); }
  };

  // ------------------------------------------------------------ formulario
  const abrirNuevo = () => {
    setEditando(null);
    setF({ estado: 'PENDIENTE', prioridad: 'MEDIA', fecha_inicio: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  };
  const abrirEdicion = (x: Ticket) => { setEditando(x); setF(x); setOpen(true); setFicha(null); };
  const cerrar = () => { if (!busy) { setOpen(false); setEditando(null); setF({}); } };

  const diasForm = diasEntre(f.fecha_inicio, f.fecha_fin);

  const guardar = async () => {
    const ticket = (f.ticket ?? '').replace(/\s+/g, '');
    if (!ticket) { toast.error(t('tickets.needTicket')); return; }
    if (diasForm != null && diasForm < 0) { toast.error(t('tickets.badDates')); return; }
    setBusy(true);
    try {
      const datos: Partial<Ticket> = {
        ...f,
        ticket,
        // La descripción entra en la identidad de la fila (ticket + descripción
        // + inicio), así que se guarda en la misma forma que usa el importador;
        // si no, la misma fila escrita a mano y cargada del archivo serían dos.
        descripcion: descripcionCanonica(f.descripcion),
        estado: f.estado ?? 'PENDIENTE',
        periodo: periodoDe(f.fecha_inicio) ?? f.periodo ?? null,
      };
      if (editando) await actualizarTicket(editando.id, datos);
      else await crearTicket(datos);
      toast.success(t('common.success'));
      setOpen(false); setEditando(null); setF({}); refetch();
    } catch (e) {
      // El choque de unicidad es el error esperable: alguien está registrando
      // un ticket que ya existe con la misma descripción y la misma fecha.
      const msg = (e as Error).message ?? '';
      toast.error(/duplicate key|unique/i.test(msg) ? t('tickets.duplicate') : msg || t('common.error'));
    } finally { setBusy(false); }
  };

  const retirar = async () => {
    if (!retirando || !perfil) return;
    setBusy(true);
    try {
      await ocultarTicket(retirando.id, perfil.id);
      toast.success(t('tickets.retired', { ticket: retirando.ticket }));
      setRetirando(null); setFicha(null); refetch();
    } catch (e) {
      toast.error((e as Error).message || t('common.error'));
    } finally { setBusy(false); }
  };

  // ---------------------------------------------------------------- tabla
  /** El bloque de fechas de una fila: inicio → fin y los días, con su sentido. */
  const Fechas = ({ x }: { x: Ticket }) => {
    const d = diasTranscurridos(x);
    const atrasado = x.estado !== 'COMPLETADA' && d != null && d >= DIAS_ATRASO;
    return (
      <div className="min-w-0">
        <div className="text-sm tabular-nums whitespace-nowrap">
          {fmtDate(x.fecha_inicio, i18n.language)}
          <span className="text-ink-400 mx-1">→</span>
          {x.fecha_fin
            ? fmtDate(x.fecha_fin, i18n.language)
            : <span className="text-ink-400 italic">{t('tickets.stillOpen')}</span>}
        </div>
        {d != null && (
          <div className={`text-[11px] tabular-nums ${atrasado ? 'text-red-600 dark:text-danger font-semibold' : 'text-ink-400'}`}>
            {t('tickets.daysCount', { count: d })}
            {x.estado !== 'COMPLETADA' && ` · ${t('tickets.open')}`}
          </div>
        )}
      </div>
    );
  };

  const columnas: Column<Ticket>[] = [
    {
      key: 'ticket',
      header: t('tickets.fTicket'),
      sortValue: (x) => x.ticket,
      cell: (x) => (
        <button onClick={() => setFicha(x)} className="text-left group/tk min-w-0">
          <span className="block font-medium tabular-nums group-hover/tk:text-brand-600 dark:group-hover/tk:text-brand-400 transition-colors">
            <Resaltado texto={x.ticket} terminos={terminos} />
          </span>
          <span className="block text-[11px] text-ink-400 truncate max-w-[18rem]">
            <Resaltado texto={x.descripcion} terminos={terminos} />
          </span>
        </button>
      ),
    },
    {
      key: 'estado',
      header: t('tickets.fState'),
      sortValue: (x) => ESTADOS.indexOf(x.estado),
      cell: (x) => (
        <div className="flex flex-col items-start gap-1">
          <span className={`badge ${COLOR_ESTADO[x.estado]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {t(ETIQUETA_ESTADO[x.estado])}
          </span>
          {x.prioridad && (
            <span className={`badge ${COLOR_PRIORIDAD[x.prioridad]}`}>
              {t(ETIQUETA_PRIORIDAD[x.prioridad])}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'fechas',
      header: t('tickets.fDates'),
      sortValue: (x) => x.fecha_inicio ?? '',
      cell: (x) => <Fechas x={x} />,
    },
    {
      key: 'analista',
      header: t('tickets.fAnalyst'),
      sortValue: (x) => nombreAnalista(x.analista_id) ?? x.analista_texto ?? '',
      cell: (x) => {
        const enlazado = nombreAnalista(x.analista_id);
        return (
          <div className="min-w-0">
            <div className="text-sm truncate max-w-[12rem]">
              <Resaltado texto={enlazado ?? x.analista_texto} terminos={terminos} />
            </div>
            {/* Sin enlace se dice, no se disimula: es lo que hay que arreglar
                para que las cuentas por analista sean de fiar. */}
            {!enlazado && x.analista_texto && (
              <div className="text-[11px] text-amber-600 dark:text-warning">
                {t('tickets.notLinked')}
              </div>
            )}
            <div className="text-[11px] text-ink-400 truncate">
              {nombreSede(x.sede_id) ?? x.ciudad_texto ?? ''}
            </div>
          </div>
        );
      },
    },
    {
      key: 'notas',
      header: t('tickets.fNotes'),
      sortValue: (x) => x.notas ?? '',
      cell: (x) => (x.notas ? (
        // Dos líneas y a la ficha: la nota completa puede ser un párrafo, y
        // meterlo en la celda rompe la tabla para todas las demás filas.
        <button
          onClick={() => setFicha(x)}
          className="text-left text-sm text-ink-500 dark:text-ink-300 line-clamp-2 max-w-[22rem] hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          title={x.notas}
        >
          <Resaltado texto={x.notas} terminos={terminos} />
        </button>
      ) : <span className="text-ink-400">—</span>),
    },
    {
      key: 'acciones',
      header: '',
      headerClassName: 'w-24',
      cell: (x) => (
        <div className="flex items-center gap-1 justify-end">
          {puedeEditar && (
            <button
              onClick={() => abrirEdicion(x)} title={t('common.edit')}
              className="p-1.5 rounded-lg text-ink-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-ink-100 dark:hover:bg-white/10 transition"
            >
              <Pencil size={15} />
            </button>
          )}
          {retirarPermitido && (
            <button
              onClick={() => setRetirando(x)} title={t('tickets.retire')}
              className="p-1.5 rounded-lg text-ink-400 hover:text-danger hover:bg-danger/10 transition"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ),
    },
  ];

  // ----------------------------------------------------------------- KPIs
  //
  // Cada tarjeta es un foco, y se comporta como un interruptor: pulsarla filtra,
  // volver a pulsarla quita el filtro, y mientras está puesta se ve puesta. La
  // de "Total" no filtra por nada, quita el foco.
  //
  // "Días promedio" NO es pulsable, y es a propósito: es una media, no un grupo
  // de tickets. Antes filtraba por "completados" —lo único que se puede
  // promediar—, y el resultado era que pulsabas un 1,7 y te llevaba a 891 filas
  // sin ninguna relación aparente con el número que habías tocado.
  const tarjetasKpi: {
    id: string; label: string; n: number; icon: React.ElementType; tono: string;
    foco?: Foco; decimal?: boolean;
  }[] = [
    { id: 'total', label: t('tickets.kpiTotal'), n: kpis.total, icon: ListChecks, tono: 'from-brand-400 to-brand-600', foco: '' },
    { id: 'abiertos', label: t('tickets.kpiOpen'), n: kpis.abiertos, icon: Clock, tono: 'from-amber-400 to-amber-600', foco: 'ABIERTOS' },
    { id: 'hechos', label: t('tickets.kpiDone'), n: kpis.completados, icon: CheckCircle2, tono: 'from-emerald-400 to-emerald-600', foco: 'COMPLETADA' },
    { id: 'atraso', label: t('tickets.kpiLate', { dias: DIAS_ATRASO }), n: kpis.atrasados, icon: AlertTriangle, tono: 'from-red-400 to-red-600', foco: 'ATRASADOS' },
    { id: 'media', label: t('tickets.kpiAvg'), n: kpis.promedio, icon: CalendarDays, tono: 'from-violet-400 to-violet-600', decimal: true },
  ];

  /** Cómo se llama el foco en la etiqueta que se puede quitar. */
  const ETIQUETA_FOCO: Record<Exclude<Foco, ''>, string> = {
    ABIERTOS: t('tickets.kpiOpen'),
    ATRASADOS: t('tickets.kpiLate', { dias: DIAS_ATRASO }),
    COMPLETADA: t('tickets.stDone'),
    EN_PROGRESO: t('tickets.stProgress'),
    PENDIENTE: t('tickets.stPending'),
    BLOQUEADA: t('tickets.stBlocked'),
  };

  const campos: CampoFiltro[] = [
    // El mes primero: es el filtro que se usa cada vez que se abre.
    {
      id: 'periodo', label: t('tickets.month'), value: periodo, onChange: setPeriodo, activo: !!periodo,
      options: [
        { value: '', label: t('tickets.allMonths') },
        ...periodos.map(([p, n]) => ({
          value: p,
          label: etiquetaPeriodo(p),
          description: t('tickets.ticketsCount', { count: n }),
        })),
      ],
    },
    // Un solo selector para el estado y para los dos grupos que lo cruzan.
    // Antes "abiertos" y "atrasados" solo existían como tarjetas, así que se
    // podían poner pero no quitar desde aquí.
    {
      id: 'foco', label: t('common.status'), value: foco, onChange: (v) => setFoco(v as Foco), activo: !!foco,
      options: [
        { value: '', label: t('tickets.allStates') },
        { value: 'ABIERTOS', label: t('tickets.kpiOpen'), description: t('tickets.focusOpenHint') },
        { value: 'ATRASADOS', label: t('tickets.kpiLate', { dias: DIAS_ATRASO }), description: t('tickets.focusLateHint', { dias: DIAS_ATRASO }) },
        ...ESTADOS.map((e) => ({ value: e, label: t(ETIQUETA_ESTADO[e]) })),
      ],
    },
    {
      id: 'prioridad', label: t('tickets.fPriority'), value: prioridad, activo: !!prioridad,
      onChange: (v) => setPrioridad(v as PrioridadTicket | ''),
      options: [
        { value: '', label: t('tickets.allPriorities') },
        ...PRIORIDADES.map((p) => ({ value: p, label: t(ETIQUETA_PRIORIDAD[p]) })),
      ],
    },
    {
      id: 'analista', label: t('tickets.fAnalyst'), value: analista, onChange: setAnalista, activo: !!analista,
      options: [
        { value: '', label: t('tickets.allAnalysts') },
        ...analistas.map(([k, v]) => ({
          value: k, label: v.label, description: t('tickets.ticketsCount', { count: v.n }),
        })),
      ],
    },
    ...(pais.mostrar ? [{
      id: 'pais', label: t('common.country'), value: pais.valor, onChange: pais.setValor,
      options: pais.opciones, activo: pais.activo,
    }] : []),
    {
      id: 'sede', label: t('users.sede'), value: sedeF, onChange: setSedeF, activo: !!sedeF,
      options: [
        { value: '', label: t('tickets.allSedes') },
        ...ordenarSedesPorPais(sedes, pais.paisPropio).map(sedeOption),
        { value: SIN_SEDE, label: t('tickets.noSede') },
      ],
    },
    {
      id: 'orden', label: t('common.sortBy'), value: orden, onChange: (v) => setOrden(v as Orden),
      // Ordenar no filtra: no se resalta ni sale en las pastillas.
      activo: false,
      options: [
        { value: 'reciente', label: t('tickets.sortRecent') },
        { value: 'antiguo', label: t('tickets.sortOldest') },
        { value: 'dias', label: t('tickets.sortDays') },
        { value: 'ticket', label: t('tickets.sortTicket') },
        { value: 'estado', label: t('tickets.sortState') },
      ],
    },
  ];

  const chips: ChipFiltro[] = [
    periodo && { id: 'per', texto: etiquetaPeriodo(periodo), quitar: () => setPeriodo('') },
    prioridad && { id: 'pri', texto: t(ETIQUETA_PRIORIDAD[prioridad]), quitar: () => setPrioridad('') },
    analista && {
      id: 'ana',
      texto: analistas.find(([k]) => k === analista)?.[1].label ?? '',
      quitar: () => setAnalista(''),
    },
    pais.activo && { id: 'pais', texto: pais.etiqueta ?? '', quitar: () => pais.setValor('') },
    sedeF && {
      id: 'sede',
      texto: sedeF === SIN_SEDE ? t('tickets.noSede') : (sedes.find((s) => s.id === sedeF)?.nombre ?? ''),
      quitar: () => setSedeF(''),
    },
    foco && { id: 'foco', texto: ETIQUETA_FOCO[foco], quitar: () => setFoco('') },
    q && { id: 'q', texto: `"${q}"`, quitar: () => setQ('') },
  ].filter(Boolean) as ChipFiltro[];

  const Tip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-ink-100 dark:border-white/10 bg-white dark:bg-ink-800 px-3 py-2 shadow-card-hover">
        <div className="text-xs text-ink-400 mb-0.5">{label ?? payload[0].name}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.payload.fill ?? p.color }} />
            {p.dataKey === 'dias' ? t('tickets.avgDaysShort', { n: p.value }) : p.value}
          </div>
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('common.error')}
        description={(error as Error).message}
        action={<Button onClick={() => refetch()}>{t('common.retry')}</Button>}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={t('tickets.title')} subtitle={t('tickets.subtitle')} icon={TicketIcon}
        action={(
          <div className="flex flex-wrap gap-2">
            <Button
              icon={Download} onClick={exportarExcel} loading={exportando}
              disabled={!filtrados.length}
            >
              {t('tickets.export')}
            </Button>
            {puedeImportar && (
              <Button icon={Upload} onClick={() => setImportar(true)}>{t('tickets.import')}</Button>
            )}
            {puedeEditar && (
              <Button variant="primary" icon={Plus} onClick={abrirNuevo}>{t('tickets.new')}</Button>
            )}
          </div>
        )}
      />

      {/* ------------------------------------------------------------ KPIs */}
      {/* Se pintan SIEMPRE, también sobre el panel.
          Estuvieron ocultos en la vista Panel mientras las dos lecturas se
          contradecían —estas contaban todo el parque y las del panel obedecían
          a los filtros—, y ver dos totales distintos en la misma pantalla era
          peor que no verlos. Ahora las dos salen de `base`, así que dicen lo
          mismo y se complementan: aquí el pulso de la mesa (abiertos, atrasados,
          días medios), abajo el desglose por estado. La cabecera de la pantalla
          no cambia al cambiar de vista, que es lo que se pidió. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        {tarjetasKpi.map((k, i) => {
          const pulsable = k.foco !== undefined;
          const activa = pulsable && !!k.foco && k.foco === foco;
          const Contenido = (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-2xl font-bold tabular-nums">
                  {k.decimal ? k.n.toFixed(1) : <NumeroAnimado value={k.n} />}
                </div>
                <div className="text-xs text-ink-400 mt-0.5 truncate">{k.label}</div>
              </div>
              <span className={`w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${k.tono} text-white grid place-items-center shadow-card transition-transform group-hover:scale-105`}>
                <k.icon size={17} />
              </span>
            </div>
          );
          return (
            <motion.div
              key={k.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', damping: 24, stiffness: 240 }}
            >
              {pulsable ? (
                <button
                  onClick={() => alternarFoco(k.foco as Foco)}
                  aria-pressed={activa}
                  // El aro dice qué filtro está puesto. Sin él, pulsar una
                  // tarjeta cambiaba la lista sin dejar rastro de quién lo hizo.
                  className={`card-interactive p-4 text-left group w-full h-full transition-shadow ${
                    activa ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-ink-50 dark:ring-offset-ink-900' : ''
                  }`}
                >
                  {Contenido}
                </button>
              ) : (
                <div className="card p-4 group h-full">{Contenido}</div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* --------------------------------------------------------- filtros */}
      <BarraFiltros
        q={q} onQ={setQ} placeholder={t('tickets.searchPlaceholder')}
        campos={campos} chips={chips} onLimpiar={limpiar}
        vista={vista} onVista={(v) => cambiarVista(v as Vista)}
        vistas={[
          { valor: 'panel', icono: Gauge, titulo: t('tickets.view_panel') },
          { valor: 'tabla', icono: Table2, titulo: t('tickets.view_tabla') },
          { valor: 'tarjetas', icono: LayoutGrid, titulo: t('tickets.view_tarjetas') },
          { valor: 'graficos', icono: ChartPie, titulo: t('tickets.view_graficos') },
        ]}
      />

      {/* ------------------------------------------------------- resultado */}
      {/* Sin filas no hay nada que contar ni que exportar: sin esta condición,
          la pantalla vacía anunciaba "Panel sobre 0 tickets" junto a un botón
          de descarga apagado, encima del cartel que ya explica que no hay
          nada. Tres mensajes para decir lo mismo. */}
      {/* La vista Panel se salta esta línea: su propia cabecera ya dice sobre
          cuántos tickets está calculando y con qué alcance. */}
      {!isLoading && filtrados.length > 0 && vista !== 'panel' && (
        <div className="mb-3 px-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-ink-400">
            {esListado
              ? t('tickets.showing', { visibles: mostrados.length, total: filtrados.length })
              : t('tickets.chartsOver', { count: filtrados.length })}
          </p>
          {vista === 'graficos' && (
            <Button
              variant="ghost" icon={FileDown} loading={exportando}
              onClick={exportarGraficos}
            >
              {t('tickets.exportChartsPdf')}
            </Button>
          )}
          {vista !== 'graficos' && (
            <Button variant="ghost" icon={FileDown} onClick={exportarCsv}>
              {t('tickets.exportCsv')}
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <SkeletonGrid count={6} />
      ) : !filtrados.length ? (
        <EmptyState
          icon={TicketIcon}
          variant={hayFiltros ? 'search' : 'default'}
          title={hayFiltros ? t('tickets.emptyFiltered') : t('tickets.empty')}
          description={hayFiltros ? t('tickets.emptyFilteredHint') : t('tickets.emptyHint')}
          action={hayFiltros
            ? <Button onClick={limpiar}>{t('common.clearFilters')}</Button>
            : puedeImportar
              ? <Button variant="primary" icon={Upload} onClick={() => setImportar(true)}>{t('tickets.import')}</Button>
              : undefined}
        />
      ) : vista === 'panel' ? (
        <PanelOperaciones
          panel={panel} pct={pct} periodo={periodo} filtrado={hayFiltros} diasAtraso={DIAS_ATRASO}
          // Pulsar un número del panel LLEVA a esos tickets. Antes se quedaba en
          // el panel y recalculaba: pulsabas "Bloqueadas 4" y el tablero entero
          // pasaba a decir 4 tickets, 100% bloqueadas. La pregunta era "cuáles
          // son", y la respuesta era el mismo tablero con otros números.
          onVer={verTickets} foco={foco}
        />
      ) : vista === 'tabla' ? (
        // La fila entera abre la ficha: en una tabla que se consulta, obligar a
        // apuntar al número de ticket es hacer trabajar al usuario para nada.
        // Los botones de editar y retirar siguen siendo suyos.
        <DataTable
          rows={mostrados} columns={columnas} rowKey={(x) => x.id}
          onRowClick={(x) => setFicha(x)}
        />
      ) : vista === 'tarjetas' ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {mostrados.map((x) => {
            const d = diasTranscurridos(x);
            const atrasado = x.estado !== 'COMPLETADA' && d != null && d >= DIAS_ATRASO;
            return (
              <button
                key={x.id} onClick={() => setFicha(x)}
                className="card-interactive p-4 text-left flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold tabular-nums truncate">
                      <Resaltado texto={x.ticket} terminos={terminos} />
                    </div>
                    <div className="text-xs text-ink-400 line-clamp-2">
                      <Resaltado texto={x.descripcion} terminos={terminos} />
                    </div>
                  </div>
                  <span className={`badge shrink-0 ${COLOR_ESTADO[x.estado]}`}>
                    {t(ETIQUETA_ESTADO[x.estado])}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays size={12} /> {fmtDate(x.fecha_inicio, i18n.language)}
                  </span>
                  {d != null && (
                    <span className={`inline-flex items-center gap-1 tabular-nums ${atrasado ? 'text-red-600 dark:text-danger font-semibold' : ''}`}>
                      <Clock size={12} /> {t('tickets.daysCount', { count: d })}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 truncate">
                    <User size={12} />
                    {nombreAnalista(x.analista_id) ?? x.analista_texto ?? t('tickets.noAnalyst')}
                  </span>
                </div>

                {x.notas && (
                  <p className="text-xs text-ink-500 dark:text-ink-300 line-clamp-3 border-t border-ink-100 dark:border-white/10 pt-2">
                    <StickyNote size={11} className="inline mr-1 -mt-0.5" />
                    <Resaltado texto={x.notas} terminos={terminos} />
                  </p>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <GraficoCard
            ref={refs.estado} fondoExport={superficie}
            titulo={t('tickets.chartState')} lectura={t('tickets.chartStateRead')}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porEstado} margin={{ top: 16, right: 12, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={rejilla} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} allowDecimals={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {porEstado.map((d) => <Cell key={d.name} fill={d.fill} />)}
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: tinta }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>

          {/* Volumen y días medios de cierre en el mismo gráfico: es la lectura
              que importa —si el mes que más tickets trajo fue también el más
              lento— y en el archivo había que hacerla de memoria. */}
          <GraficoCard
            ref={refs.mes} fondoExport={superficie}
            titulo={t('tickets.chartMonth')} lectura={t('tickets.chartMonthHint')}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porMes} margin={{ top: 16, right: 12, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={rejilla} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} allowDecimals={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                <Bar dataKey="value" fill={oscuro ? '#17a94f' : '#0a9038'} radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: tinta }} />
                </Bar>
                <Bar dataKey="dias" fill={oscuro ? '#3d84d6' : '#1d6fd4'} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>

          <GraficoCard
            ref={refs.analista} fondoExport={superficie}
            titulo={t('tickets.chartAnalyst')} lectura={t('tickets.chartAnalystRead')}
          >
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={porAnalista} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={rejilla} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                <Bar dataKey="value" fill={oscuro ? '#3d84d6' : '#1d6fd4'} radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: tinta }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>

          <GraficoCard
            ref={refs.prioridad} fondoExport={superficie}
            titulo={t('tickets.chartPriority')} lectura={t('tickets.chartPriorityRead')}
          >
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porPrioridad} margin={{ top: 16, right: 12, left: -18, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={rejilla} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tinta }} axisLine={false} tickLine={false} allowDecimals={false} />
                <RTooltip content={<Tip />} cursor={{ fill: rejilla }} />
                <Bar dataKey="value" fill={oscuro ? '#e0b341' : '#b8860b'} radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: tinta }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </GraficoCard>
        </div>
      )}

      {esListado && visibles < filtrados.length && (
        <div ref={centinela} className="py-6 text-center">
          <Button variant="ghost" onClick={() => setVisibles((v) => v + PASO_VISIBLES)}>
            {t('tickets.loadMore', { count: Math.min(PASO_VISIBLES, filtrados.length - visibles) })}
          </Button>
        </div>
      )}

      {/* --------------------------------------------------------- modales */}
      <FichaTicket
        ticket={ficha}
        analista={nombreAnalista(ficha?.analista_id)}
        sede={nombreSede(ficha?.sede_id)}
        onClose={() => setFicha(null)}
        onEditar={puedeEditar ? abrirEdicion : undefined}
      />

      <ImportarTicketsModal
        open={importar}
        onClose={() => setImportar(false)}
        onCargado={() => refetch()}
        analistasMesa={analistasMesa}
        sedes={sedes}
        puedeEnlazar={puedeEnlazar}
        existentes={todos}
      />

      <Modal
        open={open} onClose={cerrar} size="lg"
        title={editando ? t('tickets.edit') : t('tickets.new')}
        subtitle={editando ? editando.ticket : t('tickets.newHint')}
      >
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('tickets.fTicket')} *</label>
              <input
                className="input tabular-nums"
                value={f.ticket ?? ''} onChange={(e) => setF({ ...f, ticket: e.target.value })}
                placeholder="196056-1"
              />
            </div>
            <div>
              <label className="label">{t('tickets.fState')}</label>
              <Select
                value={f.estado ?? 'PENDIENTE'}
                onChange={(v) => setF({ ...f, estado: v as EstadoTicket })}
                options={ESTADOS.map((e) => ({ value: e, label: t(ETIQUETA_ESTADO[e]) }))}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="label">{t('tickets.fDescription')}</label>
              <input
                className="input uppercase"
                value={f.descripcion ?? ''} onChange={(e) => setF({ ...f, descripcion: e.target.value })}
                placeholder="DEVOLUCION DE EQUIPO DE COMPUTO"
              />
              <p className="text-[11px] text-ink-400 mt-1">{t('tickets.hDescription')}</p>
            </div>

            <div>
              <label className="label">{t('tickets.fStart')}</label>
              <input
                type="date" className="input"
                value={f.fecha_inicio ?? ''}
                onChange={(e) => setF({ ...f, fecha_inicio: e.target.value || null })}
              />
            </div>
            <div>
              <label className="label">{t('tickets.fEnd')}</label>
              <input
                type="date" className="input"
                value={f.fecha_fin ?? ''}
                onChange={(e) => setF({ ...f, fecha_fin: e.target.value || null })}
              />
              {/* Los días no se escriben: se ven. Es la diferencia con el
                  archivo, donde el número se podía teclear y quedar mintiendo. */}
              <p className={`text-[11px] mt-1 ${diasForm != null && diasForm < 0 ? 'text-danger' : 'text-ink-400'}`}>
                {diasForm == null
                  ? t('tickets.hDaysAuto')
                  : diasForm < 0
                    ? t('tickets.badDates')
                    : t('tickets.daysComputed', { count: diasForm })}
              </p>
            </div>

            <div>
              <label className="label">{t('tickets.fAnalyst')}</label>
              <Select
                value={f.analista_id ?? ''}
                onChange={(v) => setF({ ...f, analista_id: v || null })}
                placeholder={t('tickets.noAnalyst')}
                options={[
                  { value: '', label: t('tickets.noAnalyst') },
                  ...perfilesAnalistas.map((p) => ({ value: p.id, label: p.nombre })),
                ]}
              />
              {/* Lo que decía el archivo se puede corregir aquí: es el campo que
                  explica por qué un ticket quedó atribuido a quien quedó. */}
              {(f.analista_texto || editando) && (
                <input
                  className="input mt-2 text-sm"
                  value={f.analista_texto ?? ''}
                  onChange={(e) => setF({ ...f, analista_texto: e.target.value })}
                  placeholder={t('tickets.analystInFile')}
                />
              )}
            </div>
            <div>
              <label className="label">{t('users.sede')}</label>
              <Select
                value={f.sede_id ?? ''} onChange={(v) => setF({ ...f, sede_id: v || null })}
                placeholder={t('tickets.noSede')}
                options={[{ value: '', label: t('tickets.noSede') }, ...sedes.map(sedeOption)]}
              />
            </div>

            <div>
              <label className="label">{t('tickets.fPriority')}</label>
              <Select
                value={f.prioridad ?? ''}
                onChange={(v) => setF({ ...f, prioridad: (v || null) as PrioridadTicket | null })}
                options={[
                  { value: '', label: t('tickets.noPriority') },
                  ...PRIORIDADES.map((p) => ({ value: p, label: t(ETIQUETA_PRIORIDAD[p]) })),
                ]}
              />
            </div>
            <div>
              <label className="label">{t('tickets.fCompliance')}</label>
              <input
                type="number" min={0} max={100} className="input tabular-nums"
                value={f.cumplimiento ?? ''}
                onChange={(e) => setF({
                  ...f,
                  cumplimiento: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))),
                })}
                placeholder="100"
              />
            </div>
          </div>

          {/* Las notas, con sitio de verdad. Es el campo por el que la gente
              pidió esta pantalla: en el Excel no cabía más de una frase. */}
          <div>
            <label className="label">{t('tickets.fNotes')}</label>
            <textarea
              className="input min-h-[11rem] resize-y leading-relaxed"
              value={f.notas ?? ''} onChange={(e) => setF({ ...f, notas: e.target.value })}
              placeholder={t('tickets.hNotes')}
            />
            <p className="text-[11px] text-ink-400 mt-1">
              {t('tickets.notesCount', { count: (f.notas ?? '').length })}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={cerrar} disabled={busy}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={guardar} loading={busy}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!retirando} onClose={() => !busy && setRetirando(null)} size="sm"
        title={t('tickets.retireTitle')}
      >
        <p className="text-sm text-ink-500 dark:text-ink-300">
          {t('tickets.retireQuestion', { ticket: retirando?.ticket ?? '' })}
        </p>
        <p className="text-sm text-ink-400 mt-2">{t('tickets.retireHint')}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setRetirando(null)} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="danger" icon={Trash2} onClick={retirar} loading={busy}>
            {t('tickets.retire')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

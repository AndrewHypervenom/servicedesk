import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History, Search, Plus, Pencil, EyeOff, Undo2, Trash2, ChevronDown, ScrollText, Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listAuditoria, listPerfiles } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { exportRowsExcel } from '@/lib/excel';
import { useApp } from '@/store/useApp';
import { fmtDateTime } from '@/lib/format';
import type { RegistroAuditoria } from '@/types';

type Tipo = 'crear' | 'editar' | 'ocultar' | 'restaurar' | 'eliminar';

const ESTILO: Record<Tipo, { icon: React.ElementType; badge: string; ring: string }> = {
  crear:     { icon: Plus,   badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', ring: 'text-emerald-500' },
  editar:    { icon: Pencil, badge: 'bg-brand-500/15 text-brand-600 dark:text-brand-300',       ring: 'text-brand-500' },
  ocultar:   { icon: EyeOff, badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',        ring: 'text-amber-500' },
  restaurar: { icon: Undo2,  badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',              ring: 'text-sky-500' },
  eliminar:  { icon: Trash2, badge: 'bg-danger/15 text-danger',                                  ring: 'text-danger' },
};

/** Qué acción representa el registro (el UPDATE se afina según `eliminado_en`). */
function tipoDe(reg: RegistroAuditoria): Tipo {
  if (reg.accion === 'INSERT') return 'crear';
  if (reg.accion === 'DELETE') return 'eliminar';
  const cambio = (reg.datos as Record<string, { antes?: unknown; despues?: unknown }> | null)?.eliminado_en;
  if (cambio) return cambio.despues ? 'ocultar' : 'restaurar';
  return 'editar';
}

const OCULTAR_CAMPOS = new Set(['id', 'creado_en', 'actualizado_en', 'codigo_qr', 'eliminado_por']);

function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function Auditoria() {
  const { t } = useTranslation();
  const { idioma } = useApp();
  const [q, setQ] = useState('');
  const [entidad, setEntidad] = useState('');
  const [accion, setAccion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [abierta, setAbierta] = useState<Set<number>>(new Set());

  const { data: registros = [], isLoading } = useQuery({
    queryKey: ['auditoria'], queryFn: () => listAuditoria(500),
  });
  const { data: perfiles = [] } = useQuery({ queryKey: ['perfiles'], queryFn: listPerfiles });

  const nombreActor = (id?: string | null) =>
    id ? (perfiles.find((p) => p.id === id)?.nombre ?? id.slice(0, 8)) : t('audit.system');

  const entidadLabel = (e: string) => t(`audit.entities.${e}`, { defaultValue: e });

  /** Nombre legible del registro tocado, buscando en el detalle. */
  const registroLabel = (reg: RegistroAuditoria): string => {
    const d = reg.datos ?? {};
    const leer = (k: string) => {
      const v = (d as Record<string, unknown>)[k];
      if (v && typeof v === 'object' && 'despues' in (v as object)) {
        const dd = v as { antes?: unknown; despues?: unknown };
        return (dd.despues ?? dd.antes) as unknown;
      }
      return v;
    };
    for (const k of ['nombre', 'serial', 'etiqueta', 'marca', 'consecutivo']) {
      const v = leer(k);
      if (v) return String(v);
    }
    return reg.entidad_id ?? '—';
  };

  const entidadesPresentes = useMemo(
    () => [...new Set(registros.map((r) => r.entidad))].sort(),
    [registros],
  );

  const lista = useMemo(() => {
    const term = q.trim().toLowerCase();
    const min = desde ? new Date(desde + 'T00:00:00').getTime() : null;
    const max = hasta ? new Date(hasta + 'T23:59:59.999').getTime() : null;
    return registros.filter((r) => {
      if (entidad && r.entidad !== entidad) return false;
      if (accion && tipoDe(r) !== accion) return false;
      const ts = new Date(r.creado_en).getTime();
      if (min !== null && ts < min) return false;
      if (max !== null && ts > max) return false;
      if (!term) return true;
      return [
        registroLabel(r), nombreActor(r.actor), r.entidad_id ?? '', entidadLabel(r.entidad),
      ].some((s) => s.toLowerCase().includes(term));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registros, q, entidad, accion, desde, hasta, perfiles]);

  /** Detalle en una sola línea para la celda de Excel. */
  const detalleTexto = (reg: RegistroAuditoria): string =>
    Object.entries(reg.datos ?? {})
      .filter(([k]) => !OCULTAR_CAMPOS.has(k))
      .map(([campo, valor]) => {
        if (reg.accion === 'UPDATE' && valor && typeof valor === 'object' && 'despues' in (valor as object)) {
          const dd = valor as { antes?: unknown; despues?: unknown };
          return `${campo}: ${fmtValor(dd.antes)} → ${fmtValor(dd.despues)}`;
        }
        return `${campo}: ${fmtValor(valor)}`;
      })
      .join('; ');

  const exportar = () => {
    const filas = lista.map((reg) => ({
      [t('audit.cols.date')]: fmtDateTime(reg.creado_en, idioma),
      [t('audit.cols.actor')]: nombreActor(reg.actor),
      [t('audit.cols.action')]: t(`audit.actions.${tipoDe(reg)}`),
      [t('audit.cols.entity')]: entidadLabel(reg.entidad),
      [t('audit.cols.record')]: registroLabel(reg),
      [t('audit.cols.id')]: reg.entidad_id ?? '',
      [t('audit.cols.detail')]: detalleTexto(reg),
    }));
    exportRowsExcel(filas, t('audit.title'), `auditoria_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const toggle = (id: number) =>
    setAbierta((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div>
      <PageHeader
        title={t('audit.title')} subtitle={t('audit.subtitle')} icon={History}
        action={
          <Button icon={Download} onClick={exportar} disabled={lista.length === 0}>
            {t('audit.exportExcel')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[16rem]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={t('audit.searchPlaceholder')}
            className="input !pl-9"
          />
        </div>
        <select value={entidad} onChange={(e) => setEntidad(e.target.value)} className="input w-auto min-w-[11rem]">
          <option value="">{t('audit.allEntities')}</option>
          {entidadesPresentes.map((e) => <option key={e} value={e}>{entidadLabel(e)}</option>)}
        </select>
        <select value={accion} onChange={(e) => setAccion(e.target.value)} className="input w-auto min-w-[11rem]">
          <option value="">{t('audit.allActions')}</option>
          {(['crear', 'editar', 'ocultar', 'restaurar', 'eliminar'] as Tipo[]).map((a) =>
            <option key={a} value={a}>{t(`audit.actions.${a}`)}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-ink-400 whitespace-nowrap">{t('audit.from')}</label>
          <input type="date" value={desde} max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)} className="input w-auto" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-ink-400 whitespace-nowrap">{t('audit.to')}</label>
          <input type="date" value={hasta} min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)} className="input w-auto" />
        </div>
      </div>

      {!isLoading && registros.length > 0 && (
        <p className="text-xs text-ink-400 mb-3">{t('audit.count', { n: lista.length })}</p>
      )}

      {isLoading ? (
        <div className="card p-5"><SkeletonText lines={6} /></div>
      ) : registros.length === 0 ? (
        <EmptyState icon={ScrollText} title={t('audit.empty')} description={t('audit.emptyDesc')} />
      ) : lista.length === 0 ? (
        <EmptyState icon={Search} title={t('audit.noMatch')} />
      ) : (
        <div className="space-y-2">
          {lista.map((reg) => {
            const tipo = tipoDe(reg);
            const est = ESTILO[tipo];
            const Icono = est.icon;
            const expandida = abierta.has(reg.id);
            const detalle = Object.entries(reg.datos ?? {}).filter(([k]) => !OCULTAR_CAMPOS.has(k));
            return (
              <div key={reg.id} className="card overflow-hidden">
                <button
                  onClick={() => toggle(reg.id)}
                  className="w-full flex items-center gap-4 p-3.5 text-left hover:bg-ink-50/60 dark:hover:bg-white/5 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl bg-ink-100 dark:bg-white/5 grid place-items-center shrink-0 ${est.ring}`}>
                    <Icono size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge ${est.badge}`}>{t(`audit.actions.${tipo}`)}</span>
                      <span className="text-xs text-ink-400">{entidadLabel(reg.entidad)}</span>
                      <span className="font-semibold truncate">{registroLabel(reg)}</span>
                    </div>
                    <div className="text-xs text-ink-400 mt-0.5">
                      {nombreActor(reg.actor)} · {fmtDateTime(reg.creado_en, idioma)}
                    </div>
                  </div>
                  {detalle.length > 0 && (
                    <ChevronDown
                      size={16}
                      className={`text-ink-400 shrink-0 transition-transform ${expandida ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                <AnimatePresence initial={false}>
                  {expandida && detalle.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-ink-100 dark:border-white/10"
                    >
                      <dl className="px-4 py-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[max-content_1fr]">
                        {detalle.map(([campo, valor]) => {
                          const diff = reg.accion === 'UPDATE'
                            && valor && typeof valor === 'object' && 'despues' in (valor as object);
                          const dd = valor as { antes?: unknown; despues?: unknown };
                          return (
                            <div key={campo} className="contents">
                              <dt className="font-mono text-xs text-ink-400 pt-0.5">{campo}</dt>
                              <dd className="text-ink-700 dark:text-ink-200 break-words">
                                {diff ? (
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="line-through text-ink-400">{fmtValor(dd.antes)}</span>
                                    <span className="text-ink-300">→</span>
                                    <span className="font-medium">{fmtValor(dd.despues)}</span>
                                  </span>
                                ) : fmtValor(valor)}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Boxes, ChevronDown, Download, Info, ShieldAlert, Users, ArrowLeftRight, Check,
} from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { normCedula } from '@/lib/importador/normalizar';
import type { Incidencia, ResultadoAnalisis, Resoluciones, Severidad } from '@/lib/importador/tipos';
import type { Sede } from '@/types';

interface Props {
  analisis: ResultadoAnalisis;
  sedes: Sede[];
  res: Resoluciones;
  onRes: (r: Resoluciones) => void;
}

const SEV_ESTILO: Record<Severidad, { chip: string; icono: typeof Info }> = {
  BLOQUEANTE: { chip: 'bg-danger/15 text-red-600 dark:text-danger', icono: ShieldAlert },
  ADVERTENCIA: { chip: 'bg-warning/15 text-amber-600 dark:text-warning', icono: AlertTriangle },
  INFO: { chip: 'bg-magenta-500/15 text-magenta-600 dark:text-magenta-300', icono: Info },
};

/** Descarga las incidencias para poder revisarlas fuera de la app. */
function exportarIncidencias(incidencias: Incidencia[], archivo: string) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['Severidad', 'Hoja', 'Fila', 'Columna', 'Valor', 'Qué pasó', 'Qué hacer'].map(esc).join(';'),
    ...incidencias.map((i) => [i.severidad, i.hoja, i.fila ?? '', i.columna ?? '', i.valor ?? '', i.mensaje, i.sugerencia ?? ''].map(esc).join(';')),
  ].join('\r\n');
  // El BOM hace que Excel abra las tildes bien.
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `revision_${archivo.replace(/\.xlsx?$/i, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Tile({ icono: Icono, valor, etiqueta, tono, i }: {
  icono: typeof Boxes; valor: number; etiqueta: string; tono: string; i: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, type: 'spring', damping: 20, stiffness: 260 }}
      className="card p-4"
    >
      <div className={`w-9 h-9 rounded-xl grid place-items-center mb-2.5 ${tono}`}>
        <Icono size={17} />
      </div>
      <div className="text-2xl font-semibold tabular-nums leading-none">{valor}</div>
      <div className="text-xs text-ink-400 mt-1.5">{etiqueta}</div>
    </motion.div>
  );
}

export function PanelRevision({ analisis, sedes, res, onRes }: Props) {
  const [verAdvertencias, setVerAdvertencias] = useState(false);

  const advertencias = useMemo(
    () => analisis.incidencias.filter((i) => i.severidad === 'ADVERTENCIA'),
    [analisis.incidencias],
  );
  const infos = useMemo(
    () => analisis.incidencias.filter((i) => i.severidad === 'INFO'),
    [analisis.incidencias],
  );

  const setCedula = (nombre: string, valor: string) =>
    onRes({ ...res, cedulas: { ...res.cedulas, [nombre]: valor } });

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile i={0} icono={Boxes} valor={analisis.equipos.length} etiqueta="Equipos" tono="bg-brand-500/15 text-brand-600 dark:text-brand-400" />
        <Tile i={1} icono={Users} valor={analisis.colaboradores.length} etiqueta="Colaboradores" tono="bg-magenta-500/15 text-magenta-600 dark:text-magenta-300" />
        <Tile i={2} icono={ArrowLeftRight} valor={analisis.movimientos.length} etiqueta="Movimientos" tono="bg-ink-200/60 dark:bg-white/10 text-ink-600 dark:text-ink-200" />
        <Tile i={3} icono={AlertTriangle} valor={advertencias.length} etiqueta="Por revisar" tono="bg-warning/15 text-amber-600 dark:text-warning" />
      </div>

      {/* ------------------------------------------------------------ hojas */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 dark:border-white/5 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Hojas del archivo</h4>
          <span className="text-xs text-ink-400">analizado en {analisis.duracionMs} ms</span>
        </div>
        <div className="divide-y divide-ink-50 dark:divide-white/5">
          {analisis.hojas.map((h, i) => (
            <motion.div
              key={h.nombre}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 + i * 0.04 }}
              className={`px-4 py-2.5 flex items-center gap-3 text-sm ${h.ignorada ? 'opacity-55' : ''}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.ignorada ? 'bg-ink-300' : 'bg-brand-500'}`} />
              <span className="font-medium w-44 truncate">{h.nombre}</span>
              <span className="text-ink-400 text-xs flex-1 truncate">
                {h.ignorada ? h.nota : `${h.filasUtiles} de ${h.filasLeidas} filas → ${h.destino}`}
                {!h.ignorada && h.nota ? ` · ${h.nota}` : ''}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- sede */}
      <div className="card p-4">
        <label className="label">Sede destino *</label>
        <p className="text-xs text-ink-400 mb-2.5">
          {analisis.ubicaciones.length
            ? `El archivo dice «${analisis.ubicaciones.join(', ')}». Elige contra qué sede del sistema se registra.`
            : 'El archivo no trae ubicación. Elige la sede destino.'}
        </p>
        <Select
          value={res.sedeId ?? ''}
          onChange={(v) => onRes({ ...res, sedeId: v || null })}
          placeholder="Selecciona una sede"
          options={sedes.map((s) => ({
            value: s.id,
            label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre,
          }))}
        />
        {!sedes.length && (
          <p className="text-xs text-danger mt-2">
            No hay sedes creadas. Crea la sede en Sedes antes de importar.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------- bloqueantes */}
      {analisis.pendientesCedula.length > 0 && (
        <div className="card overflow-hidden border-danger/30">
          <div className="px-4 py-3 bg-danger/[0.06] border-b border-danger/15 flex items-center gap-2">
            <ShieldAlert size={16} className="text-danger shrink-0" />
            <h4 className="text-sm font-semibold">Cédulas que faltan</h4>
            <span className="badge bg-danger/15 text-red-600 dark:text-danger ml-auto">
              {analisis.pendientesCedula.length}
            </span>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-ink-400 mb-3.5">
              Estas personas tienen equipos a cargo, pero el archivo nunca dice su cédula
              (solo la hoja ENTRADAS la trae, y ahí no aparecen). Sin cédula no se puede
              crear el colaborador ni sostener la asignación.
            </p>
            <div className="space-y-2.5">
              {analisis.pendientesCedula.map((p) => {
                const valor = res.cedulas[p.nombre] ?? '';
                const ok = normCedula(valor) !== null;
                const escrito = valor.trim().length > 0;
                return (
                  <div key={p.nombre} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.nombre}</div>
                      <div className="text-xs text-ink-400 truncate">
                        {p.seriales.join(', ')} · según {p.origen.join(' y ')}
                      </div>
                    </div>
                    <div className="relative sm:w-52 shrink-0">
                      <input
                        className={`input pr-9 ${escrito && !ok ? '!border-danger focus:!ring-danger/40' : ''}`}
                        placeholder="Cédula"
                        inputMode="numeric"
                        value={valor}
                        onChange={(e) => setCedula(p.nombre, e.target.value)}
                      />
                      {ok && (
                        <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {analisis.conflictos.length > 0 && (
        <div className="card overflow-hidden border-danger/30">
          <div className="px-4 py-3 bg-danger/[0.06] border-b border-danger/15 flex items-center gap-2">
            <ShieldAlert size={16} className="text-danger shrink-0" />
            <h4 className="text-sm font-semibold">Seriales que se contradicen</h4>
            <span className="badge bg-danger/15 text-red-600 dark:text-danger ml-auto">
              {analisis.conflictos.length}
            </span>
          </div>
          <div className="px-4 py-3 space-y-4">
            <p className="text-xs text-ink-400">
              El mismo serial aparece varias veces con datos distintos. Como el serial es
              único en el inventario, hay que quedarse con una sola versión.
            </p>
            {analisis.conflictos.map((c) => (
              <div key={c.serial}>
                <div className="font-mono text-sm font-semibold mb-2">{c.serial}</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {c.opciones.map((o) => {
                    const elegida = res.conflictos[c.serial] === o.fila;
                    return (
                      <button
                        key={o.fila}
                        onClick={() => onRes({ ...res, conflictos: { ...res.conflictos, [c.serial]: o.fila } })}
                        className={`text-left p-3 rounded-xl border transition-all ${
                          elegida
                            ? 'border-brand-500 bg-brand-500/[0.07] ring-2 ring-brand-500/25'
                            : 'border-ink-200 dark:border-white/10 hover:border-ink-300 dark:hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-ink-400">Fila {o.fila}</span>
                          {elegida && <Check size={13} className="text-brand-500 ml-auto" />}
                        </div>
                        <div className="text-sm font-medium">{o.resumen}</div>
                        <div className="text-xs text-ink-400 mt-1">
                          {o.estado_asignacion} · {o.estado_fisico}
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5 truncate">
                          {o.usuario ?? 'En bodega'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ advertencias */}
      {(advertencias.length > 0 || infos.length > 0) && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setVerAdvertencias((v) => !v)}
            className="w-full px-4 py-3 flex items-center gap-2 hover:bg-ink-50/60 dark:hover:bg-white/5 transition-colors"
          >
            <AlertTriangle size={16} className="text-warning shrink-0" />
            <h4 className="text-sm font-semibold">Datos que conviene revisar a mano</h4>
            <span className="badge bg-warning/15 text-amber-600 dark:text-warning">{advertencias.length}</span>
            <motion.span animate={{ rotate: verAdvertencias ? 180 : 0 }} className="ml-auto text-ink-400">
              <ChevronDown size={16} />
            </motion.span>
          </button>

          {verAdvertencias && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}>
              <div className="border-t border-ink-100 dark:border-white/5 max-h-72 overflow-y-auto divide-y divide-ink-50 dark:divide-white/5">
                {[...advertencias, ...infos].map((inc) => {
                  const { chip, icono: Icono } = SEV_ESTILO[inc.severidad];
                  return (
                    <div key={inc.id} className="px-4 py-2.5 flex gap-3">
                      <span className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 mt-0.5 ${chip}`}>
                        <Icono size={12} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">{inc.mensaje}</div>
                        {inc.sugerencia && (
                          <div className="text-xs text-ink-400 mt-0.5">{inc.sugerencia}</div>
                        )}
                        <div className="text-[11px] text-ink-400 mt-1 font-mono">
                          {inc.hoja}{inc.fila ? ` · fila ${inc.fila}` : ''}{inc.columna ? ` · ${inc.columna}` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2.5 border-t border-ink-100 dark:border-white/5">
                <button
                  onClick={() => exportarIncidencias([...advertencias, ...infos], analisis.archivo)}
                  className="btn-ghost !py-1.5 !px-2 text-xs"
                >
                  <Download size={13} /> Descargar lista en CSV
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

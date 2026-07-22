import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, Boxes, ChevronDown, Download, Info, ShieldAlert, Users, ArrowLeftRight, Check,
} from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { normCedula } from '@/lib/importador/normalizar';
import type {
  ConflictoSerial, Incidencia, ResultadoAnalisis, Resoluciones, Severidad, TipoIncidencia,
} from '@/lib/importador/tipos';
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

/** Título de cada familia de incidencias, para poder agruparlas y que 16
 *  avisos idénticos no se lean como 16 problemas distintos. */
const TITULO_TIPO: Record<TipoIncidencia, string> = {
  CEDULA_FALTANTE: 'Cédulas que faltan',
  CEDULA_INVALIDA: 'Cédulas que no se pudieron leer',
  SERIAL_CONFLICTO: 'Seriales repetidos',
  SERIAL_HUERFANO: 'Movimientos de equipos que no están en BD_EQUIPOS',
  SERIAL_YA_EXISTE: 'Seriales que ya están en el inventario',
  MODELO_SOSPECHOSO: 'Modelos que parecen tarjeta de red o serial',
  MODELO_AUSENTE: 'Equipos sin modelo',
  MARCA_SOSPECHOSA: 'Marcas que en realidad son una línea de producto',
  VALOR_NO_CATALOGADO: 'Valores fuera del catálogo',
  FECHA_INVALIDA: 'Fechas que no se pudieron leer',
  HOJA_IGNORADA: 'Hojas sin datos para importar',
  FILAS_PLANTILLA: 'Filas de plantilla omitidas',
};

const ESTADO_ASIG: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  ASIGNADO: 'Asignado',
  EN_MANTENIMIENTO: 'En mantenimiento',
  EN_DEVOLUCION: 'En devolución',
  DE_BAJA: 'De baja',
};
const ESTADO_FIS: Record<string, string> = {
  BUENO: 'Bueno', REGULAR: 'Regular', CON_FALLA: 'Con falla', DANADO: 'Dañado',
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

/** Check verde que aparece con un "pop" cuando algo queda resuelto. */
function CheckPop({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <motion.span
      initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', damping: 14, stiffness: 400 }}
      className={`grid place-items-center ${className}`}
    >
      <Check size={size} className="text-brand-500" />
    </motion.span>
  );
}

/** Un dato de la tarjeta de conflicto. Los que difieren entre versiones se
 *  resaltan: son los únicos que le importan a quien tiene que decidir. */
function DatoConflicto({ etiqueta, valor, distinto }: {
  etiqueta: string; valor: string; distinto: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-ink-400 w-24 shrink-0">{etiqueta}</span>
      <span className={distinto
        ? 'font-semibold text-ink-800 dark:text-ink-100 bg-warning/15 rounded px-1.5 py-0.5 -mx-1.5'
        : 'text-ink-500 dark:text-ink-300'}
      >
        {valor}
      </span>
    </div>
  );
}

function TarjetaConflicto({ conflicto, elegida, onElegir }: {
  conflicto: ConflictoSerial;
  elegida: number | undefined;
  onElegir: (fila: number) => void;
}) {
  // Solo se resalta lo que cambia entre versiones; lo idéntico no ayuda a decidir.
  const difiere = useMemo(() => ({
    resumen: new Set(conflicto.opciones.map((o) => o.resumen)).size > 1,
    estado: new Set(conflicto.opciones.map((o) => o.estado_asignacion)).size > 1,
    fisico: new Set(conflicto.opciones.map((o) => o.estado_fisico)).size > 1,
    usuario: new Set(conflicto.opciones.map((o) => o.usuario ?? '')).size > 1,
  }), [conflicto]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-sm font-semibold">{conflicto.serial}</span>
        <AnimatePresence mode="wait">
          {elegida !== undefined ? (
            <motion.span
              key="ok" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="badge bg-brand-500/15 text-brand-600 dark:text-brand-400"
            >
              <Check size={11} /> Resuelto: fila {elegida}
            </motion.span>
          ) : (
            <motion.span
              key="pend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-xs text-ink-400"
            >
              Elige la versión correcta
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {conflicto.opciones.map((o) => {
          const activa = elegida === o.fila;
          return (
            <motion.button
              key={o.fila}
              onClick={() => onElegir(o.fila)}
              whileTap={{ scale: 0.98 }}
              className={`text-left p-3.5 rounded-xl border transition-all duration-200 ${
                activa
                  ? 'border-brand-500 bg-brand-500/[0.07] ring-2 ring-brand-500/25 shadow-sm'
                  : 'border-ink-200 dark:border-white/10 hover:border-brand-400/60 hover:bg-brand-500/[0.03] hover:-translate-y-0.5'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  Fila {o.fila} del Excel
                </span>
                <span className="ml-auto w-4 h-4">
                  {activa && <CheckPop size={15} />}
                </span>
              </div>
              <div className="space-y-1">
                <DatoConflicto etiqueta="Equipo" valor={o.resumen} distinto={difiere.resumen} />
                <DatoConflicto etiqueta="Estado" valor={ESTADO_ASIG[o.estado_asignacion] ?? o.estado_asignacion} distinto={difiere.estado} />
                <DatoConflicto etiqueta="Condición" valor={ESTADO_FIS[o.estado_fisico] ?? o.estado_fisico} distinto={difiere.fisico} />
                <DatoConflicto etiqueta="Responsable" valor={o.usuario ?? 'En bodega'} distinto={difiere.usuario} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function PanelRevision({ analisis, sedes, res, onRes }: Props) {
  const [verAdvertencias, setVerAdvertencias] = useState(false);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);

  const advertencias = useMemo(
    () => analisis.incidencias.filter((i) => i.severidad === 'ADVERTENCIA'),
    [analisis.incidencias],
  );
  const infos = useMemo(
    () => analisis.incidencias.filter((i) => i.severidad === 'INFO'),
    [analisis.incidencias],
  );

  // 16 avisos de "modelo sospechoso" son una sola cosa que revisar, no 16.
  const grupos = useMemo(() => {
    const m = new Map<string, { tipo: TipoIncidencia; severidad: Severidad; items: Incidencia[] }>();
    for (const i of [...advertencias, ...infos]) {
      const clave = `${i.severidad}/${i.tipo}`;
      const g = m.get(clave);
      if (g) g.items.push(i);
      else m.set(clave, { tipo: i.tipo, severidad: i.severidad, items: [i] });
    }
    return [...m.values()];
  }, [advertencias, infos]);

  const cedulasListas = analisis.pendientesCedula.filter(
    (p) => normCedula(res.cedulas[p.nombre] ?? '') !== null,
  ).length;

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
      <div id="imp-sede" className="card p-4 scroll-mt-4">
        <div className="flex items-center gap-2">
          <label className="label !mb-0">Sede destino *</label>
          {res.sedeId && <CheckPop size={14} />}
        </div>
        <p className="text-xs text-ink-400 mt-1 mb-2.5">
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
        <div id="imp-cedulas" className="card overflow-hidden border-danger/30 scroll-mt-4">
          <div className="px-4 py-3 bg-danger/[0.06] border-b border-danger/15 flex items-center gap-2">
            <ShieldAlert size={16} className="text-danger shrink-0" />
            <h4 className="text-sm font-semibold">Cédulas que faltan</h4>
            <AnimatePresence mode="wait">
              <motion.span
                key={cedulasListas === analisis.pendientesCedula.length ? 'ok' : 'falta'}
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className={`badge ml-auto tabular-nums ${
                  cedulasListas === analisis.pendientesCedula.length
                    ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400'
                    : 'bg-danger/15 text-red-600 dark:text-danger'
                }`}
              >
                {cedulasListas} de {analisis.pendientesCedula.length}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-ink-400 mb-3.5">
              Estas personas tienen equipos a cargo, pero el archivo nunca dice su cédula
              (solo la hoja ENTRADAS la trae, y ahí no aparecen). Sin cédula no se puede
              crear el colaborador ni sostener la asignación.
            </p>
            <div className="space-y-2.5">
              {analisis.pendientesCedula.map((p, i) => {
                const valor = res.cedulas[p.nombre] ?? '';
                const ok = normCedula(valor) !== null;
                const escrito = valor.trim().length > 0;
                return (
                  <motion.div
                    key={p.nombre}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl px-2.5 py-2 -mx-2.5 transition-colors ${
                      ok ? 'bg-brand-500/[0.05]' : ''
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.nombre}</div>
                      <div className="text-xs text-ink-400 truncate">
                        <span className="font-mono">{p.seriales.join(', ')}</span> · según {p.origen.join(' y ')}
                      </div>
                    </div>
                    <div className="sm:w-52 shrink-0">
                      <div className="relative">
                        <input
                          className={`input pr-9 ${escrito && !ok ? '!border-danger focus:!ring-danger/40' : ''}`}
                          placeholder="Cédula"
                          inputMode="numeric"
                          value={valor}
                          onChange={(e) => setCedula(p.nombre, e.target.value)}
                        />
                        {ok && <CheckPop className="absolute right-3 top-1/2 -translate-y-1/2" />}
                      </div>
                      {escrito && !ok && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          className="text-[11px] text-danger mt-1"
                        >
                          Solo números, entre 4 y 15 dígitos (los puntos se quitan solos).
                        </motion.p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {analisis.conflictos.length > 0 && (
        <div id="imp-conflictos" className="card overflow-hidden border-danger/30 scroll-mt-4">
          <div className="px-4 py-3 bg-danger/[0.06] border-b border-danger/15 flex items-center gap-2">
            <ShieldAlert size={16} className="text-danger shrink-0" />
            <h4 className="text-sm font-semibold">Seriales que se contradicen</h4>
            <span className="badge bg-danger/15 text-red-600 dark:text-danger ml-auto tabular-nums">
              {analisis.conflictos.filter((c) => res.conflictos[c.serial] !== undefined).length} de {analisis.conflictos.length}
            </span>
          </div>
          <div className="px-4 py-3 space-y-4">
            <p className="text-xs text-ink-400">
              El mismo serial aparece varias veces con datos distintos. Como el serial es
              único en el inventario, hay que quedarse con una sola versión: los campos
              resaltados son los que cambian entre una y otra.
            </p>
            {analisis.conflictos.map((c) => (
              <TarjetaConflicto
                key={c.serial}
                conflicto={c}
                elegida={res.conflictos[c.serial]}
                onElegir={(fila) => onRes({ ...res, conflictos: { ...res.conflictos, [c.serial]: fila } })}
              />
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ advertencias */}
      {grupos.length > 0 && (
        <div className="card overflow-hidden">
          <button
            onClick={() => setVerAdvertencias((v) => !v)}
            className="w-full px-4 py-3 flex items-center gap-2 hover:bg-ink-50/60 dark:hover:bg-white/5 transition-colors"
          >
            <AlertTriangle size={16} className="text-warning shrink-0" />
            <div className="text-left">
              <h4 className="text-sm font-semibold">Datos que conviene revisar a mano</h4>
              <p className="text-xs text-ink-400 font-normal">
                Se importan igual; esto es para que sepas qué corregir después.
              </p>
            </div>
            <span className="badge bg-warning/15 text-amber-600 dark:text-warning ml-1">{advertencias.length}</span>
            <motion.span animate={{ rotate: verAdvertencias ? 180 : 0 }} className="ml-auto text-ink-400">
              <ChevronDown size={16} />
            </motion.span>
          </button>

          <AnimatePresence>
            {verAdvertencias && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
              >
                <div className="border-t border-ink-100 dark:border-white/5 max-h-80 overflow-y-auto divide-y divide-ink-50 dark:divide-white/5">
                  {grupos.map((g) => {
                    const { chip, icono: Icono } = SEV_ESTILO[g.severidad];
                    const clave = `${g.severidad}/${g.tipo}`;
                    const abierto = grupoAbierto === clave;
                    return (
                      <div key={clave}>
                        <button
                          onClick={() => setGrupoAbierto(abierto ? null : clave)}
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-ink-50/60 dark:hover:bg-white/5 transition-colors text-left"
                        >
                          <span className={`w-6 h-6 rounded-lg grid place-items-center shrink-0 ${chip}`}>
                            <Icono size={12} />
                          </span>
                          <span className="text-sm flex-1 min-w-0 truncate">{TITULO_TIPO[g.tipo]}</span>
                          <span className="text-xs text-ink-400 tabular-nums">{g.items.length}</span>
                          <motion.span animate={{ rotate: abierto ? 180 : 0 }} className="text-ink-400">
                            <ChevronDown size={14} />
                          </motion.span>
                        </button>
                        <AnimatePresence>
                          {abierto && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }} className="overflow-hidden"
                            >
                              <div className="pb-2 bg-ink-50/40 dark:bg-white/[0.02]">
                                {g.items.map((inc, i) => (
                                  <motion.div
                                    key={inc.id}
                                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                                    className="px-4 py-2 pl-[52px]"
                                  >
                                    <div className="text-sm">{inc.mensaje}</div>
                                    {inc.sugerencia && (
                                      <div className="text-xs text-ink-400 mt-0.5">{inc.sugerencia}</div>
                                    )}
                                    <div className="text-[11px] text-ink-400 mt-1 font-mono">
                                      {inc.hoja}{inc.fila ? ` · fila ${inc.fila}` : ''}{inc.columna ? ` · ${inc.columna}` : ''}
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
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
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

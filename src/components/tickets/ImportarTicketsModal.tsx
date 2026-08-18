/**
 * Carga del libro "CONTROL TICKETS.xlsx".
 *
 * Cuatro pasos, y ninguno está de adorno:
 *
 *   1. Archivo. Se lee entero en el navegador; nada sale de aquí todavía.
 *   2. Meses. El libro es una hoja por mes y casi nunca se quieren todos: lo
 *      normal es recargar el mes en curso, que es el que cambia. Se marcan los
 *      que se van a cargar y se ve cuántas filas trae cada uno.
 *   3. Personas. El archivo escribe al analista a mano, así que aquí se dice a
 *      qué usuario del sitio corresponde cada nombre, y qué sede es cada
 *      ciudad. Lo que el sistema propone se ve marcado como propuesta, no como
 *      hecho consumado, y se puede cambiar uno por uno.
 *   4. Revisión. Qué se va a crear, qué se va a actualizar y qué filas traen
 *      algo raro (fechas ilegibles, fin antes del inicio, días que no cuadran).
 *      Solo después de esto se escribe.
 *
 * Volver a cargar el mismo mes NO duplica: la base identifica cada fila por
 * ticket + descripción + fecha de inicio y actualiza la que ya existía.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, CalendarDays, Check, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw,
  Upload, UserCheck, Users, X,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { toast } from '@/components/ui/Toast';
import { importarTickets, type ResultadoCargaTickets } from '@/lib/api';
import { normNombre } from '@/lib/importador/normalizar';
import {
  analizarLibro, cargables, contarPorTexto, filaParaCarga, proponerAnalistas, proponerCiudades,
  type AnalisisLibro, type EnlaceAnalista, type EnlaceCiudad, type FilaTicket, type TipoAviso,
} from '@/lib/tickets/libro';
import { seleccionables } from '@/lib/tickets/analistas';
import { etiquetaPeriodo } from '@/lib/tickets/modelo';
import type { AnalistaMesa, Sede, Ticket } from '@/types';

type Paso = 'archivo' | 'leyendo' | 'hojas' | 'enlaces' | 'revision' | 'aplicando' | 'listo' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se llama al terminar una carga con cambios, para refrescar la pantalla. */
  onCargado: () => void;
  /** El directorio de la mesa, tal como lo entrega `analistas_de_mesa()`. */
  analistasMesa: AnalistaMesa[];
  sedes: Sede[];
  /**
   * Si es false, el paso de enlaces no se enseña.
   *
   * Enlazar un ticket con una persona es decir quién hizo un trabajo, y eso lo
   * decide quien manda en la mesa: ADMIN, Jefe y Líder de sede. Quien no puede
   * hacerlo no ve el paso —una pantalla que no se puede tocar es peor que no
   * tenerla—, pero su carga NO se queda sin enlazar: se aplican las
   * coincidencias exactas, que no hay nada que decidir en ellas.
   */
  puedeEnlazar: boolean;
  /** Lo que ya está guardado: sirve para decir qué se crea y qué se actualiza. */
  existentes: Ticket[];
}

/** Texto de cada aviso. Se traduce aquí para que el analizador no sepa de i18n. */
const CLAVE_AVISO: Record<TipoAviso, string> = {
  SIN_TICKET: 'ticketsImport.wNoTicket',
  SIN_INICIO: 'ticketsImport.wNoStart',
  SIN_FIN: 'ticketsImport.wNoEnd',
  FIN_ANTES_DE_INICIO: 'ticketsImport.wBackwards',
  FECHA_ILEGIBLE: 'ticketsImport.wBadDate',
  DIAS_NO_CUADRAN: 'ticketsImport.wDaysMismatch',
  DUPLICADA: 'ticketsImport.wDuplicate',
  SIN_ANALISTA: 'ticketsImport.wNoAnalyst',
};

export function ImportarTicketsModal({
  open, onClose, onCargado, analistasMesa, sedes, existentes, puedeEnlazar,
}: Props) {
  const { t } = useTranslation();

  const [paso, setPaso] = useState<Paso>('archivo');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [libro, setLibro] = useState<AnalisisLibro | null>(null);
  const [hojasElegidas, setHojasElegidas] = useState<string[]>([]);
  const [analistas, setAnalistas] = useState<EnlaceAnalista[]>([]);
  const [ciudades, setCiudades] = useState<EnlaceCiudad[]>([]);
  const [avance, setAvance] = useState(0);
  const [salida, setSalida] = useState<ResultadoCargaTickets | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [fallo, setFallo] = useState('');
  const [verAvisos, setVerAvisos] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reiniciar = useCallback(() => {
    setPaso('archivo'); setLibro(null); setHojasElegidas([]); setAnalistas([]);
    setCiudades([]); setAvance(0); setSalida(null); setFallo(''); setVerAvisos(false);
    setNombreArchivo('');
  }, []);

  const cerrar = () => {
    // Cortar a media escritura deja la carga a ciegas: unos lotes dentro y
    // otros fuera, sin nada en pantalla que diga cuáles.
    if (paso === 'aplicando') return;
    onClose();
    setTimeout(reiniciar, 250);
  };

  // ------------------------------------------------------------- 1. archivo
  const recibirArchivo = async (file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) { toast.error(t('ticketsImport.errFileType')); return; }
    setNombreArchivo(file.name);
    setPaso('leyendo');
    try {
      const buffer = await file.arrayBuffer();
      // El mínimo en pantalla no es adorno: con un archivo pequeño la animación
      // aparecería y desaparecería en el mismo fotograma, y ese parpadeo se lee
      // como un fallo.
      const [r] = await Promise.all([
        Promise.resolve().then(() => analizarLibro(buffer)),
        new Promise((ok) => setTimeout(ok, 900)),
      ]);
      if (!r.hojas.length) {
        setFallo(t('ticketsImport.errNoSheets'));
        setLibro(r);
        setPaso('error');
        return;
      }
      setLibro(r);
      setHojasElegidas(r.hojas.map((h) => h.nombre));
      setPaso('hojas');
    } catch (e) {
      setFallo((e as Error).message);
      setPaso('error');
    }
  };

  // --------------------------------------------------------------- 2. meses
  const hojasSeleccionadas = useMemo(
    () => (libro?.hojas ?? []).filter((h) => hojasElegidas.includes(h.nombre)),
    [libro, hojasElegidas],
  );

  const alternarHoja = (nombre: string) => {
    setHojasElegidas((prev) =>
      prev.includes(nombre) ? prev.filter((h) => h !== nombre) : [...prev, nombre]);
  };

  const irAEnlaces = () => {
    if (!hojasSeleccionadas.length) return;
    const propuestaAnalistas = proponerAnalistas(
      contarPorTexto(hojasSeleccionadas, 'analista_texto'), seleccionables(analistasMesa),
    );
    const propuestaCiudades = proponerCiudades(
      contarPorTexto(hojasSeleccionadas, 'ciudad_texto'), sedes,
    );

    // Sin permiso para enlazar solo sobreviven las coincidencias EXACTAS: son
    // las que nadie tiene que confirmar. Las propuestas por parecido ("Juan
    // Correa" → "Juan Pablo Correa") se descartan, porque aplicarlas sin que
    // nadie las revise es atribuirle a alguien un trabajo por parecido de
    // nombre. Esas filas entran con el texto del archivo y se enlazan después.
    setAnalistas(puedeEnlazar
      ? propuestaAnalistas
      : propuestaAnalistas.map((a) => (a.confianza === 'EXACTA' ? a : { ...a, perfilId: null })));
    setCiudades(puedeEnlazar
      ? propuestaCiudades
      : propuestaCiudades.map((c) => (c.confianza === 'EXACTA' ? c : { ...c, sedeId: null })));

    setPaso(puedeEnlazar ? 'enlaces' : 'revision');
  };

  // ------------------------------------------------------------ 3. enlaces
  const opcionesPerfil = useMemo(() => [
    { value: '', label: t('ticketsImport.noLink'), description: t('ticketsImport.noLinkHint') },
    ...seleccionables(analistasMesa).map((p) => ({ value: p.id, label: p.nombre })),
  ], [analistasMesa, t]);

  const opcionesSede = useMemo(() => [
    { value: '', label: t('ticketsImport.noLink') },
    ...sedes.map((s) => ({
      value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre,
    })),
  ], [sedes, t]);

  const sinEnlazar = analistas.filter((a) => !a.perfilId).reduce((n, a) => n + a.filas, 0);

  // ----------------------------------------------------------- 4. revisión
  const filas = useMemo(
    () => cargables(hojasSeleccionadas.flatMap((h) => h.filas)),
    [hojasSeleccionadas],
  );

  /** Las claves que ya están guardadas: con ellas se separa alta de actualización. */
  const clavesExistentes = useMemo(
    () => new Set(existentes.map(
      (e) => `${e.ticket}|${e.descripcion ?? ''}|${e.fecha_inicio ?? ''}`,
    )),
    [existentes],
  );

  const resumen = useMemo(() => {
    let nuevos = 0;
    let actualizados = 0;
    const avisos: { fila: FilaTicket; tipo: TipoAviso; detalle?: string }[] = [];
    for (const f of filas) {
      const clave = `${f.ticket}|${f.descripcion ?? ''}|${f.fecha_inicio ?? ''}`;
      if (clavesExistentes.has(clave)) actualizados++; else nuevos++;
      for (const a of f.avisos) {
        if (a.gravedad === 'AVISO') avisos.push({ fila: f, tipo: a.tipo, detalle: a.detalle });
      }
    }
    return { nuevos, actualizados, avisos };
  }, [filas, clavesExistentes]);

  const periodos = useMemo(
    () => [...new Set(filas.map((f) => f.periodo).filter(Boolean) as string[])].sort(),
    [filas],
  );

  const aplicar = async () => {
    setPaso('aplicando');
    setAvance(0);
    try {
      const mapaAnalistas = new Map(analistas.map((a) => [normNombre(a.texto), a.perfilId]));
      const mapaCiudades = new Map(ciudades.map((c) => [normNombre(c.texto), c.sedeId]));
      const payload = filas.map((f) => filaParaCarga(f, mapaAnalistas, mapaCiudades));
      const r = await importarTickets(payload, (hechas, total) =>
        setAvance(Math.round((hechas / total) * 100)));
      setSalida(r);
      setPaso('listo');
      onCargado();
    } catch (e) {
      setFallo((e as Error).message);
      setPaso('error');
    }
  };

  // ------------------------------------------------------------------ UI
  const titulos: Record<Paso, { t: string; s: string }> = {
    archivo: { t: t('ticketsImport.title'), s: t('ticketsImport.subtitle') },
    leyendo: { t: t('ticketsImport.reading'), s: nombreArchivo },
    hojas: { t: t('ticketsImport.pickMonths'), s: nombreArchivo },
    enlaces: { t: t('ticketsImport.pickPeople'), s: t('ticketsImport.pickPeopleSub') },
    revision: { t: t('ticketsImport.review'), s: nombreArchivo },
    aplicando: { t: t('ticketsImport.applying'), s: t('ticketsImport.applyingSub') },
    listo: { t: t('ticketsImport.done'), s: nombreArchivo },
    error: { t: t('ticketsImport.errTitle'), s: nombreArchivo },
  };

  return (
    <Modal open={open} onClose={cerrar} size="lg" title={titulos[paso].t} subtitle={titulos[paso].s}>
      {/* Si algo falla al pintar un paso, el fallo se queda dentro de la ventana
          —con su mensaje y un botón para volver— en vez de desmontar la pantalla
          entera. El archivo ya leído sigue en memoria. */}
      <ErrorBoundary onReset={() => setPaso(libro ? 'hojas' : 'archivo')}>
        <AnimatePresence mode="wait">
          {/* ---------------------------------------------------- archivo */}
          {paso === 'archivo' && (
            <motion.div key="archivo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault(); setArrastrando(false);
                  const f = e.dataTransfer.files[0];
                  if (f) recibirArchivo(f);
                }}
                onClick={() => inputRef.current?.click()}
                className={`relative overflow-hidden rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
                  arrastrando
                    ? 'border-brand-500 bg-brand-500/[0.07] scale-[1.01]'
                    : 'border-ink-200 dark:border-white/10 hover:border-brand-400 hover:bg-brand-500/[0.03]'
                }`}
              >
                <motion.div
                  animate={arrastrando ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 18, stiffness: 300 }}
                  className="w-16 h-16 mx-auto rounded-2xl grid place-items-center mb-4"
                  style={{ background: 'linear-gradient(135deg, rgba(16,212,81,0.15), rgba(179,61,158,0.15))' }}
                >
                  <Upload size={26} className="text-brand-600 dark:text-brand-400" />
                </motion.div>
                <p className="font-medium mb-1">
                  {arrastrando ? t('ticketsImport.drop') : t('ticketsImport.dropHint')}
                </p>
                <p className="text-sm text-ink-400">{t('ticketsImport.formats')}</p>
              </div>

              <input
                ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) recibirArchivo(f); e.target.value = ''; }}
              />

              <div className="mt-5 flex items-start gap-3 text-sm text-ink-400 px-1">
                <CalendarDays size={16} className="shrink-0 mt-0.5" />
                <p>{t('ticketsImport.intro')}</p>
              </div>
            </motion.div>
          )}

          {/* ---------------------------------------------------- leyendo */}
          {paso === 'leyendo' && (
            <motion.div
              key="leyendo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-16 grid place-items-center"
            >
              <div className="relative grid place-items-center w-32 h-32 mb-6">
                <motion.div
                  className="absolute w-24 h-24 rounded-full blur-2xl"
                  style={{ background: 'conic-gradient(from 0deg, #10D451, #B33D9E, #10D451)' }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                />
                <FileSpreadsheet size={40} className="relative text-brand-600 dark:text-brand-400" />
              </div>
              <p className="font-medium">{t('ticketsImport.readingHint')}</p>
              <p className="text-sm text-ink-400 mt-1">{nombreArchivo}</p>
            </motion.div>
          )}

          {/* ------------------------------------------------------ meses */}
          {paso === 'hojas' && libro && (
            <motion.div key="hojas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-sm text-ink-400 mb-4">{t('ticketsImport.pickMonthsHint')}</p>

              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {libro.hojas.map((h) => {
                  const marcada = hojasElegidas.includes(h.nombre);
                  return (
                    <button
                      key={h.nombre}
                      onClick={() => alternarHoja(h.nombre)}
                      className={`w-full text-left rounded-xl border p-3.5 transition-colors flex items-start gap-3 ${
                        marcada
                          ? 'border-brand-500/60 bg-brand-500/[0.06]'
                          : 'border-ink-200 dark:border-white/10 hover:border-brand-400/60'
                      }`}
                    >
                      <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md grid place-items-center border ${
                        marcada ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20'
                      }`}
                      >
                        {marcada && <Check size={13} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{h.nombre}</span>
                          {h.periodos.map((p) => (
                            <span key={p} className="text-[11px] px-1.5 py-0.5 rounded-md bg-ink-200/60 dark:bg-white/10 text-ink-500 dark:text-ink-300">
                              {etiquetaPeriodo(p)}
                            </span>
                          ))}
                        </span>
                        <span className="block text-sm text-ink-400 mt-0.5">
                          {t('ticketsImport.sheetRows', { count: h.filas.length })}
                          {h.duplicadas > 0 && ` · ${t('ticketsImport.sheetDupes', { count: h.duplicadas })}`}
                          {h.sinTicket > 0 && ` · ${t('ticketsImport.sheetNoTicket', { count: h.sinTicket })}`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {libro.ignoradas.length > 0 && (
                <div className="mt-4 text-sm text-ink-400 border-t border-ink-200/60 dark:border-white/10 pt-3">
                  <p className="font-medium text-ink-500 dark:text-ink-300 mb-1">
                    {t('ticketsImport.skippedSheets')}
                  </p>
                  <ul className="space-y-0.5">
                    {libro.ignoradas.map((i) => (
                      <li key={i.nombre}>
                        <span className="font-mono text-xs">{i.nombre}</span> — {i.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex justify-between gap-3">
                <Button variant="ghost" onClick={reiniciar}>{t('ticketsImport.otherFile')}</Button>
                <Button variant="primary" onClick={irAEnlaces} disabled={!hojasSeleccionadas.length}>
                  {t('common.continue')}
                </Button>
              </div>
            </motion.div>
          )}

          {/* --------------------------------------------------- enlaces */}
          {paso === 'enlaces' && (
            <motion.div key="enlaces" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="max-h-[52vh] overflow-y-auto pr-1 space-y-6">
                <section>
                  <h4 className="flex items-center gap-2 font-semibold mb-1">
                    <Users size={16} className="text-brand-600 dark:text-brand-400" />
                    {t('ticketsImport.analysts')}
                  </h4>
                  <p className="text-sm text-ink-400 mb-3">{t('ticketsImport.analystsHint')}</p>

                  {/* Sin nadie a quien enlazar, doce desplegables vacíos no
                      explican nada. El motivo casi siempre es el mismo: los
                      analistas de la mesa todavía no tienen usuario. */}
                  {opcionesPerfil.length <= 1 && (
                    <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm">
                      <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-500" />
                      {t('ticketsImport.noCandidates')}
                    </p>
                  )}

                  <div className="space-y-2">
                    {analistas.map((a) => (
                      <div
                        key={a.texto}
                        className="grid gap-2 sm:grid-cols-[1fr_1.2fr] sm:items-center rounded-xl border border-ink-200 dark:border-white/10 p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{a.texto}</div>
                          <div className="text-xs text-ink-400 flex items-center gap-1.5">
                            {t('ticketsImport.rowsCount', { count: a.filas })}
                            {a.confianza === 'PROBABLE' && (
                              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-warning">
                                <UserCheck size={12} /> {t('ticketsImport.guessed')}
                              </span>
                            )}
                            {a.confianza === 'EXACTA' && (
                              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-success">
                                <Check size={12} /> {t('ticketsImport.matched')}
                              </span>
                            )}
                          </div>
                        </div>
                        <Select
                          value={a.perfilId ?? ''}
                          onChange={(v) => setAnalistas((prev) => prev.map(
                            (x) => (x.texto === a.texto ? { ...x, perfilId: v || null } : x),
                          ))}
                          options={opcionesPerfil}
                          placeholder={t('ticketsImport.noLink')}
                        />
                      </div>
                    ))}
                    {!analistas.length && (
                      <p className="text-sm text-ink-400">{t('ticketsImport.noAnalysts')}</p>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="font-semibold mb-1">{t('ticketsImport.cities')}</h4>
                  <p className="text-sm text-ink-400 mb-3">{t('ticketsImport.citiesHint')}</p>
                  <div className="space-y-2">
                    {ciudades.map((c) => (
                      <div
                        key={c.texto}
                        className="grid gap-2 sm:grid-cols-[1fr_1.2fr] sm:items-center rounded-xl border border-ink-200 dark:border-white/10 p-3"
                      >
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.texto}</div>
                          <div className="text-xs text-ink-400">
                            {t('ticketsImport.rowsCount', { count: c.filas })}
                          </div>
                        </div>
                        <Select
                          value={c.sedeId ?? ''}
                          onChange={(v) => setCiudades((prev) => prev.map(
                            (x) => (x.texto === c.texto ? { ...x, sedeId: v || null } : x),
                          ))}
                          options={opcionesSede}
                          placeholder={t('ticketsImport.noLink')}
                        />
                      </div>
                    ))}
                    {!ciudades.length && (
                      <p className="text-sm text-ink-400">{t('ticketsImport.noCities')}</p>
                    )}
                  </div>
                </section>
              </div>

              {sinEnlazar > 0 && (
                <p className="mt-4 flex items-start gap-2 text-sm text-ink-400">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-500" />
                  {t('ticketsImport.unlinkedRows', { count: sinEnlazar })}
                </p>
              )}

              <div className="mt-6 flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setPaso('hojas')}>{t('common.back')}</Button>
                <Button variant="primary" onClick={() => setPaso('revision')}>
                  {t('common.continue')}
                </Button>
              </div>
            </motion.div>
          )}

          {/* -------------------------------------------------- revisión */}
          {paso === 'revision' && (
            <motion.div key="revision" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Recuadro valor={filas.length} etiqueta={t('ticketsImport.kRows')} />
                <Recuadro valor={resumen.nuevos} etiqueta={t('ticketsImport.kNew')} tono="ok" />
                <Recuadro valor={resumen.actualizados} etiqueta={t('ticketsImport.kUpdate')} tono="info" />
                <Recuadro valor={resumen.avisos.length} etiqueta={t('ticketsImport.kWarn')} tono="warn" />
              </div>

              <p className="mt-4 text-sm text-ink-400">
                {t('ticketsImport.months')}{' '}
                <span className="text-ink-600 dark:text-ink-200">
                  {periodos.map(etiquetaPeriodo).join(' · ') || '—'}
                </span>
              </p>

              <p className="mt-2 text-sm text-ink-400">{t('ticketsImport.upsertNote')}</p>

              {resumen.avisos.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3">
                  <button
                    onClick={() => setVerAvisos((v) => !v)}
                    className="w-full flex items-center gap-2 text-left text-sm font-medium"
                  >
                    <AlertTriangle size={15} className="text-amber-500 shrink-0" />
                    {t('ticketsImport.warnCount', { count: resumen.avisos.length })}
                    <span className="ml-auto text-ink-400 text-xs">
                      {verAvisos ? t('common.hide') : t('common.show')}
                    </span>
                  </button>

                  {verAvisos && (
                    <ul className="mt-3 space-y-1.5 max-h-52 overflow-y-auto text-sm">
                      {resumen.avisos.slice(0, 200).map((a, i) => (
                        <li key={`${a.fila.hoja}-${a.fila.fila}-${a.tipo}-${i}`} className="flex gap-2">
                          <span className="text-ink-400 shrink-0 font-mono text-xs mt-0.5">
                            {a.fila.hoja}:{a.fila.fila}
                          </span>
                          <span>
                            <span className="font-medium">{a.fila.ticket}</span>{' '}
                            {t(CLAVE_AVISO[a.tipo])}
                            {a.detalle && <span className="text-ink-400"> ({a.detalle})</span>}
                          </span>
                        </li>
                      ))}
                      {resumen.avisos.length > 200 && (
                        <li className="text-ink-400">
                          {t('ticketsImport.warnMore', { count: resumen.avisos.length - 200 })}
                        </li>
                      )}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-ink-400">{t('ticketsImport.warnNote')}</p>
                </div>
              )}

              <div className="mt-6 flex justify-between gap-3">
                <Button variant="ghost" onClick={() => setPaso(puedeEnlazar ? 'enlaces' : 'hojas')}>
                  {t('common.back')}
                </Button>
                <Button variant="primary" onClick={aplicar} disabled={!filas.length}>
                  {t('ticketsImport.load', { count: filas.length })}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ------------------------------------------------- aplicando */}
          {paso === 'aplicando' && (
            <motion.div
              key="aplicando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-14 grid place-items-center"
            >
              <Loader2 size={34} className="animate-spin text-brand-500 mb-5" />
              <p className="font-medium mb-4">{t('ticketsImport.applyingSub')}</p>
              <div className="w-full max-w-sm h-2 rounded-full bg-ink-200/70 dark:bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-magenta-500"
                  animate={{ width: `${avance}%` }}
                  transition={{ ease: 'easeOut', duration: 0.3 }}
                />
              </div>
              <p className="text-sm text-ink-400 mt-2">{avance}%</p>
            </motion.div>
          )}

          {/* ------------------------------------------------------ listo */}
          {paso === 'listo' && salida && (
            <motion.div
              key="listo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-8 text-center"
            >
              <CheckCircle2 size={44} className="mx-auto text-brand-500 mb-4" />
              <p className="text-lg font-semibold mb-4">{t('ticketsImport.doneTitle')}</p>
              <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                <Recuadro valor={salida.creados} etiqueta={t('ticketsImport.kNew')} tono="ok" />
                <Recuadro valor={salida.actualizados} etiqueta={t('ticketsImport.kUpdate')} tono="info" />
                <Recuadro valor={salida.omitidos ?? 0} etiqueta={t('ticketsImport.kSkipped')} />
              </div>
              <div className="mt-7 flex justify-center gap-3">
                <Button variant="ghost" icon={RefreshCw} onClick={reiniciar}>
                  {t('ticketsImport.another')}
                </Button>
                <Button variant="primary" onClick={cerrar}>{t('common.close')}</Button>
              </div>
            </motion.div>
          )}

          {/* ------------------------------------------------------ error */}
          {paso === 'error' && (
            <motion.div
              key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="py-10 text-center"
            >
              <X size={40} className="mx-auto text-danger mb-4" />
              <p className="font-semibold mb-2">{t('ticketsImport.errTitle')}</p>
              <p className="text-sm text-ink-400 max-w-md mx-auto break-words">{fallo}</p>
              <div className="mt-6 flex justify-center gap-3">
                <Button variant="ghost" onClick={reiniciar}>{t('ticketsImport.otherFile')}</Button>
                <Button variant="secondary" onClick={cerrar}>{t('common.close')}</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </ErrorBoundary>
    </Modal>
  );
}

/** Un número grande con su etiqueta. Es el resumen de la carga, no una tarjeta. */
function Recuadro({ valor, etiqueta, tono }: {
  valor: number; etiqueta: string; tono?: 'ok' | 'info' | 'warn';
}) {
  const color = tono === 'ok' ? 'text-emerald-600 dark:text-success'
    : tono === 'info' ? 'text-magenta-600 dark:text-info'
      : tono === 'warn' ? 'text-amber-600 dark:text-warning'
        : 'text-ink-700 dark:text-ink-100';
  return (
    <div className="rounded-xl border border-ink-200 dark:border-white/10 p-3 text-center">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{valor}</div>
      <div className="text-xs text-ink-400 mt-0.5">{etiqueta}</div>
    </div>
  );
}

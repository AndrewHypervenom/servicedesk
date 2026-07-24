/**
 * Asistente de carga de la base de Talento Humano.
 *
 * Cinco pasos, uno por decisión: elegir el archivo, confirmar el mapeo de
 * columnas, revisar el informe, escribir y ver el resultado. La regla que rige
 * toda la pantalla es que nada se guarda hasta el último clic: el usuario puede
 * volver atrás o cambiar de archivo en cualquier momento sin consecuencias.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, ChevronDown, FileSpreadsheet,
  Loader2, MapPin, Plus, RotateCcw, ScanLine, Upload, UserPlus, Users,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { createSede, importarColaboradores, listPaises, listSedes, type ResultadoCargaBase } from '@/lib/api';
import {
  CAMPOS_BASE, analizarBase, claveCiudad, filasParaCarga, mapeoAutomatico,
  mapeoCompleto, type AnalisisBase, type LibroBase, type MapeoBase,
} from '@/lib/colaboradores/base';
import { leerLibroEnWorker } from '@/lib/colaboradores/leerLibroWorker';
import { colorEstatus, estatusLegible } from '@/lib/colaboradores/estatus';
import { normNombre } from '@/lib/importador/normalizar';
import { useApp } from '@/store/useApp';
import type { Colaborador, Sede } from '@/types';

type Paso = 'archivo' | 'leyendo' | 'mapeo' | 'analizando' | 'revision' | 'aplicando' | 'listo';

const sedeOption = (s: Sede): SelectOption =>
  ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre });

interface Props {
  open: boolean;
  onClose: () => void;
  /** La planta que ya está en la base: distingue altas de actualizaciones. */
  existentes: Colaborador[];
  onCargado: () => void;
}

// ------------------------------------------------------------- auxiliares

/** Cifra grande con su etiqueta, para el resumen del análisis. */
function Cifra({ n, label, tono = 'neutro', delay = 0 }: {
  n: number; label: string; tono?: 'neutro' | 'ok' | 'aviso'; delay?: number;
}) {
  const color = tono === 'ok' ? 'text-brand-600 dark:text-brand-400'
    : tono === 'aviso' ? 'text-amber-600 dark:text-warning'
      : 'text-ink-800 dark:text-ink-100';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', damping: 24, stiffness: 260 }}
      className="rounded-2xl border border-ink-100 dark:border-white/10 px-3 py-3 text-center"
    >
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{n.toLocaleString('es-CO')}</div>
      <div className="text-[11px] text-ink-400 mt-0.5 leading-tight">{label}</div>
    </motion.div>
  );
}

/** Barras horizontales para las distribuciones (estatus, área, ciudad). */
function Distribucion({ datos, max, colorear }: {
  datos: { nombre: string; total: number }[];
  max: number;
  colorear?: (nombre: string) => string;
}) {
  const tope = datos[0]?.total ?? 1;
  return (
    <div className="space-y-1.5">
      {datos.slice(0, max).map((d, i) => (
        <motion.div
          key={d.nombre}
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.04 * i }}
          className="flex items-center gap-2"
        >
          <span className={`shrink-0 badge ${colorear?.(d.nombre) ?? 'bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200'}`}>
            {estatusLegible(d.nombre)}
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-ink-100 dark:bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #10D451, #B33D9E)' }}
              initial={{ width: 0 }}
              animate={{ width: `${(d.total / tope) * 100}%` }}
              transition={{ delay: 0.06 * i, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-ink-400 w-12 text-right">
            {d.total.toLocaleString('es-CO')}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

function Bloque({ titulo, icono: Icono, children, extra }: {
  titulo: string; icono: React.ElementType; children: React.ReactNode; extra?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-ink-100 dark:border-white/10 p-4">
      <header className="flex items-center gap-2 mb-3">
        <Icono size={15} className="text-brand-500" />
        <h4 className="text-sm font-semibold">{titulo}</h4>
        <div className="ml-auto">{extra}</div>
      </header>
      {children}
    </section>
  );
}

// ----------------------------------------------------------------- modal

export function ImportarBaseModal({ open, onClose, existentes, onCargado }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { can } = useApp();
  // Crear sedes desde aquí queda reservado al ADMIN; el resto solo asigna a
  // sedes que ya existen.
  const esAdmin = can('ADMIN');
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const { data: paises = [] } = useQuery({ queryKey: ['paises'], queryFn: listPaises });

  const [paso, setPaso] = useState<Paso>('archivo');
  const [libro, setLibro] = useState<LibroBase | null>(null);
  const [mapeo, setMapeo] = useState<MapeoBase | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisBase | null>(null);
  const [sedePorCiudad, setSedePorCiudad] = useState<Record<string, string>>({});
  const [avance, setAvance] = useState(0);
  const [salida, setSalida] = useState<ResultadoCargaBase | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [verDescartes, setVerDescartes] = useState(false);
  const [verCiudades, setVerCiudades] = useState(false);
  const [paisNuevas, setPaisNuevas] = useState<string | null>(null);
  const [creandoSede, setCreandoSede] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reiniciar = useCallback(() => {
    setPaso('archivo'); setLibro(null); setMapeo(null); setAnalisis(null);
    setSedePorCiudad({}); setAvance(0); setSalida(null);
    setVerDescartes(false); setVerCiudades(false); setCreandoSede(null);
  }, []);

  const cerrar = () => {
    if (paso === 'aplicando') return; // cortar a media escritura deja la carga a ciegas
    onClose();
    setTimeout(reiniciar, 250);
  };

  const [nombreLeyendo, setNombreLeyendo] = useState('');

  const recibirArchivo = async (file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) { toast.error(t('baseImport.errFileType')); return; }
    // Mostrar el indicador ANTES de parsear: `XLSX.read` bloquea el hilo con
    // archivos grandes, así que sin este paso el sitio parece congelado. Se cede
    // un frame para que el spinner alcance a pintarse antes del bloqueo.
    setNombreLeyendo(file.name);
    setPaso('leyendo');
    try {
      // El parseo corre en un Web Worker, así el hilo principal queda libre para
      // animar mientras el archivo se lee. El mínimo en pantalla es para que la
      // animación se vea completa aunque el parseo sea instantáneo.
      const [l] = await Promise.all([
        leerLibroEnWorker(file),
        new Promise((ok) => setTimeout(ok, 1300)),
      ]);
      setLibro(l);
      setMapeo(mapeoAutomatico(l.columnas));
      setPaso('mapeo');
    } catch (e) {
      toast.error(t('baseImport.errRead', { msg: (e as Error).message }));
      setPaso('archivo');
    }
  };

  const analizar = async () => {
    if (!libro || !mapeo) return;
    setPaso('analizando');
    // El análisis de 2.000 filas es casi instantáneo; se le deja un respiro a la
    // animación para que se vea qué se revisó y no parezca que no hizo nada.
    const [r] = await Promise.all([
      Promise.resolve().then(() => analizarBase(libro, mapeo, existentes)),
      new Promise((ok) => setTimeout(ok, 1500)),
    ]);
    setAnalisis(r);

    // Cada ciudad se intenta casar con una sede por nombre ("BOGOTÁ, D.C." →
    // "Bogotá"). Las que no casan quedan pendientes: hay que asignarlas o crearlas.
    const auto: Record<string, string> = {};
    for (const c of r.ciudades) {
      const clave = claveCiudad(c.nombre);
      const s = sedes.find((x) => {
        const n = normNombre(x.nombre);
        return n === clave || clave.startsWith(`${n} `) || clave.startsWith(`${n},`);
      });
      if (s) auto[clave] = s.id;
    }
    setSedePorCiudad(auto);
    // Si quedan ciudades sin sede, se abre la lista para resolverlas de una vez.
    setVerCiudades(r.ciudades.some((c) => !auto[claveCiudad(c.nombre)]));
    setPaso('revision');
  };

  const cubiertas = useMemo(
    () => (analisis?.ciudades ?? []).filter((c) => !!sedePorCiudad[claveCiudad(c.nombre)]).length,
    [analisis, sedePorCiudad],
  );

  // Cargar solo cuando cada ciudad del archivo tiene una sede asignada.
  const todasCubiertas = !!analisis && cubiertas === analisis.ciudades.length;
  const listo = !!analisis && analisis.personas.length > 0 && todasCubiertas;

  const aplicar = async () => {
    if (!analisis || !listo) return;
    setPaso('aplicando');
    setAvance(0);
    try {
      const nombrePorSede = Object.fromEntries(sedes.map((s) => [s.id, s.nombre]));
      const filas = filasParaCarga(analisis.personas, sedePorCiudad, nombrePorSede);
      const r = await importarColaboradores(filas, (hechas, total) => setAvance(hechas / total));
      setSalida(r);
      setPaso('listo');
      onCargado();
    } catch (e) {
      toast.error(t('baseImport.errLoad', { msg: (e as Error).message }));
      setPaso('revision');
    }
  };

  // País por defecto para las sedes nuevas: si solo hay uno, se elige solo.
  const paisElegido = paisNuevas ?? (paises.length === 1 ? paises[0].id : null);

  /** Crea una sede con el nombre de la ciudad y la deja asignada a esa ciudad. */
  const crearSedeDeCiudad = async (ciudad: string) => {
    if (!esAdmin) return;
    if (!paisElegido) { toast.error(t('baseImport.chooseCountryFirst')); return; }
    setCreandoSede(claveCiudad(ciudad));
    try {
      const nueva = await createSede(ciudad.trim(), paisElegido);
      await qc.invalidateQueries({ queryKey: ['sedes'] });
      setSedePorCiudad((prev) => ({ ...prev, [claveCiudad(ciudad)]: nueva.id }));
      toast.success(t('baseImport.sedeCreated', { nombre: nueva.nombre }));
    } catch (e) {
      toast.error(t('baseImport.errCreateSede', { msg: (e as Error).message }));
    } finally {
      setCreandoSede(null);
    }
  };

  const titulos: Record<Paso, { t: string; s: string }> = {
    archivo: { t: t('baseImport.titleFile'), s: t('baseImport.subFile') },
    leyendo: { t: t('baseImport.titleReading'), s: nombreLeyendo },
    mapeo: { t: t('baseImport.titleMapping'), s: libro ? `${libro.nombreArchivo} · ${libro.hoja}` : '' },
    analizando: { t: t('baseImport.titleAnalyzing'), s: t('baseImport.subAnalyzing') },
    revision: { t: t('baseImport.titleReview'), s: analisis?.archivo ?? '' },
    aplicando: { t: t('baseImport.titleApplying'), s: t('baseImport.subApplying') },
    listo: { t: t('baseImport.titleDone'), s: '' },
  };

  const opcionesColumna = (libro?.columnas ?? []).map((c) => ({ value: c, label: c }));

  return (
    <Modal open={open} onClose={cerrar} size="lg" title={titulos[paso].t} subtitle={titulos[paso].s}>
      <AnimatePresence mode="wait">
        {/* ------------------------------------------------------ archivo */}
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
                {arrastrando ? t('baseImport.drop') : t('baseImport.dropHint')}
              </p>
              <p className="text-sm text-ink-400">{t('baseImport.formats')}</p>

              {arrastrando && (
                <motion.div
                  className="absolute inset-x-0 h-px bg-brand-500 shadow-[0_0_12px_2px_rgba(16,212,81,0.7)]"
                  initial={{ top: 0 }} animate={{ top: '100%' }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>

            <input
              ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) recibirArchivo(f); e.target.value = ''; }}
            />

            <div className="mt-5 flex items-start gap-3 text-sm text-ink-400 px-1">
              <FileSpreadsheet size={16} className="shrink-0 mt-0.5" />
              <p>
                <Trans
                  i18nKey="baseImport.intro"
                  components={[<strong className="text-ink-600 dark:text-ink-200" />]}
                />
              </p>
            </div>
          </motion.div>
        )}

        {/* ------------------------------------------------------- leyendo */}
        {paso === 'leyendo' && (
          <motion.div
            key="leyendo"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="py-12 grid place-items-center"
          >
            {/* Escenario central: aura + documento que se materializa. */}
            <div className="relative grid place-items-center w-44 h-44 mb-7">
              {/* Aura cónica giratoria, difuminada, con respiración. */}
              <motion.div
                className="absolute w-36 h-36 rounded-full blur-2xl"
                style={{ background: 'conic-gradient(from 0deg, #10D451, #B33D9E, #10D451)' }}
                animate={{ rotate: 360, opacity: [0.18, 0.34, 0.18], scale: [0.95, 1.05, 0.95] }}
                transition={{
                  rotate: { duration: 7, repeat: Infinity, ease: 'linear' },
                  opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                  scale: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
                }}
              />

              {/* Anillos concéntricos que emanan del documento. */}
              {[0, 1].map((k) => (
                <motion.span
                  key={k}
                  className="absolute rounded-[26px] border border-brand-500/40"
                  style={{ width: 104, height: 120 }}
                  animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: k * 1.2 }}
                />
              ))}

              {/* Partículas en órbita (verde/magenta) alrededor del documento. */}
              {[0, 1, 2].map((k) => (
                <motion.div
                  key={k}
                  className="absolute w-[104px] h-[104px]"
                  animate={{ rotate: [k * 120, k * 120 + 360] }}
                  transition={{ duration: 4 + k, repeat: Infinity, ease: 'linear' }}
                >
                  <span
                    className="absolute left-1/2 -top-0.5 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                    style={{
                      background: k % 2 ? '#B33D9E' : '#10D451',
                      boxShadow: `0 0 10px 1px ${k % 2 ? '#B33D9E' : '#10D451'}`,
                    }}
                  />
                </motion.div>
              ))}

              {/* El documento: aparece con un resorte, flota y se inclina en 3D. */}
              <motion.div
                className="relative"
                style={{ perspective: 600 }}
                initial={{ scale: 0.4, opacity: 0, rotateX: -24 }}
                animate={{
                  scale: 1, opacity: 1, rotateX: [4, -4, 4], y: [0, -5, 0],
                }}
                transition={{
                  scale: { type: 'spring', damping: 12, stiffness: 200 },
                  opacity: { duration: 0.4 },
                  rotateX: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
                  y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
                }}
              >
                <div
                  className="relative w-[94px] h-[110px] rounded-[18px] p-[3px] overflow-hidden"
                  style={{
                    background: 'linear-gradient(140deg, #2CF06E 0%, #10D451 40%, #B33D9E 100%)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.16), 0 18px 44px -14px rgba(16,212,81,0.6), 0 6px 22px -10px rgba(179,61,158,0.55)',
                  }}
                >
                  <div className="relative w-full h-full rounded-[15px] bg-white dark:bg-ink-800 overflow-hidden p-2 ring-1 ring-black/5 dark:ring-white/10">
                    {/* Cabecera del documento. */}
                    <div className="flex items-center gap-1 mb-1.5">
                      <FileSpreadsheet size={11} className="text-brand-500" />
                      <div className="h-1 flex-1 rounded-full bg-ink-200 dark:bg-white/15" />
                    </div>

                    {/* Rejilla de celdas que se encienden en oleada diagonal. */}
                    <div className="grid grid-cols-4 gap-1">
                      {Array.from({ length: 20 }).map((_, i) => {
                        const col = i % 4; const row = Math.floor(i / 4);
                        return (
                          <motion.span
                            key={i}
                            className="h-2.5 rounded-[3px]"
                            style={{ background: 'linear-gradient(135deg, #10D451, #B33D9E)' }}
                            animate={{ opacity: [0.25, 1, 0.25] }}
                            transition={{
                              duration: 1.6, repeat: Infinity, ease: 'easeInOut',
                              delay: (col + row) * 0.13,
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Línea láser de escaneo que barre el documento. */}
                    <motion.div
                      className="absolute inset-x-1 h-6 pointer-events-none"
                      style={{
                        background: 'linear-gradient(180deg, transparent, rgba(16,212,81,0.35), transparent)',
                      }}
                      animate={{ top: ['-10%', '100%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <motion.div
                      className="absolute inset-x-0 h-px"
                      style={{ background: '#10D451', boxShadow: '0 0 10px 2px rgba(16,212,81,0.8)' }}
                      animate={{ top: ['0%', '100%'] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Título con shimmer degradado. */}
            <motion.p
              className="text-center font-semibold text-lg bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(90deg, #10D451, #B33D9E, #10D451)',
                backgroundSize: '200% 100%',
              }}
              animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            >
              {t('baseImport.titleReading')}
            </motion.p>

            <p className="text-center text-sm text-ink-400 max-w-xs mx-auto mt-1.5">
              {t('baseImport.readingHint')}
            </p>

            <motion.div
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="flex items-center gap-2 mt-5 text-sm text-ink-500 dark:text-ink-300 max-w-full"
            >
              <Loader2 size={14} className="animate-spin text-brand-500 shrink-0" />
              <span className="truncate">{nombreLeyendo}</span>
            </motion.div>
          </motion.div>
        )}

        {/* -------------------------------------------------------- mapeo */}
        {paso === 'mapeo' && libro && mapeo && (
          <motion.div key="mapeo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-ink-400">
              <span className="badge bg-brand-500/10 text-brand-600 dark:text-brand-400">
                {libro.filas.length.toLocaleString('es-CO')} {t('baseImport.rows')}
              </span>
              <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200">
                {libro.columnas.length} {t('baseImport.columns')}
              </span>
              <span>{t('baseImport.headersRow', { row: libro.filaEncabezado })}</span>
            </div>

            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3 max-h-[46vh] overflow-y-auto pr-1">
              {CAMPOS_BASE.map((campo, i) => (
                <motion.div
                  key={campo.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <label className={`label${campo.obligatorio ? ' req' : ''}`}>{t(campo.etiqueta)}</label>
                  <Select
                    value={mapeo[campo.id] ?? ''}
                    onChange={(v) => setMapeo({ ...mapeo, [campo.id]: v || null })}
                    placeholder={t('baseImport.noImport')}
                    options={[{ value: '', label: t('baseImport.noImport') }, ...opcionesColumna]}
                  />
                  <p className="text-[11px] text-ink-400 mt-1 leading-snug">{t(campo.ayuda)}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-6 pt-5 border-t border-ink-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">
                {mapeoCompleto(mapeo)
                  ? t('baseImport.mappingReady')
                  : t('baseImport.mappingIncomplete')}
              </p>
              <div className="flex gap-2">
                <button onClick={reiniciar} className="btn-secondary"><RotateCcw size={15} /> {t('baseImport.otherFile')}</button>
                <button onClick={analizar} disabled={!mapeoCompleto(mapeo)} className="btn-primary shine">
                  {t('baseImport.review')} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* --------------------------------------------------- analizando */}
        {paso === 'analizando' && (
          <motion.div key="analizando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-14">
            <div className="relative w-20 h-20 mx-auto mb-6">
              <motion.span
                className="absolute inset-0 rounded-3xl border-2 border-brand-500/30"
                animate={{ scale: [1, 1.25, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
              />
              <div className="absolute inset-0 rounded-3xl grid place-items-center bg-brand-500/10">
                <ScanLine size={28} className="text-brand-500" />
              </div>
            </div>
            <div className="max-w-xs mx-auto space-y-2">
              {[t('baseImport.analyzing1'), t('baseImport.analyzing2'), t('baseImport.analyzing3')].map((linea, i) => (
                <motion.div
                  key={linea}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 * i }}
                  className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-300"
                >
                  <Loader2 size={13} className="animate-spin text-brand-500" /> {linea}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ----------------------------------------------------- revisión */}
        {paso === 'revision' && analisis && (
          <motion.div key="revision" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Cifra n={analisis.nuevas} label={t('baseImport.kpiNew')} tono="ok" delay={0.05} />
              <Cifra n={analisis.existentes} label={t('baseImport.kpiUpdate')} delay={0.1} />
              <Cifra n={analisis.activos} label={t('baseImport.kpiActive')} tono="ok" delay={0.15} />
              <Cifra n={analisis.inactivos} label={t('baseImport.kpiInactive')} tono="aviso" delay={0.2} />
            </div>

            {/* ------------------------------------------------ sede */}
            <Bloque
              titulo={t('baseImport.sedeTitle')}
              icono={Building2}
              extra={
                <span className={`text-xs font-medium ${todasCubiertas ? 'text-brand-600 dark:text-brand-400' : 'text-amber-600 dark:text-warning'}`}>
                  {t('baseImport.citiesCovered', { cubiertas, total: analisis.ciudades.length })}
                </span>
              }
            >
              <p className="text-xs text-ink-400 mb-3 leading-relaxed">
                <Trans
                  i18nKey="baseImport.sedeHelp"
                  components={[<strong className="text-ink-600 dark:text-ink-200" />]}
                />
              </p>

              {analisis.ciudades.length > 0 && (
                <>
                  {!todasCubiertas && (
                    <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-warning">
                      <AlertTriangle size={13} className="shrink-0" />
                      <span>
                        <Trans
                          i18nKey="baseImport.missingCities"
                          count={analisis.ciudades.length - cubiertas}
                          components={[<strong />]}
                        />
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => setVerCiudades((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400"
                  >
                    <ChevronDown size={13} className={`transition-transform ${verCiudades ? 'rotate-180' : ''}`} />
                    {verCiudades ? t('baseImport.hide') : t('baseImport.adjust')} {t('baseImport.citiesOfFile', { count: analisis.ciudades.length })}
                  </button>

                  <AnimatePresence initial={false}>
                    {verCiudades && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        {/* Registrar sedes nuevas a partir de las ciudades sin sede (solo ADMIN). */}
                        {esAdmin && cubiertas < analisis.ciudades.length && (
                          <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl bg-ink-50 dark:bg-white/5 p-3">
                            <div className="flex-1 min-w-[9rem]">
                              <label className="label !mb-1 text-[11px] flex items-center gap-1">
                                <MapPin size={11} /> {t('baseImport.newSedeCountry')}
                              </label>
                              <Select
                                className="!py-1.5 !text-xs"
                                value={paisElegido ?? ''}
                                onChange={(v) => setPaisNuevas(v || null)}
                                placeholder={t('baseImport.chooseCountry')}
                                options={paises.map((p) => ({ value: p.id, label: p.nombre }))}
                              />
                            </div>
                            <p className="flex-1 min-w-[12rem] text-[11px] text-ink-400 leading-snug">
                              {t('baseImport.newSedeHelpBefore')}{' '}
                              <Plus size={11} className="inline align-[-1px]" /> {t('baseImport.newSedeHelpAfter')}
                            </p>
                          </div>
                        )}

                        <div className="mt-3 grid sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                          {analisis.ciudades.map((c) => {
                            const clave = claveCiudad(c.nombre);
                            const asignada = !!sedePorCiudad[clave];
                            return (
                              <div key={c.nombre} className="flex items-center gap-2">
                                <span className="w-2/5 min-w-0 truncate text-xs flex items-center gap-1" title={c.nombre}>
                                  {!asignada && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                                  <span className="truncate">{c.nombre} <span className="text-ink-400">({c.total})</span></span>
                                </span>
                                <Select
                                  className="!py-1.5 !text-xs flex-1"
                                  value={sedePorCiudad[clave] ?? ''}
                                  onChange={(v) => setSedePorCiudad((prev) => {
                                    const next = { ...prev };
                                    if (v) next[clave] = v;
                                    else delete next[clave];
                                    return next;
                                  })}
                                  placeholder={t('baseImport.chooseSede')}
                                  options={sedes.map(sedeOption)}
                                />
                                {esAdmin && !asignada && (
                                  <button
                                    onClick={() => crearSedeDeCiudad(c.nombre)}
                                    disabled={creandoSede !== null}
                                    title={t('baseImport.registerAsSede', { ciudad: c.nombre })}
                                    className="btn-secondary shrink-0 !px-2 !py-1.5"
                                  >
                                    {creandoSede === clave
                                      ? <Loader2 size={13} className="animate-spin" />
                                      : <Plus size={13} />}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </Bloque>

            {/* --------------------------------------------- distribución */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Bloque titulo={t('baseImport.statusInFile')} icono={Users}>
                <Distribucion datos={analisis.estatus} max={6} colorear={colorEstatus} />
              </Bloque>
              <Bloque titulo={t('baseImport.areas')} icono={Building2}>
                <Distribucion datos={analisis.areas} max={6} />
              </Bloque>
            </div>

            {/* ------------------------------------------------- descartes */}
            {(analisis.descartadas.length > 0 || analisis.repetidas.length > 0
              || analisis.fechasIlegibles > 0 || analisis.sinCorreo > 0) && (
              <Bloque titulo={t('baseImport.discardTitle')} icono={AlertTriangle}>
                <ul className="text-xs text-ink-500 dark:text-ink-300 space-y-1.5">
                  {analisis.descartadas.length > 0 && (
                    <li>
                      <Trans i18nKey="baseImport.discarded" count={analisis.descartadas.length}
                        components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                    </li>
                  )}
                  {analisis.repetidas.length > 0 && (
                    <li>
                      <Trans i18nKey="baseImport.repeated" count={analisis.repetidas.length}
                        components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                    </li>
                  )}
                  {analisis.fechasIlegibles > 0 && (
                    <li>
                      <Trans i18nKey="baseImport.badDates" count={analisis.fechasIlegibles}
                        components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                    </li>
                  )}
                  {analisis.sinCorreo > 0 && (
                    <li>
                      <Trans i18nKey="baseImport.noEmail" count={analisis.sinCorreo}
                        components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                    </li>
                  )}
                </ul>

                {analisis.descartadas.length > 0 && (
                  <>
                    <button
                      onClick={() => setVerDescartes((v) => !v)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400"
                    >
                      <ChevronDown size={13} className={`transition-transform ${verDescartes ? 'rotate-180' : ''}`} />
                      {verDescartes ? t('baseImport.hide') : t('common.view')} {t('baseImport.discardedRows')}
                    </button>
                    <AnimatePresence initial={false}>
                      {verDescartes && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-2 max-h-44 overflow-y-auto text-xs divide-y divide-ink-100 dark:divide-white/5"
                        >
                          {analisis.descartadas.slice(0, 200).map((d) => (
                            <li key={`${d.fila}-${d.detalle}`} className="py-1.5 flex gap-2">
                              <span className="text-ink-400 tabular-nums shrink-0">{t('baseImport.row')} {d.fila}</span>
                              <span className="truncate">{d.detalle}</span>
                              <span className="ml-auto text-amber-600 dark:text-warning shrink-0">{t(d.motivo)}</span>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </Bloque>
            )}

            <div className="pt-4 border-t border-ink-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">
                {listo ? (
                  <Trans
                    i18nKey="baseImport.willLoad"
                    values={{
                      count: analisis.personas.length.toLocaleString('es-CO'),
                      total: analisis.filasLeidas.toLocaleString('es-CO'),
                    }}
                    components={[<strong className="text-ink-600 dark:text-ink-200" />]}
                  />
                ) : analisis.personas.length === 0
                  ? t('baseImport.noUsableRows')
                  : t('baseImport.assignPending', { count: analisis.ciudades.length - cubiertas })}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPaso('mapeo')} className="btn-secondary">{t('baseImport.adjustMapping')}</button>
                <button onClick={aplicar} disabled={!listo} className="btn-primary shine">
                  {t('baseImport.loadBase')} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ---------------------------------------------------- aplicando */}
        {paso === 'aplicando' && (
          <motion.div key="aplicando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12">
            <div className="w-14 h-14 mx-auto mb-6 rounded-2xl grid place-items-center bg-brand-500/10">
              <Loader2 size={24} className="text-brand-500 animate-spin" />
            </div>
            <p className="text-center font-medium mb-1">{t('baseImport.writing')}</p>
            <p className="text-center text-sm text-ink-400 mb-6">
              {t('baseImport.writingHint')}
            </p>
            <div className="max-w-sm mx-auto h-1.5 rounded-full bg-ink-100 dark:bg-white/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #10D451, #B33D9E)' }}
                animate={{ width: `${Math.max(avance * 100, 4)}%` }}
                transition={{ type: 'spring', damping: 26, stiffness: 180 }}
              />
            </div>
            <p className="text-center text-xs text-ink-400 mt-2 tabular-nums">{Math.round(avance * 100)}%</p>
          </motion.div>
        )}

        {/* -------------------------------------------------------- listo */}
        {paso === 'listo' && salida && (
          <motion.div key="listo" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 220, delay: 0.1 }}
              className="w-16 h-16 mx-auto mb-5 rounded-full grid place-items-center bg-brand-500/12"
            >
              <CheckCircle2 size={30} className="text-brand-500" />
            </motion.div>

            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto mb-6">
              <Cifra n={salida.creados} label={t('baseImport.createdLabel')} tono="ok" delay={0.2} />
              <Cifra n={salida.actualizados} label={t('baseImport.updatedLabel')} delay={0.28} />
            </div>

            <p className="text-center text-sm text-ink-400 mb-5">
              <UserPlus size={14} className="inline mb-0.5 mr-1" />
              {t('baseImport.doneHint')}
            </p>

            <div className="flex justify-center gap-2">
              <button onClick={reiniciar} className="btn-secondary"><RotateCcw size={15} /> {t('baseImport.loadAnother')}</button>
              <button onClick={cerrar} className="btn-primary">{t('baseImport.viewCollaborators')}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

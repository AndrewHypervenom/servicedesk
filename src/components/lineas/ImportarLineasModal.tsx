/**
 * Asistente de carga del libro de líneas móviles.
 *
 * Siete pasos, uno por decisión, y nada se escribe hasta el último clic. La
 * diferencia con la carga de la planta —y la razón de que este asistente sea
 * más largo— es que aquí no se carga una tabla, se carga un LIBRO: cinco hojas
 * con columnas distintas, que hablan de las mismas líneas desde sitios
 * distintos. Por eso hay un paso para elegir hojas y el mapeo se hace por hoja.
 *
 * Lo que el asistente resuelve por su cuenta, y enseña antes de guardar:
 *   · qué hojas parecen tablas de líneas y cuáles están vacías;
 *   · qué columna es qué, en cada hoja por separado;
 *   · qué aporta cada hoja que las demás no (el IMEI, la cédula…);
 *   · qué líneas aparecen en varias hojas y cómo se fusionan;
 *   · qué ICCID llegaron rotos de Excel y qué "ICCID" eran en realidad IMEI.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, Building2, CheckCircle2, ChevronDown, FileSpreadsheet,
  Layers, Loader2, MapPin, RotateCcw, ScanLine, Signal, Sparkles, Upload, UserCheck,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Select, type SelectOption } from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import {
  importarLineas, listColaboradores, listSedes, type ResultadoCargaLineas,
} from '@/lib/api';
import {
  CAMPOS_LINEA, MAPEO_VACIO, analizarLibro, estadoSugeridoDeHoja, filasParaCarga,
  hojaImportable, hojasSugeridas, mapeosAutomaticos,
  type AnalisisLineas, type CampoLinea, type LibroLineas, type MapeoLinea,
} from '@/lib/lineas/base';
import { leerArchivoEnWorker } from '@/lib/lineas/leerArchivoWorker';
import { COLOR_CATEGORIA, categoriaEstado } from '@/lib/lineas/estado';
import { descargarPlantillaLineas } from '@/lib/lineas/exportar';
import { normNombre } from '@/lib/importador/normalizar';
import type { LineaMovil, Sede } from '@/types';

type Paso = 'archivo' | 'leyendo' | 'hojas' | 'mapeo' | 'analizando' | 'revision' | 'aplicando' | 'listo' | 'error';

const sedeOption = (s: Sede): SelectOption =>
  ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre });

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lo que ya está en la base: distingue altas de actualizaciones. */
  existentes: LineaMovil[];
  onCargado: () => void;
}

// ------------------------------------------------------------- auxiliares

function Cifra({ n, label, tono = 'neutro', delay = 0 }: {
  n: number; label: string; tono?: 'neutro' | 'ok' | 'aviso' | 'malo'; delay?: number;
}) {
  const color = tono === 'ok' ? 'text-brand-600 dark:text-brand-400'
    : tono === 'aviso' ? 'text-amber-600 dark:text-warning'
      : tono === 'malo' ? 'text-red-600 dark:text-danger'
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
          <span
            title={d.nombre}
            className={`shrink-0 max-w-[9rem] truncate badge ${
              colorear?.(d.nombre) ?? 'bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200'}`}
          >
            {d.nombre}
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

export function ImportarLineasModal({ open, onClose, existentes, onCargado }: Props) {
  const { t } = useTranslation();
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  // La planta se usa para cruzar titulares; si falla, la carga sigue y el
  // titular se queda como el texto del archivo, que es lo que había antes.
  // La planta se necesita ANTES de analizar: es con lo que se cruzan los
  // titulares. Analizar mientras carga daba "0 de N cruzadas" sin explicar por
  // qué, así que el botón de revisar espera a que esté.
  const {
    data: colabs = [], isLoading: cargandoPlanta, error: errorPlanta,
  } = useQuery({ queryKey: ['colabs'], queryFn: listColaboradores });

  const [paso, setPaso] = useState<Paso>('archivo');
  const [libro, setLibro] = useState<LibroLineas | null>(null);
  const [mapeos, setMapeos] = useState<Record<string, MapeoLinea>>({});
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [estadoPorHoja, setEstadoPorHoja] = useState<Record<string, string | null>>({});
  const [hojaActiva, setHojaActiva] = useState<string>('');
  const [analisis, setAnalisis] = useState<AnalisisLineas | null>(null);
  const [sedePorCiudad, setSedePorCiudad] = useState<Record<string, string>>({});
  const [sedePorDefecto, setSedePorDefecto] = useState('');
  const [cruzar, setCruzar] = useState(true);
  const [avance, setAvance] = useState(0);
  const [salida, setSalida] = useState<ResultadoCargaLineas | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [verDescartes, setVerDescartes] = useState(false);
  const [nombreLeyendo, setNombreLeyendo] = useState('');
  /** Mensaje del fallo que llevó al paso 'error'. */
  const [fallo, setFallo] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reiniciar = useCallback(() => {
    setPaso('archivo'); setLibro(null); setMapeos({}); setSeleccion([]);
    setEstadoPorHoja({}); setHojaActiva(''); setAnalisis(null);
    setSedePorCiudad({}); setSedePorDefecto(''); setCruzar(true);
    setAvance(0); setSalida(null); setVerDescartes(false); setFallo('');
  }, []);

  const cerrar = () => {
    if (paso === 'aplicando') return; // cortar a media escritura deja la carga a ciegas
    onClose();
    setTimeout(reiniciar, 250);
  };

  const recibirArchivo = async (file: File) => {
    if (!/\.(csv|txt|xlsx?)$/i.test(file.name)) { toast.error(t('linesImport.errFileType')); return; }
    setNombreLeyendo(file.name);
    setPaso('leyendo');
    try {
      // El mínimo en pantalla no es adorno: con un archivo pequeño la animación
      // aparecería y desaparecería en el mismo fotograma, y ese parpadeo se lee
      // como un fallo.
      const [l] = await Promise.all([
        leerArchivoEnWorker(file),
        new Promise((ok) => setTimeout(ok, 1200)),
      ]);
      const auto = mapeosAutomaticos(l);
      const sugeridas = hojasSugeridas(l, auto);
      setLibro(l);
      setMapeos(auto);
      setSeleccion(sugeridas);
      setEstadoPorHoja(Object.fromEntries(
        l.hojas.map((h) => [h.nombre, estadoSugeridoDeHoja(h.nombre)]),
      ));
      setHojaActiva(sugeridas[0] ?? '');
      // Con una sola hoja utilizable no hay nada que elegir: el paso de hojas
      // sería una pantalla con una casilla ya marcada. Se salta.
      const utilizables = l.hojas.filter((h) => !h.problema && h.filas.length > 0);
      setPaso(utilizables.length > 1 ? 'hojas' : 'mapeo');
    } catch (e) {
      toast.error(t('linesImport.errRead', { msg: (e as Error).message }));
      setPaso('archivo');
    }
  };

  const alternarHoja = (nombre: string) => {
    setSeleccion((prev) => {
      const next = prev.includes(nombre) ? prev.filter((h) => h !== nombre) : [...prev, nombre];
      if (!next.includes(hojaActiva)) setHojaActiva(next[0] ?? '');
      return next;
    });
  };

  const analizar = async () => {
    if (!libro || !seleccion.length) return;
    setPaso('analizando');
    // Con try/catch y paso de error propio: sin esto, un fallo dentro del
    // análisis dejaba la ventana girando para siempre (o peor, tumbaba la
    // pantalla) y había que recargar y repetir todo el proceso. El archivo y el
    // mapeo se conservan, así que reintentar cuesta un clic.
    try {
      const [r] = await Promise.all([
        Promise.resolve().then(() => analizarLibro(
          libro, { hojas: seleccion, mapeos, estadoPorHoja }, existentes, colabs,
        )),
        new Promise((ok) => setTimeout(ok, 1400)),
      ]);
      setAnalisis(r);

      // Cada ciudad de stock se intenta casar con una sede por nombre; lo que no
      // casa queda vacío y se resuelve a mano en la revisión.
      const auto: Record<string, string> = {};
      for (const c of r.ciudadesStock) {
        const clave = normNombre(c.nombre);
        const s = sedes.find((x) => {
          const n = normNombre(x.nombre);
          return n === clave || clave.startsWith(`${n} `) || n.startsWith(clave);
        });
        if (s) auto[c.nombre] = s.id;
      }
      setSedePorCiudad(auto);
      setPaso('revision');
    } catch (e) {
      console.error('[ImportarLineas] falló el análisis', e);
      setFallo((e as Error).message || String(e));
      setPaso('error');
    }
  };

  const aplicar = async () => {
    if (!analisis || !analisis.lineas.length) return;
    setPaso('aplicando');
    setAvance(0);
    try {
      const filas = filasParaCarga(analisis.lineas, {
        sedePorCiudad,
        sedePorDefecto: sedePorDefecto || null,
        cruzarConPlanta: cruzar,
      });
      const r = await importarLineas(filas, (hechas, total) => setAvance(hechas / total));
      setSalida(r);
      setPaso('listo');
      onCargado();
    } catch (e) {
      toast.error(t('linesImport.errLoad', { msg: (e as Error).message }));
      setPaso('revision');
    }
  };

  const mapeoActivo = mapeos[hojaActiva] ?? MAPEO_VACIO;
  const hojaActivaDatos = libro?.hojas.find((h) => h.nombre === hojaActiva);
  const listasParaMapear = useMemo(
    () => seleccion.filter((h) => hojaImportable(mapeos[h] ?? MAPEO_VACIO)),
    [seleccion, mapeos],
  );
  const todasMapeadas = seleccion.length > 0 && listasParaMapear.length === seleccion.length;

  const avisos = useMemo(() => {
    if (!analisis) return 0;
    return (analisis.descartadas.length ? 1 : 0)
      + (analisis.iccidRepetidos.length ? 1 : 0)
      + (analisis.iccidDanados ? 1 : 0)
      + (analisis.iccidIncompletos ? 1 : 0)
      + (analisis.imeisRescatados ? 1 : 0);
  }, [analisis]);

  const titulos: Record<Paso, { t: string; s: string }> = {
    archivo: { t: t('linesImport.titleFile'), s: t('linesImport.subFile') },
    leyendo: { t: t('linesImport.titleReading'), s: nombreLeyendo },
    hojas: { t: t('linesImport.titleSheets'), s: libro?.nombreArchivo ?? '' },
    mapeo: { t: t('linesImport.titleMapping'), s: hojaActiva },
    analizando: { t: t('linesImport.titleAnalyzing'), s: t('linesImport.subAnalyzing') },
    revision: { t: t('linesImport.titleReview'), s: analisis?.archivo ?? '' },
    aplicando: { t: t('linesImport.titleApplying'), s: t('linesImport.subApplying') },
    listo: { t: t('linesImport.titleDone'), s: '' },
    error: { t: t('linesImport.titleError'), s: libro?.nombreArchivo ?? '' },
  };

  const opcionesColumna = (hojaActivaDatos?.columnas ?? []).map((c) => ({ value: c, label: c }));
  const etiquetaCampo = (id: CampoLinea) =>
    t(CAMPOS_LINEA.find((c) => c.id === id)?.etiqueta ?? id);

  return (
    <Modal open={open} onClose={cerrar} size="lg" title={titulos[paso].t} subtitle={titulos[paso].s}>
      {/* Red de seguridad propia: si algo falla al pintar un paso, el fallo se
          queda dentro de la ventana —con su mensaje y un botón para volver— en
          vez de desmontar la pantalla entera y obligar a recargar y empezar de
          cero. El archivo ya leído sigue en memoria. */}
      <ErrorBoundary onReset={() => setPaso(analisis ? 'revision' : 'mapeo')}>
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
                {arrastrando ? t('linesImport.drop') : t('linesImport.dropHint')}
              </p>
              <p className="text-sm text-ink-400">{t('linesImport.formats')}</p>

              {arrastrando && (
                <motion.div
                  className="absolute inset-x-0 h-px bg-brand-500 shadow-[0_0_12px_2px_rgba(16,212,81,0.7)]"
                  initial={{ top: 0 }} animate={{ top: '100%' }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                />
              )}
            </div>

            <input
              ref={inputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) recibirArchivo(f); e.target.value = ''; }}
            />

            <div className="mt-5 flex items-start gap-3 text-sm text-ink-400 px-1">
              <Layers size={16} className="shrink-0 mt-0.5" />
              <p>
                <Trans
                  i18nKey="linesImport.intro"
                  components={[<strong className="text-ink-600 dark:text-ink-200" />]}
                />
              </p>
            </div>

            <div className="mt-4 flex justify-center">
              <button onClick={descargarPlantillaLineas} className="btn-ghost text-sm">
                <FileSpreadsheet size={15} /> {t('linesImport.template')}
              </button>
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
            {/* Una SIM que se lee: aura giratoria, ondas y barrido. */}
            <div className="relative grid place-items-center w-44 h-44 mb-7">
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
              {[0, 1].map((k) => (
                <motion.span
                  key={k}
                  className="absolute rounded-[26px] border border-brand-500/40"
                  style={{ width: 104, height: 116 }}
                  animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: k * 1.2 }}
                />
              ))}
              <motion.div
                className="relative"
                initial={{ scale: 0.4, opacity: 0, rotateX: -24 }}
                animate={{ scale: 1, opacity: 1, rotateX: [4, -4, 4], y: [0, -5, 0] }}
                transition={{
                  scale: { type: 'spring', damping: 12, stiffness: 200 },
                  opacity: { duration: 0.4 },
                  rotateX: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
                  y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
                }}
                style={{ perspective: 600 }}
              >
                <div
                  className="relative w-[92px] h-[108px] rounded-[18px] p-[3px] overflow-hidden"
                  style={{
                    background: 'linear-gradient(140deg, #2CF06E 0%, #10D451 40%, #B33D9E 100%)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.16), 0 18px 44px -14px rgba(16,212,81,0.6), 0 6px 22px -10px rgba(179,61,158,0.55)',
                  }}
                >
                  <div className="relative w-full h-full rounded-[15px] bg-white dark:bg-ink-800 overflow-hidden p-2.5 ring-1 ring-black/5 dark:ring-white/10">
                    <div className="grid grid-cols-3 gap-[3px] w-[46px] mx-auto mt-1">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <motion.span
                          key={i}
                          className="h-3 rounded-[2px]"
                          style={{ background: 'linear-gradient(135deg, #10D451, #B33D9E)' }}
                          animate={{ opacity: [0.25, 1, 0.25] }}
                          transition={{
                            duration: 1.5, repeat: Infinity, ease: 'easeInOut',
                            delay: ((i % 3) + Math.floor(i / 3)) * 0.14,
                          }}
                        />
                      ))}
                    </div>
                    <div className="mt-2.5 space-y-1">
                      {[0.9, 0.7].map((w, i) => (
                        <motion.div
                          key={i}
                          className="h-1 rounded-full bg-ink-200 dark:bg-white/15"
                          style={{ width: `${w * 100}%` }}
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.3 }}
                        />
                      ))}
                    </div>
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

            <motion.p
              className="text-center font-semibold text-lg bg-clip-text text-transparent"
              style={{
                backgroundImage: 'linear-gradient(90deg, #10D451, #B33D9E, #10D451)',
                backgroundSize: '200% 100%',
              }}
              animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            >
              {t('linesImport.titleReading')}
            </motion.p>
            <p className="text-center text-sm text-ink-400 max-w-xs mx-auto mt-1.5">
              {t('linesImport.readingHint')}
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

        {/* --------------------------------------------------------- hojas */}
        {paso === 'hojas' && libro && (
          <motion.div key="hojas" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="text-sm text-ink-400 mb-4 leading-relaxed">
              <Trans
                i18nKey="linesImport.sheetsIntro"
                values={{ count: libro.hojas.length }}
                components={[<strong className="text-ink-600 dark:text-ink-200" />]}
              />
            </p>

            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {libro.hojas.map((h, i) => {
                const mapeo = mapeos[h.nombre] ?? MAPEO_VACIO;
                const identificable = hojaImportable(mapeo);
                const usable = !h.problema && h.filas.length > 0 && identificable;
                const marcada = seleccion.includes(h.nombre);
                const campos = CAMPOS_LINEA.filter((c) => !!mapeo[c.id]);
                return (
                  <motion.label
                    key={h.nombre}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3) }}
                    className={`flex items-start gap-3 rounded-2xl border p-3.5 transition-all ${
                      !usable
                        ? 'border-ink-100 dark:border-white/5 opacity-60'
                        : marcada
                          ? 'border-brand-500/50 bg-brand-500/[0.06] cursor-pointer'
                          : 'border-ink-100 dark:border-white/10 hover:border-brand-400/50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!usable}
                      checked={marcada}
                      onChange={() => alternarHoja(h.nombre)}
                      className="w-4 h-4 mt-0.5 rounded accent-brand-500 shrink-0 disabled:cursor-not-allowed"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{h.nombre}</span>
                        {h.problema === 'vacia' && (
                          <span className="badge bg-ink-100 dark:bg-white/10 text-ink-500">
                            {t('linesImport.sheetEmpty')}
                          </span>
                        )}
                        {h.problema === 'sinEncabezados' && (
                          <span className="badge bg-amber-500/15 text-amber-700 dark:text-warning">
                            {t('linesImport.sheetNoHeaders')}
                          </span>
                        )}
                        {!h.problema && !identificable && (
                          <span className="badge bg-amber-500/15 text-amber-700 dark:text-warning">
                            {t('linesImport.sheetNoId')}
                          </span>
                        )}
                      </div>

                      {!h.problema && (
                        <>
                          <div className="text-xs text-ink-400 mt-0.5">
                            {t('linesImport.sheetCounts', {
                              filas: h.filas.length, columnas: h.columnas.length,
                            })}
                          </div>
                          {campos.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {campos.map((c) => (
                                <span key={c.id} className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200 text-[10px]">
                                  {t(c.etiqueta)}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </motion.label>
                );
              })}
            </div>

            <div className="mt-6 pt-5 border-t border-ink-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">
                {seleccion.length
                  ? t('linesImport.sheetsChosen', { count: seleccion.length })
                  : t('linesImport.sheetsNone')}
              </p>
              <div className="flex gap-2">
                <button onClick={reiniciar} className="btn-secondary">
                  <RotateCcw size={15} /> {t('linesImport.otherFile')}
                </button>
                <button
                  onClick={() => { setHojaActiva(seleccion[0] ?? ''); setPaso('mapeo'); }}
                  disabled={!seleccion.length}
                  className="btn-primary shine"
                >
                  {t('linesImport.checkColumns')} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* -------------------------------------------------------- mapeo */}
        {paso === 'mapeo' && libro && hojaActivaDatos && (
          <motion.div key="mapeo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* Pestañas: una por hoja elegida. El mapeo es de cada hoja, así que
                cambiar de pestaña cambia de tabla, no de sección. */}
            {seleccion.length > 1 && (
              <div className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
                {seleccion.map((h) => {
                  const ok = hojaImportable(mapeos[h] ?? MAPEO_VACIO);
                  return (
                    <button
                      key={h}
                      onClick={() => setHojaActiva(h)}
                      className={`relative shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                        h === hojaActiva
                          ? 'text-brand-600 dark:text-brand-300'
                          : 'text-ink-500 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-white/5'
                      }`}
                    >
                      {h === hojaActiva && (
                        <motion.span
                          layoutId="tab-hoja"
                          className="absolute inset-0 rounded-xl bg-brand-500/15 ring-1 ring-inset ring-brand-500/30"
                          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                        />
                      )}
                      <span className="relative flex items-center gap-1.5">
                        {!ok && <AlertTriangle size={11} className="text-amber-500" />}
                        {h}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-ink-400">
              <span className="badge bg-brand-500/10 text-brand-600 dark:text-brand-400">
                {hojaActivaDatos.filas.length.toLocaleString('es-CO')} {t('linesImport.rows')}
              </span>
              <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200">
                {hojaActivaDatos.columnas.length} {t('linesImport.columns')}
              </span>
              <span>{t('linesImport.headersRow', { row: hojaActivaDatos.filaEncabezado })}</span>
              {libro.crudo && (
                <span className="badge bg-success/15 text-emerald-700 dark:text-success">
                  {t('linesImport.rawOk')}
                </span>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3 max-h-[38vh] overflow-y-auto pr-1">
              {CAMPOS_LINEA.map((campo, i) => (
                <motion.div
                  key={`${hojaActiva}-${campo.id}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <label className="label">{t(campo.etiqueta)}</label>
                  <Select
                    value={mapeoActivo[campo.id] ?? ''}
                    onChange={(v) => setMapeos((prev) => ({
                      ...prev, [hojaActiva]: { ...mapeoActivo, [campo.id]: v || null },
                    }))}
                    placeholder={t('linesImport.noImport')}
                    options={[{ value: '', label: t('linesImport.noImport') }, ...opcionesColumna]}
                  />
                  <p className="text-[11px] text-ink-400 mt-1 leading-snug">{t(campo.ayuda)}</p>
                </motion.div>
              ))}
            </div>

            {/* El nombre de la hoja es un dato: "Lineas que fueron suspendidas"
                dice el estado de todo lo que hay dentro. */}
            <div className="mt-4 rounded-2xl bg-ink-50 dark:bg-white/5 p-3.5">
              <label className="label !mb-1 flex items-center gap-1.5">
                <Sparkles size={12} className="text-brand-500" />
                {t('linesImport.sheetState')}
              </label>
              <input
                className="input uppercase !py-1.5 !text-sm"
                value={estadoPorHoja[hojaActiva] ?? ''}
                onChange={(e) => setEstadoPorHoja((prev) => ({
                  ...prev, [hojaActiva]: e.target.value || null,
                }))}
                placeholder={t('linesImport.sheetStateNone')}
              />
              <p className="text-[11px] text-ink-400 mt-1.5 leading-snug">
                {t('linesImport.sheetStateHelp')}
              </p>
            </div>

            <div className="mt-6 pt-5 border-t border-ink-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="flex-1 text-xs text-ink-400">
                {todasMapeadas
                  ? t('linesImport.mappingReady', { count: seleccion.length })
                  : t('linesImport.mappingIncomplete')}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaso(libro.hojas.filter((h) => !h.problema).length > 1 ? 'hojas' : 'archivo')}
                  className="btn-secondary"
                >
                  {t('common.back')}
                </button>
                <button onClick={analizar} disabled={!todasMapeadas || cargandoPlanta} className="btn-primary shine">
                  {cargandoPlanta
                    ? <><Loader2 size={15} className="animate-spin" /> {t('linesImport.waitingStaff')}</>
                    : <>{t('linesImport.review')} <ArrowRight size={15} /></>}
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
              {[
                t('linesImport.analyzing1'), t('linesImport.analyzing2'),
                t('linesImport.analyzing3'), t('linesImport.analyzing4'),
              ].map((linea, i) => (
                <motion.div
                  key={linea}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 * i }}
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <Cifra n={analisis.nuevas} label={t('linesImport.kpiNew')} tono="ok" delay={0.05} />
              <Cifra n={analisis.existentes} label={t('linesImport.kpiUpdate')} delay={0.1} />
              <Cifra n={analisis.activas} label={t('lines.catActive')} tono="ok" delay={0.15} />
              <Cifra n={analisis.stock} label={t('lines.catStock')} delay={0.2} />
              <Cifra n={analisis.canceladas} label={t('lines.catCancelled')} tono="aviso" delay={0.25} />
            </div>

            {/* --------------------------------------- qué aportó cada hoja */}
            <Bloque
              titulo={t('linesImport.perSheetTitle')}
              icono={Layers}
              extra={<span className="text-xs text-ink-400">{t('linesImport.perSheetTotal', { count: analisis.lineas.length })}</span>}
            >
              <div className="space-y-2">
                {analisis.hojas.map((h, i) => (
                  <motion.div
                    key={h.hoja}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="rounded-xl bg-ink-50 dark:bg-white/5 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{h.hoja}</span>
                      <span className="text-[11px] text-ink-400">
                        {t('linesImport.sheetRows', { count: h.filas })}
                      </span>
                      <span className="ml-auto text-xs tabular-nums">
                        <span className="text-brand-600 dark:text-brand-400 font-semibold">+{h.aporta}</span>
                        {h.completa > 0 && (
                          <span className="text-ink-400"> · {t('linesImport.sheetCompletes', { count: h.completa })}</span>
                        )}
                        {h.descartadas > 0 && (
                          <span className="text-amber-600 dark:text-warning"> · −{h.descartadas}</span>
                        )}
                      </span>
                    </div>
                    {h.camposPropios.length > 0 && (
                      <div className="mt-1.5 text-[11px] text-ink-400">
                        {t('linesImport.onlySheetWith')}{' '}
                        <span className="text-ink-600 dark:text-ink-200 font-medium">
                          {h.camposPropios.map(etiquetaCampo).join(' · ')}
                        </span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
              {analisis.fusionadas > 0 && (
                <p className="mt-3 text-xs text-ink-500 dark:text-ink-300 leading-relaxed">
                  <Trans i18nKey="linesImport.mergedHelp" count={analisis.fusionadas}
                    components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                </p>
              )}
            </Bloque>

            {/* ------------------------------------------------ titulares */}
            <Bloque
              titulo={t('linesImport.ownersTitle')}
              icono={UserCheck}
              extra={
                <span className="text-xs font-medium text-brand-600 dark:text-brand-400">
                  {t('linesImport.matched', { count: analisis.cruzadas, total: analisis.lineas.length })}
                  <span className="text-ink-400 font-normal"> · {t('linesImport.staffSize', { count: colabs.length })}</span>
                </span>
              }
            >
              {/* Un "0 de 300" a secas parece un fallo del cruce cuando lo que
                  falta es la otra mitad del dato. La condición no es que la
                  planta esté vacía —con dos personas y trescientas líneas pasa
                  igual—, sino que no haya casado ni una: eso es lo que hay que
                  explicar, y con la cifra de la planta al lado se entiende solo. */}
              {(errorPlanta || analisis.cruzadas === 0) && (
                <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-warning">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    {errorPlanta
                      ? t('linesImport.staffError', { msg: (errorPlanta as Error).message })
                      : colabs.length === 0
                        ? t('linesImport.staffEmpty')
                        : t('linesImport.staffNoMatch', { count: colabs.length })}
                  </span>
                </div>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox" checked={cruzar} onChange={(e) => setCruzar(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded accent-brand-500 cursor-pointer shrink-0"
                />
                <span className="text-xs text-ink-500 dark:text-ink-300 leading-relaxed">
                  <Trans i18nKey="linesImport.matchHelp" components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                </span>
              </label>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-400">
                {analisis.cruzadasPorCedula > 0 && (
                  <span>{t('linesImport.matchedById', { count: analisis.cruzadasPorCedula })}</span>
                )}
                {analisis.sinTitular > 0 && (
                  <span>{t('linesImport.noOwner', { count: analisis.sinTitular })}</span>
                )}
              </div>
              {/* Las cédulas que el archivo trae pero que ya no están en la
                  planta: son bajas. El dato se guarda igual —es de quién era la
                  línea— aunque no se pueda enlazar con una ficha. */}
              {analisis.cedulasFueraDePlanta > 0 && (
                <p className="mt-2 text-[11px] text-ink-500 dark:text-ink-300 leading-relaxed">
                  <Trans i18nKey="linesImport.idsOutsideStaff" count={analisis.cedulasFueraDePlanta}
                    components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                </p>
              )}
            </Bloque>

            {/* ----------------------------------------------------- sede */}
            <Bloque titulo={t('linesImport.sedeTitle')} icono={Building2}>
              <p className="text-xs text-ink-400 mb-3 leading-relaxed">
                <Trans i18nKey="linesImport.sedeHelp" components={[<strong className="text-ink-600 dark:text-ink-200" />]} />
              </p>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <label className="label !mb-1 text-[11px] flex items-center gap-1">
                    <MapPin size={11} /> {t('linesImport.defaultSede')}
                  </label>
                  <Select
                    className="!py-1.5 !text-xs"
                    value={sedePorDefecto}
                    onChange={setSedePorDefecto}
                    placeholder={t('linesImport.noSede')}
                    options={[{ value: '', label: t('linesImport.noSede') }, ...sedes.map(sedeOption)]}
                  />
                </div>
              </div>

              {analisis.ciudadesStock.length > 0 && (
                <div className="mt-3 grid sm:grid-cols-2 gap-2">
                  {analisis.ciudadesStock.map((c) => (
                    <div key={c.nombre} className="flex items-center gap-2">
                      <span className="w-2/5 min-w-0 truncate text-xs" title={c.nombre}>
                        {c.nombre} <span className="text-ink-400">({c.total})</span>
                      </span>
                      <Select
                        className="!py-1.5 !text-xs flex-1"
                        value={sedePorCiudad[c.nombre] ?? ''}
                        onChange={(v) => setSedePorCiudad((prev) => {
                          const next = { ...prev };
                          if (v) next[c.nombre] = v;
                          else delete next[c.nombre];
                          return next;
                        })}
                        placeholder={t('linesImport.chooseSede')}
                        options={[{ value: '', label: t('linesImport.noSede') }, ...sedes.map(sedeOption)]}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Bloque>

            {/* ---------------------------------------------- distribución */}
            <div className="grid sm:grid-cols-2 gap-4">
              <Bloque titulo={t('linesImport.statesInFile')} icono={Signal}>
                <Distribucion
                  datos={analisis.estados} max={6}
                  colorear={(n) => COLOR_CATEGORIA[categoriaEstado(n)]}
                />
              </Bloque>
              <Bloque titulo={t('linesImport.projects')} icono={Building2}>
                <Distribucion datos={analisis.proyectos} max={6} />
              </Bloque>
            </div>

            {/* ------------------------------------------------ advertencias */}
            {avisos > 0 && (
              <Bloque titulo={t('linesImport.warningsTitle')} icono={AlertTriangle}>
                <ul className="text-xs text-ink-500 dark:text-ink-300 space-y-1.5">
                  {analisis.descartadas.length > 0 && (
                    <li>
                      <Trans i18nKey="linesImport.discarded" count={analisis.descartadas.length}
                        components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                    </li>
                  )}
                  {analisis.imeisRescatados > 0 && (
                    <li>
                      <Trans i18nKey="linesImport.imeiRescued" count={analisis.imeisRescatados}
                        components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                    </li>
                  )}
                  {analisis.iccidRepetidos.length > 0 && (
                    <li>
                      <Trans i18nKey="linesImport.iccidRepeated" count={analisis.iccidRepetidos.length}
                        components={[<strong className="text-ink-700 dark:text-ink-100" />]} />
                    </li>
                  )}
                  {analisis.iccidIncompletos > 0 && (
                    <li className="text-amber-700 dark:text-warning">
                      <Trans i18nKey="linesImport.iccidPartial" count={analisis.iccidIncompletos}
                        components={[<strong />]} />
                    </li>
                  )}
                  {analisis.iccidDanados > 0 && (
                    <li className="text-amber-700 dark:text-warning">
                      <Trans i18nKey="linesImport.iccidBroken" count={analisis.iccidDanados}
                        components={[<strong />]} />
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
                      {verDescartes ? t('linesImport.hide') : t('common.view')} {t('linesImport.discardedRows')}
                    </button>
                    <AnimatePresence initial={false}>
                      {verDescartes && (
                        <motion.ul
                          initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-2 max-h-44 overflow-y-auto text-xs divide-y divide-ink-100 dark:divide-white/5"
                        >
                          {analisis.descartadas.slice(0, 200).map((d) => (
                            <li key={`${d.hoja}-${d.fila}-${d.detalle}`} className="py-1.5 flex gap-2">
                              <span className="text-ink-400 tabular-nums shrink-0 max-w-[10rem] truncate" title={d.hoja}>
                                {d.hoja} · {t('linesImport.row')} {d.fila}
                              </span>
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
                {analisis.lineas.length > 0 ? (
                  <Trans
                    i18nKey="linesImport.willLoad"
                    values={{
                      count: analisis.lineas.length.toLocaleString('es-CO'),
                      total: analisis.filasLeidas.toLocaleString('es-CO'),
                      hojas: analisis.hojas.length,
                    }}
                    components={[<strong className="text-ink-600 dark:text-ink-200" />]}
                  />
                ) : t('linesImport.noUsableRows')}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPaso('mapeo')} className="btn-secondary">{t('linesImport.adjustMapping')}</button>
                <button onClick={aplicar} disabled={!analisis.lineas.length} className="btn-primary shine">
                  {t('linesImport.load')} <ArrowRight size={15} />
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
            <p className="text-center font-medium mb-1">{t('linesImport.writing')}</p>
            <p className="text-center text-sm text-ink-400 mb-6">{t('linesImport.writingHint')}</p>
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
              <Cifra n={salida.creados} label={t('linesImport.createdLabel')} tono="ok" delay={0.2} />
              <Cifra n={salida.actualizados} label={t('linesImport.updatedLabel')} delay={0.28} />
            </div>

            <p className="text-center text-sm text-ink-400 mb-5 max-w-sm mx-auto leading-relaxed">
              {t('linesImport.doneHint')}
            </p>

            <div className="flex justify-center gap-2">
              <button onClick={reiniciar} className="btn-secondary"><RotateCcw size={15} /> {t('linesImport.loadAnother')}</button>
              <button onClick={cerrar} className="btn-primary">{t('linesImport.viewLines')}</button>
            </div>
          </motion.div>
        )}
        {/* --------------------------------------------------------- error */}
        {paso === 'error' && (
          <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="py-6">
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 shrink-0 rounded-2xl bg-danger/10 text-danger grid place-items-center">
                <AlertTriangle size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="font-semibold">{t('linesImport.errorTitle')}</h4>
                <p className="text-sm text-ink-400 mt-1 leading-relaxed">{t('linesImport.errorHint')}</p>
                {fallo && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-ink-50 dark:bg-white/5 p-3 text-xs font-mono text-ink-500 dark:text-ink-300 whitespace-pre-wrap break-words">
                    {fallo}
                  </pre>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={reiniciar} className="btn-secondary">
                <RotateCcw size={15} /> {t('linesImport.otherFile')}
              </button>
              <button onClick={() => setPaso('mapeo')} className="btn-secondary">
                {t('linesImport.adjustMapping')}
              </button>
              <button onClick={analizar} className="btn-primary shine">
                {t('common.retry')} <ArrowRight size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </ErrorBoundary>
    </Modal>
  );
}

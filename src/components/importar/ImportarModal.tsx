import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, RotateCcw, ShieldAlert, Upload,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { listSedes } from '@/lib/api';
import { analizarLibro } from '@/lib/importador/analizar';
import { aplicarImportacion } from '@/lib/importador/aplicar';
import { normCedula } from '@/lib/importador/normalizar';
import type {
  ProgresoAplicacion, Resoluciones, ResultadoAnalisis, ResultadoAplicacion,
} from '@/lib/importador/tipos';
import { AnalisisVisual, duracionAnimacion } from './AnalisisVisual';
import { PanelRevision } from './PanelRevision';

type Paso = 'archivo' | 'analizando' | 'revision' | 'aplicando' | 'listo';

const RES_INICIAL: Resoluciones = { cedulas: {}, conflictos: {}, sedeId: null };

const ETAPA_TEXTO: Record<ProgresoAplicacion['etapa'], string> = {
  preparando: 'Preparando los datos',
  escribiendo: 'Escribiendo en la base',
  catalogos: 'Actualizando el catálogo de marcas',
  listo: 'Terminando',
};

interface Props {
  open: boolean;
  onClose: () => void;
  onImportado: () => void;
}

export function ImportarModal({ open, onClose, onImportado }: Props) {
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });

  const [paso, setPaso] = useState<Paso>('archivo');
  const [analisis, setAnalisis] = useState<ResultadoAnalisis | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [res, setRes] = useState<Resoluciones>(RES_INICIAL);
  const [progreso, setProgreso] = useState<ProgresoAplicacion | null>(null);
  const [salida, setSalida] = useState<ResultadoAplicacion | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reiniciar = useCallback(() => {
    setPaso('archivo');
    setAnalisis(null);
    setNombreArchivo('');
    setRes(RES_INICIAL);
    setProgreso(null);
    setSalida(null);
  }, []);

  const cerrar = () => {
    // Cerrar en mitad de la escritura dejaría la base a medias sin que nadie lo sepa.
    if (paso === 'aplicando') return;
    onClose();
    setTimeout(reiniciar, 250);
  };

  const recibirArchivo = async (file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) {
      toast.error('El archivo debe ser .xlsx o .xls');
      return;
    }
    setNombreArchivo(file.name);
    setPaso('analizando');
    try {
      // El análisis es casi instantáneo; se le da tiempo a la animación para que
      // el usuario alcance a ver qué se revisó.
      const [r] = await Promise.all([
        analizarLibro(file),
        new Promise((ok) => setTimeout(ok, duracionAnimacion())),
      ]);
      setAnalisis(r);
      // Una sola sede disponible: no hay nada que preguntar.
      setRes({ ...RES_INICIAL, sedeId: sedes.length === 1 ? sedes[0].id : null });
      setPaso('revision');
    } catch (e) {
      toast.error(`No se pudo leer el archivo: ${(e as Error).message}`);
      setPaso('archivo');
    }
  };

  const faltanCedulas = !!analisis?.pendientesCedula.some(
    (p) => normCedula(res.cedulas[p.nombre] ?? '') === null,
  );
  const faltanConflictos = !!analisis?.conflictos.some((c) => res.conflictos[c.serial] === undefined);
  const listoParaAplicar = !!analisis && !!res.sedeId && !faltanCedulas && !faltanConflictos;

  /** Lo que realmente se va a escribir, ya descontado todo lo que el análisis descarta. */
  const previo = useMemo(() => {
    if (!analisis) return { equipos: 0, colaboradores: 0, movimientos: 0 };

    const equipos = analisis.equipos.filter((e) => {
      const elegida = res.conflictos[e.serial];
      return elegida === undefined || elegida === e.fila;
    }).length;

    // Una cédula escrita a mano puede coincidir con alguien que ya venía de ENTRADAS.
    const cedulas = new Set(analisis.colaboradores.map((c) => c.cedula));
    for (const p of analisis.pendientesCedula) {
      const c = normCedula(res.cedulas[p.nombre] ?? '');
      if (c) cedulas.add(c);
    }

    // Los movimientos de un serial que no está en BD_EQUIPOS no se pueden colgar
    // de ningún equipo, así que no se importan.
    const conocidos = new Set(analisis.equipos.map((e) => e.serial));
    const movimientos = analisis.movimientos.filter((m) => conocidos.has(m.serial)).length;

    return { equipos, colaboradores: cedulas.size, movimientos };
  }, [analisis, res.conflictos, res.cedulas]);

  const aplicar = async () => {
    if (!analisis || !listoParaAplicar) return;
    setPaso('aplicando');
    try {
      const r = await aplicarImportacion(analisis, res, setProgreso);
      setSalida(r);
      setPaso('listo');
      onImportado();
    } catch (e) {
      toast.error(`Falló la importación: ${(e as Error).message}`);
      setPaso('revision');
    }
  };

  const titulos: Record<Paso, { t: string; s: string }> = {
    archivo: { t: 'Importar desde Excel', s: 'Carga la base de equipos y el sistema la analiza hoja por hoja' },
    analizando: { t: 'Analizando el archivo', s: 'Leyendo cada hoja y cruzando los datos' },
    revision: { t: 'Revisión antes de importar', s: analisis?.archivo ?? '' },
    aplicando: { t: 'Importando', s: 'No cierres esta ventana' },
    listo: { t: 'Importación terminada', s: '' },
  };

  return (
    <Modal open={open} onClose={cerrar} size="lg" title={titulos[paso].t} subtitle={titulos[paso].s}>
      <AnimatePresence mode="wait">
        {/* ------------------------------------------------------- archivo */}
        {paso === 'archivo' && (
          <motion.div key="archivo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastrando(false);
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
                {arrastrando ? 'Suelta el archivo' : 'Arrastra el Excel o haz clic para elegirlo'}
              </p>
              <p className="text-sm text-ink-400">Formatos .xlsx y .xls</p>

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
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) recibirArchivo(f);
                e.target.value = '';
              }}
            />

            <div className="mt-5 flex items-start gap-3 text-sm text-ink-400 px-1">
              <FileSpreadsheet size={16} className="shrink-0 mt-0.5" />
              <p>
                Se leen <strong className="text-ink-600 dark:text-ink-200">BD_EQUIPOS</strong> (inventario),{' '}
                <strong className="text-ink-600 dark:text-ink-200">ENTRADAS</strong> (devoluciones y cédulas) y{' '}
                <strong className="text-ink-600 dark:text-ink-200">SALIDAS</strong> (asignaciones).
                Nada se guarda hasta que revises el resultado.
              </p>
            </div>
          </motion.div>
        )}

        {/* ---------------------------------------------------- analizando */}
        {paso === 'analizando' && (
          <motion.div key="analizando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AnalisisVisual nombreArchivo={nombreArchivo} />
          </motion.div>
        )}

        {/* ------------------------------------------------------ revisión */}
        {paso === 'revision' && analisis && (
          <motion.div key="revision" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <PanelRevision analisis={analisis} sedes={sedes} res={res} onRes={setRes} />

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-6 pt-5 border-t border-ink-100 dark:border-white/5">
              <div className="flex-1 text-xs">
                {listoParaAplicar ? (
                  <span className="text-ink-400">
                    Se importarán {previo.equipos} equipos, {previo.colaboradores} colaboradores y{' '}
                    {previo.movimientos} movimientos.
                  </span>
                ) : (
                  <span className="text-danger flex items-center gap-1.5">
                    <ShieldAlert size={13} />
                    {!res.sedeId
                      ? 'Elige la sede destino.'
                      : faltanCedulas
                        ? 'Completa las cédulas que faltan.'
                        : 'Resuelve los seriales en conflicto.'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={reiniciar} className="btn-secondary">
                  <RotateCcw size={15} /> Otro archivo
                </button>
                <button onClick={aplicar} disabled={!listoParaAplicar} className="btn-primary">
                  Importar <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ----------------------------------------------------- aplicando */}
        {paso === 'aplicando' && (
          <motion.div key="aplicando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12">
            <div className="w-14 h-14 mx-auto mb-6 rounded-2xl grid place-items-center bg-brand-500/10">
              <Loader2 size={24} className="text-brand-500 animate-spin" />
            </div>
            <p className="text-center font-medium mb-1">
              {progreso ? ETAPA_TEXTO[progreso.etapa] : 'Preparando los datos'}
            </p>
            <p className="text-center text-sm text-ink-400 mb-6">
              Se escribe todo de una vez: si algo falla, no queda nada a medias.
            </p>
            {/* La base decide en una sola transacción, así que no hay un porcentaje
                real que mostrar. Barra indeterminada en vez de un avance inventado. */}
            <div className="max-w-sm mx-auto h-1.5 rounded-full bg-ink-100 dark:bg-white/10 overflow-hidden">
              <motion.div
                className="h-full w-1/3 rounded-full"
                style={{ background: 'linear-gradient(90deg, #10D451, #B33D9E)' }}
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        )}

        {/* --------------------------------------------------------- listo */}
        {paso === 'listo' && salida && (
          <motion.div key="listo" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-4">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 220, delay: 0.1 }}
              className="w-16 h-16 mx-auto mb-5 rounded-full grid place-items-center bg-brand-500/12"
            >
              <CheckCircle2 size={30} className="text-brand-500" />
            </motion.div>

            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mb-6">
              {[
                ['Equipos', salida.equiposCreados],
                ['Colaboradores', salida.colaboradoresCreados],
                ['Movimientos', salida.movimientosCreados],
              ].map(([label, n], i) => (
                <motion.div
                  key={label as string}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className="card p-3 text-center"
                >
                  <div className="text-xl font-semibold tabular-nums">{n as number}</div>
                  <div className="text-xs text-ink-400 mt-0.5">{label as string}</div>
                </motion.div>
              ))}
            </div>

            {salida.equiposOmitidos > 0 && (
              <p className="text-center text-sm text-ink-400 mb-3">
                {salida.equiposOmitidos} equipos ya estaban en el inventario y no se duplicaron.
              </p>
            )}

            <div className="flex justify-center gap-2">
              <button onClick={reiniciar} className="btn-secondary"><RotateCcw size={15} /> Importar otro</button>
              <button onClick={cerrar} className="btn-primary">Ver inventario</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

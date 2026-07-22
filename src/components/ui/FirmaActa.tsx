import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { PenLine, FileSignature, Download, UploadCloud, FileText, Image as ImageIcon, CheckCircle2, X, Loader2 } from 'lucide-react';
import { SignaturePad, type SignatureHandle } from './SignaturePad';
import { toast } from './Toast';

export type FirmaMode = 'digital' | 'manual';

export interface FirmaActaHandle {
  /** Modo activo en el momento de finalizar. */
  getMode: () => FirmaMode;
  /** Firma dibujada (solo en modo digital). */
  toDataURL: () => string | null;
  /** Archivo del acta firmada a mano (solo en modo manual). */
  getArchivo: () => File | null;
  clear: () => void;
}

interface Props {
  /** Genera y descarga el acta sin firmar para imprimirla. Devuelve para saber si terminó. */
  onDescargar: () => Promise<void> | void;
}

const MAX_MB = 10;
const ACEPTADOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic'];

function tamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Bloque de firma del acta con dos caminos: firma digital en pantalla o firma
 * física (descargar el acta, firmarla a mano y subir el escaneo). El padre lee
 * el resultado por ref al finalizar, sin importar el modo elegido.
 */
export const FirmaActa = forwardRef<FirmaActaHandle, Props>(function FirmaActa({ onDescargar }, ref) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<FirmaMode>('digital');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const sigRef = useRef<SignatureHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    getMode: () => mode,
    toDataURL: () => sigRef.current?.toDataURL() ?? null,
    getArchivo: () => archivo,
    clear: () => { sigRef.current?.clear(); setArchivo(null); },
  }));

  const validar = (file: File): boolean => {
    const okTipo = ACEPTADOS.includes(file.type) || /\.(pdf|png|jpe?g|webp|heic)$/i.test(file.name);
    if (!okTipo) { toast.error(t('acta.archivoInvalido')); return false; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(t('acta.archivoGrande', { mb: MAX_MB })); return false; }
    return true;
  };

  const tomarArchivo = (file: File | undefined | null) => {
    if (!file) return;
    if (validar(file)) setArchivo(file);
  };

  const descargar = async () => {
    setDescargando(true);
    try { await onDescargar(); }
    finally { setDescargando(false); }
  };

  const tabs: { key: FirmaMode; icon: React.ElementType; label: string; hint: string }[] = [
    { key: 'digital', icon: PenLine, label: t('acta.firmaDigital'), hint: t('acta.firmaDigitalHint') },
    { key: 'manual', icon: FileSignature, label: t('acta.firmaManual'), hint: t('acta.firmaManualHint') },
  ];

  const esImagen = archivo && (archivo.type.startsWith('image/') || /\.(png|jpe?g|webp|heic)$/i.test(archivo.name));

  return (
    <div>
      {/* Selector de método — pastilla animada estilo segmented control */}
      <div className="relative grid grid-cols-2 gap-1 p-1 rounded-2xl bg-ink-100/70 dark:bg-white/5 mb-4">
        {tabs.map((tab) => {
          const active = mode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={`relative z-10 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                active ? 'text-brand-700 dark:text-white' : 'text-ink-500 dark:text-ink-300 hover:text-ink-700 dark:hover:text-ink-100'}`}
            >
              {active && (
                <motion.span
                  layoutId="firma-tab-pill"
                  className="absolute inset-0 -z-10 rounded-xl bg-white dark:bg-ink-700 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <tab.icon size={16} className={active ? 'text-brand-500' : ''} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {mode === 'digital' ? (
          <motion.div
            key="digital"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <p className="text-xs text-ink-400 mb-2">{tabs[0].hint}</p>
            <SignaturePad ref={sigRef} />
          </motion.div>
        ) : (
          <motion.div
            key="manual"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-3"
          >
            {/* Paso 1: descargar el acta para imprimir y firmar */}
            <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-ink-100 dark:border-white/10 bg-ink-50/60 dark:bg-white/5">
              <div className="w-9 h-9 shrink-0 rounded-full bg-brand-500/10 text-brand-600 grid place-items-center font-bold text-sm">1</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{t('acta.paso1Titulo')}</div>
                <div className="text-xs text-ink-400">{t('acta.paso1Hint')}</div>
              </div>
              <button
                type="button" onClick={descargar} disabled={descargando}
                className="btn-secondary shrink-0 !py-2"
              >
                {descargando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                <span className="hidden sm:inline">{descargando ? t('acta.generando') : t('common.download')}</span>
              </button>
            </div>

            {/* Paso 2: subir el acta firmada */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 shrink-0 rounded-full bg-brand-500/10 text-brand-600 grid place-items-center font-bold text-sm">2</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{t('acta.paso2Titulo')}</div>
                  <div className="text-xs text-ink-400">{t('acta.paso2Hint')}</div>
                </div>
              </div>

              <input
                ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden"
                onChange={(e) => { tomarArchivo(e.target.files?.[0]); if (inputRef.current) inputRef.current.value = ''; }}
              />

              <AnimatePresence mode="wait">
                {archivo ? (
                  <motion.div
                    key="listo"
                    initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
                    className="flex items-center gap-3 p-3.5 rounded-2xl border border-success/40 bg-success/8"
                  >
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-white dark:bg-ink-800 border border-success/30 grid place-items-center text-emerald-600">
                      {esImagen ? <ImageIcon size={20} /> : <FileText size={20} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-success">
                        <CheckCircle2 size={14} /> {t('acta.archivoListo')}
                      </div>
                      <div className="text-xs text-ink-500 dark:text-ink-300 truncate">{archivo.name} · {tamano(archivo.size)}</div>
                    </div>
                    <button
                      type="button" onClick={() => setArchivo(null)}
                      className="btn-ghost !p-2 shrink-0" title={t('acta.quitarArchivo')}
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                ) : (
                  <motion.button
                    key="drop"
                    type="button"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); tomarArchivo(e.dataTransfer.files?.[0]); }}
                    className={`w-full flex flex-col items-center justify-center gap-2 px-4 py-7 rounded-2xl border-2 border-dashed transition-all ${
                      dragging
                        ? 'border-brand-500 bg-brand-500/10 scale-[1.01]'
                        : 'border-ink-200 dark:border-white/15 hover:border-brand-400 hover:bg-brand-500/5'}`}
                  >
                    <div className={`w-12 h-12 rounded-full grid place-items-center transition-colors ${
                      dragging ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-white/10 text-brand-500'}`}>
                      <UploadCloud size={22} />
                    </div>
                    <div className="text-sm font-semibold text-ink-700 dark:text-ink-100">{t('acta.dropTitulo')}</div>
                    <div className="text-xs text-ink-400">{t('acta.dropFormatos', { mb: MAX_MB })}</div>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

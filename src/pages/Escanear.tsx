import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { ScanLine, Camera, CameraOff, Search, Cpu } from 'lucide-react';
import { findByCode } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { toast } from '@/components/ui/Toast';

// Ancho del visor: lo fija el alto disponible, no el de la tarjeta. El botón de
// la cámara lo comparte para quedar exactamente igual de ancho que el recuadro.
const ANCHO_VISOR = 'mx-auto w-full max-w-[min(100%,34dvh)] sm:max-w-[min(100%,42dvh)]';

// Sin pistas, el lector prueba TODOS los formatos de código de barras en cada
// intento: gasta el tiempo de cada fotograma en lectores 1D que aquí no se usan
// nunca. Nuestras etiquetas son solo QR, así que se lo decimos, y con el tiempo
// que sobra se activa TRY_HARDER (busca el código girado, torcido o con poco
// contraste, que es justo lo que pasa con una etiqueta pegada a un portátil).
const PISTAS = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]],
  [DecodeHintType.TRY_HARDER, true],
]);

// Por defecto zxing espera 500 ms entre intento e intento: dos lecturas por
// segundo, con el móvil en la mano y la etiqueta moviéndose. Se baja a 100 ms
// (10 por segundo). Tras un acierto sí se espera, que ahí ya se navega.
const OPCIONES = { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 800 };

// La cámara trasera pedida "a secas" entrega 640×480 en casi todos los móviles,
// y a esa resolución un QR impreso de 2 cm solo entra si lo pegas al lente. Se
// pide 1280×720 como ideal: si el equipo no puede, el navegador da lo que tenga
// en vez de fallar. `ideal` en facingMode (no `exact`) deja que un portátil sin
// cámara trasera siga usando la frontal en vez de quedarse sin nada.
const CAMARA: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

// Un código leído no se vuelve a consultar de inmediato (la cámara lo lee diez
// veces por segundo), pero pasado este tiempo sí: si el equipo no se encontró,
// volver a apuntar tiene que reintentar, no quedarse mudo para siempre.
const REINTENTO_MS = 2500;

export function Escanear() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  // Último código consultado. Va en una ref y no en el estado a propósito: entre
  // dos lecturas seguidas de la cámara pasan 100 ms y React todavía no habría
  // aplicado el `setState`, así que el mismo código se consultaría varias veces.
  const ultimo = useRef({ code: '', t: 0 });
  const buscando = useRef(false);

  const handleCode = async (code: string, desdeCamara = false) => {
    if (!code) return;
    if (desdeCamara) {
      const ahora = Date.now();
      if (code === ultimo.current.code && ahora - ultimo.current.t < REINTENTO_MS) return;
      ultimo.current = { code, t: ahora };
    }
    // Una consulta a la vez: si no, la cámara encadena peticiones mientras la
    // primera sigue en vuelo.
    if (buscando.current) return;
    buscando.current = true;
    try {
      const eq = await findByCode(code);
      if (eq) { stop(); navigate(`/equipo/${eq.id}`); }
      else toast.error(t('scan.notFound', { code }));
    } catch {
      // Sin esto, un fallo de red dejaba el código marcado como "ya consultado"
      // y la vista muda: la cámara seguía leyendo y no pasaba nada.
      ultimo.current = { code: '', t: 0 };
      toast.error(t('scan.error'));
    } finally {
      buscando.current = false;
    }
  };

  const start = async () => {
    try {
      const reader = new BrowserMultiFormatReader(PISTAS, OPCIONES);
      setScanning(true);
      const controls = await reader.decodeFromConstraints(CAMARA, videoRef.current!, (result) => {
        if (result) handleCode(result.getText(), true);
      });
      controlsRef.current = controls;
    } catch (e) {
      setScanning(false);
      toast.error(t('scan.permission'));
    }
  };

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} icon={ScanLine} />

      <div className="card p-4 sm:p-6">
        {/* La vista tiene que caber de una sola pantalla: escanear y luego
            bajar a buscar a mano no funciona con el móvil en la mano. El
            visor manda sobre el alto disponible (no sobre el ancho): sigue
            siendo cuadrado, pero su lado se limita en `dvh`, así que se
            encoge en pantallas bajas — y en un portátil tampoco desborda. */}
        <div className={`relative aspect-square ${ANCHO_VISOR}
                        rounded-3xl overflow-hidden bg-ink-900 mb-3 sm:mb-4`}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {!scanning && (
            <div className="absolute inset-0 grid place-items-center text-white/60">
              <div className="text-center">
                <Camera size={40} className="mx-auto mb-2 opacity-50" />
                <p className="text-xs sm:text-sm px-4">{t('scan.point')}</p>
              </div>
            </div>
          )}
          {scanning && (
            <>
              <div className="absolute inset-[12%] border-2 border-white/60 rounded-2xl" />
              <motion.div className="absolute left-[12%] right-[12%] h-0.5 bg-brand-400 shadow-[0_0_12px_rgba(10,132,255,0.8)]"
                initial={{ top: '10%' }} animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />
            </>
          )}
        </div>

        <div className={`flex gap-2 ${ANCHO_VISOR}`}>
          {!scanning ? (
            <button onClick={start} className="btn-primary flex-1"><Camera size={18} /> {t('scan.start')}</button>
          ) : (
            <button onClick={stop} className="btn-danger flex-1"><CameraOff size={18} /> {t('scan.stop')}</button>
          )}
        </div>

        <div className="mt-4 pt-4 sm:mt-5 sm:pt-5 border-t border-ink-100 dark:border-white/10">
          <label className="label">{t('scan.manual')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Cpu size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              {/* Los códigos y seriales se manejan en mayúsculas: el campo las
                  aplica mientras se escribe (no solo con CSS, para que lo que
                  se busca sea exactamente lo que se ve) y el teclado del móvil
                  arranca en mayúsculas, sin autocorrector. */}
              <input
                className="input pl-9 uppercase tracking-wide placeholder:normal-case"
                placeholder="EQ-XXXX / Serial"
                value={manual}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(e) => setManual(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleCode(manual)}
              />
            </div>
            <button onClick={() => handleCode(manual)} className="btn-secondary shrink-0"><Search size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

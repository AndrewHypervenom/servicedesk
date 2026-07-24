import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles, RefreshCw, TriangleAlert, Clock3 } from 'lucide-react';
import { useActualizacion, recargarApp } from '@/lib/actualizacion';

/** Segundos de cortesía antes de recargar sola cuando no hay nada en riesgo. */
const CUENTA_ATRAS = 12;

/**
 * Aviso de versión nueva, anclado abajo del sitio.
 *
 * Dos caras, y la misma tarjeta se transforma de una a otra (`layout`) cuando
 * la persona termina de guardar:
 *
 *  · Camino libre  — cuenta atrás y recarga sola. Se puede adelantar o aplazar,
 *    y el reloj se detiene mientras el puntero está encima (para leerlo).
 *  · Trabajo en curso — ámbar, sin reloj: pide guardar primero y enumera lo que
 *    está a medias (lo declaran las pantallas con `useTrabajoEnCurso`).
 */
export function ActualizacionDisponible() {
  const { t } = useTranslation();
  const reducir = useReducedMotion();
  const versionNueva = useActualizacion((s) => s.versionNueva);
  const silenciadoHasta = useActualizacion((s) => s.silenciadoHasta);
  const trabajos = useActualizacion((s) => s.trabajos);
  const posponer = useActualizacion((s) => s.posponer);

  const etiquetas = Object.values(trabajos);
  const hayTrabajo = etiquetas.length > 0;

  // La pestaña en segundo plano congela el reloj de animación del navegador: si
  // la tarjeta se montara ahí, su animación de entrada no correría y quedaría
  // invisible (en opacidad 0) al volver. Se monta solo con la pestaña a la vista.
  const [aLaVista, setALaVista] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const on = () => setALaVista(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // "Más tarde" silencia el aviso un rato; este reloj lo devuelve al vencer.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (silenciadoHasta <= Date.now()) return;
    const id = window.setTimeout(() => setAhora(Date.now()), silenciadoHasta - Date.now() + 50);
    return () => window.clearTimeout(id);
  }, [silenciadoHasta]);

  const mostrar = !!versionNueva && aLaVista && ahora >= silenciadoHasta;

  const [restante, setRestante] = useState(CUENTA_ATRAS);
  const [pausa, setPausa] = useState(false);

  // El reloj solo corre con el camino libre. Si aparece trabajo sin guardar se
  // reinicia: al terminar, la persona vuelve a tener sus doce segundos enteros.
  useEffect(() => {
    if (!mostrar || hayTrabajo) { setRestante(CUENTA_ATRAS); return; }
    if (pausa) return;
    if (restante <= 0) { recargarApp(); return; }
    const id = window.setTimeout(() => setRestante((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [mostrar, hayTrabajo, pausa, restante]);

  const acento = hayTrabajo
    ? 'from-amber-400 via-orange-500 to-amber-400'
    : 'from-brand-500 via-magenta-500 to-brand-500';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex justify-center
                    px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <AnimatePresence>
        {mostrar && (
          <motion.div
            key="aviso-version"
            layout
            role={hayTrabajo ? 'alert' : 'status'}
            aria-live="polite"
            className="pointer-events-auto w-full max-w-xl"
            initial={reducir ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.94, filter: 'blur(12px)' }}
            animate={reducir ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reducir ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96, filter: 'blur(8px)' }}
            transition={{ type: 'spring', damping: 26, stiffness: 300, mass: 0.9 }}
            onMouseEnter={() => setPausa(true)}
            onMouseLeave={() => setPausa(false)}
            onFocusCapture={() => setPausa(true)}
            onBlurCapture={() => setPausa(false)}
          >
            {/* Marco de un píxel con un cono de color girando: es el borde vivo
                que da el acabado caro sin recortar nada del contenido. */}
            <div className="relative rounded-[1.45rem] p-px overflow-hidden shadow-[0_24px_60px_-18px_rgba(15,18,25,0.55)]">
              {!reducir ? (
                <motion.div
                  aria-hidden
                  className={`absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2
                              bg-[conic-gradient(from_0deg,transparent_0deg,currentColor_60deg,transparent_140deg,currentColor_240deg,transparent_330deg)]
                              ${hayTrabajo ? 'text-amber-400/80' : 'text-brand-500/80'}`}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
                />
              ) : (
                <div aria-hidden className={`absolute inset-0 bg-gradient-to-r ${acento} opacity-60`} />
              )}

              <div className="relative rounded-[1.4rem] glass-modal overflow-hidden">
                {/* Destello que barre la tarjeta cada pocos segundos. */}
                {!reducir && (
                  <motion.div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg]
                               bg-gradient-to-r from-transparent via-white/45 to-transparent
                               dark:via-white/10"
                    animate={{ x: ['0%', '420%'] }}
                    transition={{ duration: 2.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 3.4 }}
                  />
                )}

                <div className="relative flex items-start gap-3.5 p-4 sm:p-[1.15rem]">
                  {/* Emblema */}
                  <div className="relative shrink-0">
                    {!reducir && (
                      <motion.span
                        aria-hidden
                        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${acento} blur-lg`}
                        animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.9, 1.12, 0.9] }}
                        transition={{ duration: 3.2, ease: 'easeInOut', repeat: Infinity }}
                      />
                    )}
                    <div className={`relative grid h-11 w-11 place-items-center rounded-2xl
                                     bg-gradient-to-br ${acento} text-white
                                     shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]`}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {hayTrabajo ? (
                          <motion.span
                            key="alerta"
                            initial={{ scale: 0.5, opacity: 0, rotate: -25 }}
                            animate={{ scale: 1, opacity: 1, rotate: 0 }}
                            exit={{ scale: 0.5, opacity: 0, rotate: 25 }}
                            transition={{ type: 'spring', damping: 18, stiffness: 340 }}
                          >
                            <TriangleAlert size={20} strokeWidth={2.2} />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="chispa"
                            initial={{ scale: 0.5, opacity: 0, rotate: 25 }}
                            animate={reducir
                              ? { scale: 1, opacity: 1 }
                              : { scale: 1, opacity: 1, rotate: [0, -8, 8, 0] }}
                            exit={{ scale: 0.5, opacity: 0, rotate: -25 }}
                            transition={{
                              scale: { type: 'spring', damping: 18, stiffness: 340 },
                              rotate: { duration: 4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 2 },
                            }}
                          >
                            <Sparkles size={20} strokeWidth={2.2} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Texto */}
                  <div className="min-w-0 flex-1">
                    <motion.p layout="position" className="text-[0.95rem] font-semibold leading-tight">
                      {hayTrabajo ? t('update.titleBusy') : t('update.title')}
                    </motion.p>

                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={hayTrabajo ? 'ocupado' : 'libre'}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                      >
                        <p className="mt-1 text-[0.8rem] leading-snug text-ink-500 dark:text-ink-300">
                          {hayTrabajo ? t('update.bodyBusy') : t('update.body')}
                        </p>

                        {hayTrabajo ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {etiquetas.map((e) => (
                              <motion.span
                                key={e}
                                layout
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5
                                           text-[0.7rem] font-medium text-amber-700 dark:text-amber-300"
                              >
                                {e}
                              </motion.span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1.5 flex items-center gap-1.5 text-[0.72rem] font-medium
                                        text-ink-400 dark:text-ink-300 tabular-nums">
                            <Clock3 size={12} />
                            {pausa
                              ? t('update.paused')
                              : t('update.countdown', { s: Math.max(restante, 0) })}
                          </p>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Acciones */}
                  <motion.div layout="position" className="flex shrink-0 flex-col gap-1.5 sm:flex-row-reverse sm:items-center">
                    <button
                      onClick={recargarApp}
                      className="btn-primary !px-3.5 !py-2 !text-[0.8rem] group"
                    >
                      <RefreshCw
                        size={14}
                        className={reducir ? '' : 'transition-transform duration-500 group-hover:rotate-180'}
                      />
                      {t('update.now')}
                    </button>
                    <button
                      onClick={posponer}
                      className="btn-ghost !px-3 !py-2 !text-[0.8rem] text-ink-500 dark:text-ink-300"
                    >
                      {hayTrabajo ? t('update.keepWorking') : t('update.later')}
                    </button>
                  </motion.div>
                </div>

                {/* Barra de tiempo: se vacía sola y se congela con el puntero
                    encima. Con trabajo pendiente no hay reloj, así que no se pinta. */}
                {!hayTrabajo && (
                  <div className="h-[3px] w-full bg-ink-200/50 dark:bg-white/10">
                    <motion.div
                      className={`h-full origin-left bg-gradient-to-r ${acento}`}
                      initial={{ scaleX: 1 }}
                      animate={{ scaleX: Math.max(restante, 0) / CUENTA_ATRAS }}
                      transition={{ duration: pausa ? 0.3 : 1, ease: 'linear' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

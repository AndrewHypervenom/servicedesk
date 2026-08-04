import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, ArrowLeft,
  CheckCircle2, KeyRound, MailCheck, Send,
} from 'lucide-react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { AuthShell, MarcaMovil } from '@/components/layout/AuthShell';

/** Espera antes de dejar pedir otro enlace; Supabase también limita por su lado. */
const ESPERA_REENVIO = 60;

type Vista = 'entrar' | 'recuperar' | 'enviado';

export function Login() {
  const { t } = useTranslation();
  const { signIn, idioma } = useApp();

  const [vista, setVista] = useState<Vista>('entrar');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);

  // Cuenta atrás del reenvío. Se apoya en un timestamp y no en ir restando 1,
  // porque el navegador ralentiza los temporizadores de las pestañas en segundo
  // plano y el contador se quedaba corto respecto al límite real del servidor.
  const finEspera = useRef(0);
  useEffect(() => {
    if (!espera) return;
    const id = setInterval(() => {
      setEspera(Math.max(0, Math.ceil((finEspera.current - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(id);
  }, [espera]);

  const irA = (v: Vista) => { setError(null); setVista(v); };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, pass);
    } catch (err: any) {
      // El error se muestra junto al formulario, no solo como toast: en una
      // pantalla de login el toast en la esquina se pierde y parece que
      // "no pasó nada" al pulsar Entrar.
      const msg = err?.message ?? t('common.error');
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  // Sirve tanto al submit del formulario como al botón "reenviar", de ahí el
  // tipo genérico del evento.
  const pedirEnlace = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // No se usa `supabase.auth.resetPasswordForEmail`: ese camino manda la
      // plantilla de Auth, que el panel no deja editar mientras el proyecto use
      // el SMTP de cortesía. La edge function genera el mismo enlace y lo envía
      // por Resend dentro del correo con la marca de Calisto.
      const { data, error: err } = await supabase.functions.invoke('enviar-reset', {
        body: { correo: email.trim(), idioma, origen: window.location.origin },
      });
      // Ante un 429 o un 502, `invoke` devuelve un error genérico
      // ("non-2xx status code") y deja el cuerpo real dentro de `context`. Sin
      // desenvolverlo, el "pediste demasiados enlaces" que escribe la función
      // no llegaría nunca a la pantalla.
      if (err) {
        const detalle = await (err as any).context?.json?.().catch(() => null);
        // Lo que escribe la función ya está redactado para leerse; lo que sale
        // de la librería ("Failed to send a request to the Edge Function") no
        // dice nada a quien solo quiere volver a entrar, así que se guarda en la
        // consola y a la pantalla va una frase útil.
        if (!detalle?.error) console.error('enviar-reset', err);
        throw new Error(detalle?.error ?? t('auth.sendLinkFailed'));
      }
      if (data?.error) throw new Error(data.error);
      finEspera.current = Date.now() + ESPERA_REENVIO * 1000;
      setEspera(ESPERA_REENVIO);
      setVista('enviado');
    } catch (err: any) {
      const msg = err?.message ?? t('common.error');
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  // Cada vista entra desde el lado al que "avanza" y sale por el contrario, de
  // modo que volver atrás se siente como volver y no como otra pantalla nueva.
  const transicion = { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <AuthShell>
      <MarcaMovil />

      {/* `mode="wait"` y no un cruce: los dos formularios tienen alturas muy
          distintas y superpuestos hacían saltar el bloque entero. */}
      <AnimatePresence mode="wait" initial={false}>
        {vista === 'entrar' && (
          <motion.div
            key="entrar"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={transicion}
          >
            <h2 className="text-[1.75rem] font-bold tracking-tight">{t('auth.welcome')}</h2>
            <p className="text-sm text-ink-400 mt-1.5 mb-7">{t('app.subtitle')}</p>

            <form onSubmit={entrar} className="space-y-4">
              <div>
                <label className="label" htmlFor="login-email">{t('auth.email')}</label>
                <div className="group relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none transition-colors group-focus-within:text-brand-500" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="nombre@positivo.com"
                    className="input pl-10 h-12"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label className="label" htmlFor="login-pass">{t('auth.password')}</label>
                  {/* El enlace va pegado al campo que falla, no al pie de la
                      tarjeta: es donde mira la persona justo después de que le
                      rechacen la contraseña. */}
                  <button
                    type="button"
                    onClick={() => irA('recuperar')}
                    className="text-xs font-semibold text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:hover:text-brand-200 hover:underline underline-offset-2 transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
                <div className="group relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none transition-colors group-focus-within:text-brand-500" />
                  <input
                    id="login-pass"
                    type={verPass ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="input pl-10 pr-11 h-12"
                    value={pass}
                    onChange={(e) => { setPass(e.target.value); setError(null); }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setVerPass((v) => !v)}
                    aria-label={verPass ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 hover:bg-ink-100 dark:hover:bg-white/5 transition-colors"
                  >
                    {verPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <AvisoError mensaje={error} />

              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="btn shine w-full h-12 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold
                           shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30
                           hover:brightness-[1.05] hover:-translate-y-0.5 active:translate-y-0
                           disabled:shadow-none disabled:translate-y-0 group"
              >
                {busy ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    {t('auth.signingIn')}
                  </>
                ) : (
                  <>
                    {t('auth.signIn')}
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-7 pt-5 border-t border-ink-100 dark:border-white/10">
              <p className="text-xs text-ink-400 leading-relaxed">{t('auth.contactAdmin')}</p>
              <div className="flex items-center gap-1.5 mt-3 text-[11px] text-ink-400">
                <CheckCircle2 size={13} className="text-brand-500 shrink-0" />
                {t('auth.secureConnection')}
              </div>
            </div>
          </motion.div>
        )}

        {vista === 'recuperar' && (
          <motion.div
            key="recuperar"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={transicion}
          >
            <div className="w-11 h-11 rounded-2xl grid place-items-center mb-4
                            bg-gradient-to-br from-brand-500/15 to-magenta-500/15
                            border border-brand-500/20 text-brand-600 dark:text-brand-300">
              <KeyRound size={20} />
            </div>
            <h2 className="text-[1.6rem] font-bold tracking-tight leading-tight">{t('auth.forgotTitle')}</h2>
            <p className="text-sm text-ink-400 mt-2 mb-7 leading-relaxed">{t('auth.forgotSub')}</p>

            <form onSubmit={pedirEnlace} className="space-y-4">
              <div>
                <label className="label" htmlFor="recuperar-email">{t('auth.email')}</label>
                <div className="group relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none transition-colors group-focus-within:text-brand-500" />
                  <input
                    id="recuperar-email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="nombre@positivo.com"
                    className="input pl-10 h-12"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    required
                  />
                </div>
              </div>

              <AvisoError mensaje={error} />

              <button
                type="submit"
                disabled={busy}
                aria-busy={busy || undefined}
                className="btn shine w-full h-12 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold
                           shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30
                           hover:brightness-[1.05] hover:-translate-y-0.5 active:translate-y-0
                           disabled:shadow-none disabled:translate-y-0 group"
              >
                {busy ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    {t('auth.sendingLink')}
                  </>
                ) : (
                  <>
                    {t('auth.sendLink')}
                    <Send size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <BotonVolver onClick={() => irA('entrar')} texto={t('auth.backToLogin')} />
          </motion.div>
        )}

        {vista === 'enviado' && (
          <motion.div
            key="enviado"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={transicion}
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 260, delay: 0.1 }}
              className="w-14 h-14 rounded-2xl grid place-items-center mb-5
                         bg-gradient-to-br from-brand-500 to-brand-600 text-white
                         shadow-lg shadow-brand-500/30"
            >
              <MailCheck size={26} />
            </motion.div>

            <h2 className="text-[1.6rem] font-bold tracking-tight leading-tight">{t('auth.sentTitle')}</h2>
            <p className="text-sm text-ink-400 mt-2 leading-relaxed">{t('auth.sentSub')}</p>

            <div className="mt-4 px-3.5 py-3 rounded-xl bg-ink-100/70 dark:bg-white/5 border border-ink-200/60 dark:border-white/10
                            flex items-center gap-2.5 text-sm font-medium break-all">
              <Mail size={15} className="text-brand-500 shrink-0" />
              {email}
            </div>

            <p className="text-xs text-ink-400 mt-4 leading-relaxed">{t('auth.sentHint')}</p>

            <button
              type="button"
              onClick={pedirEnlace}
              disabled={busy || espera > 0}
              className="btn-secondary w-full h-11 mt-5 disabled:opacity-60"
            >
              {espera > 0 ? t('auth.resendIn', { s: espera }) : t('auth.resend')}
            </button>

            <BotonVolver onClick={() => irA('entrar')} texto={t('auth.backToLogin')} />
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

function AvisoError({ mensaje }: { mensaje: string | null }) {
  return (
    <AnimatePresence>
      {mensaje && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          role="alert"
          className="flex items-start gap-2.5 p-3 rounded-xl bg-danger/10 border border-danger/25 text-sm text-red-600 dark:text-danger overflow-hidden"
        >
          <AlertCircle size={16} className="shrink-0 mt-px" />
          <span className="leading-snug">{mensaje}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BotonVolver({ onClick, texto }: { onClick: () => void; texto: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 transition-colors"
    >
      <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
      {texto}
    </button>
  );
}

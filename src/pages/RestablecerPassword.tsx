import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, Eye, EyeOff, ShieldCheck, AlertCircle, Unlink, ArrowRight, ArrowLeft, PartyPopper,
} from 'lucide-react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { limpiarUrlRecuperacion } from '@/lib/recuperacion';
import { AuthShell, MarcaMovil } from '@/components/layout/AuthShell';
import { MedidorPassword, LARGO_MINIMO } from '@/components/auth/MedidorPassword';
import { toast } from '@/components/ui/Toast';

type Estado = 'verificando' | 'listo' | 'invalido' | 'hecho';

/**
 * Pantalla a la que lleva el enlace del correo (`/restablecer`).
 *
 * El enlace ya autentica: quien lo abre tiene sesión válida. Por eso esta
 * pantalla se muestra por encima de todo lo demás (ver `App.tsx`) y la única
 * acción que ofrece es definir la contraseña nueva — dejar entrar al inventario
 * con una sesión abierta desde un correo, sin haber demostrado que se conoce la
 * contraseña, sería regalar el acceso a quien tenga el buzón un rato.
 */
export function RestablecerPassword() {
  const { t } = useTranslation();
  const { perfil, updatePerfil, cerrarRecuperacion, errorRecuperacion } = useApp();

  const [estado, setEstado] = useState<Estado>('verificando');
  const [correo, setCorreo] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // El enlace vino con el motivo del fallo en la URL: no hay nada que
    // verificar, solo que se entienda por qué y cómo pedir otro.
    if (errorRecuperacion) { setEstado('invalido'); return; }

    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      // Sin sesión, el enlace caducó, ya se usó o se abrió a mano.
      if (!data.session) { setEstado('invalido'); return; }
      setCorreo(data.session.user.email ?? '');
      setEstado('listo');
      limpiarUrlRecuperacion();
    });
    return () => { vivo = false; };
  }, [errorRecuperacion]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass1.length < LARGO_MINIMO) { setError(t('settings.passwordMin')); return; }
    if (pass1 !== pass2) { setError(t('settings.passwordMismatch')); return; }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pass1 });
      if (err) throw err;
      // Si la cuenta seguía marcada con contraseña temporal, esto ya la
      // reemplaza: sin bajar la bandera, entraría directo a "define tu
      // contraseña" y le pediríamos lo mismo dos veces seguidas. Si la RLS lo
      // impide no es motivo para dar el restablecimiento por fallido: la
      // contraseña nueva ya quedó guardada.
      if (perfil?.debe_cambiar_password) {
        try { await updatePerfil({ debe_cambiar_password: false }); } catch { /* no bloquea */ }
      }
      setEstado('hecho');
      toast.success(t('settings.passwordUpdated'));
      // Un respiro para leer la confirmación antes de que la app cambie debajo.
      setTimeout(() => cerrarRecuperacion(), 1800);
    } catch (err: any) {
      const msg = err?.message ?? t('common.error');
      setError(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  const transicion = { duration: 0.32, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <AuthShell>
      <MarcaMovil />

      <AnimatePresence mode="wait" initial={false}>
        {estado === 'verificando' && (
          <motion.div key="verificando" exit={{ opacity: 0 }} transition={transicion} className="space-y-4">
            <div className="h-11 w-11 rounded-2xl bg-ink-100 dark:bg-white/5 animate-pulse" />
            <div className="h-7 w-3/4 rounded-lg bg-ink-100 dark:bg-white/5 animate-pulse" />
            <div className="h-4 w-full rounded-lg bg-ink-100 dark:bg-white/5 animate-pulse" />
            <div className="h-12 w-full rounded-xl bg-ink-100 dark:bg-white/5 animate-pulse" />
          </motion.div>
        )}

        {estado === 'invalido' && (
          <motion.div
            key="invalido"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={transicion}
          >
            <div className="w-14 h-14 rounded-2xl grid place-items-center mb-5
                            bg-danger/10 border border-danger/25 text-danger">
              <Unlink size={24} />
            </div>
            <h2 className="text-[1.6rem] font-bold tracking-tight leading-tight">{t('reset.expiredTitle')}</h2>
            <p className="text-sm text-ink-400 mt-2 leading-relaxed">{t('reset.expiredSub')}</p>

            {errorRecuperacion && (
              <p className="mt-4 p-3 rounded-xl bg-ink-100/70 dark:bg-white/5 border border-ink-200/60 dark:border-white/10
                            text-[11px] text-ink-400 break-words">
                {errorRecuperacion}
              </p>
            )}

            <button
              type="button"
              onClick={cerrarRecuperacion}
              className="btn shine w-full h-12 mt-6 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold
                         shadow-lg shadow-brand-500/25 hover:shadow-xl hover:shadow-brand-500/30
                         hover:brightness-[1.05] hover:-translate-y-0.5 active:translate-y-0 group"
            >
              <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
              {t('reset.askAnother')}
            </button>
          </motion.div>
        )}

        {estado === 'listo' && (
          <motion.div
            key="listo"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={transicion}
          >
            <div className="w-11 h-11 rounded-2xl grid place-items-center mb-4
                            bg-gradient-to-br from-brand-500/15 to-magenta-500/15
                            border border-brand-500/20 text-brand-600 dark:text-brand-300">
              <ShieldCheck size={20} />
            </div>
            <h2 className="text-[1.6rem] font-bold tracking-tight leading-tight">{t('reset.title')}</h2>
            {/* Sin correo el texto se quedaba en "…la contraseña de" y ahí
                terminaba la frase, así que cada caso tiene el suyo. */}
            <p className="text-sm text-ink-400 mt-2 mb-6 leading-relaxed">
              {correo ? (
                <>
                  {t('reset.sub')}{' '}
                  <span className="font-medium text-ink-600 dark:text-ink-200 break-all">{correo}</span>
                </>
              ) : t('reset.subGeneric')}
            </p>

            <form onSubmit={guardar} className="space-y-4">
              <div>
                <label className="label" htmlFor="reset-pass1">{t('settings.newPassword')}</label>
                <div className="group relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none transition-colors group-focus-within:text-brand-500" />
                  <input
                    id="reset-pass1"
                    type={ver ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoFocus
                    placeholder="••••••••"
                    className="input pl-10 pr-11 h-12"
                    value={pass1}
                    onChange={(e) => { setPass1(e.target.value); setError(null); }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setVer((v) => !v)}
                    aria-label={ver ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 hover:bg-ink-100 dark:hover:bg-white/5 transition-colors"
                  >
                    {ver ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <MedidorPassword valor={pass1} />
              </div>

              <div>
                <label className="label" htmlFor="reset-pass2">{t('settings.confirmPassword')}</label>
                <div className="group relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none transition-colors group-focus-within:text-brand-500" />
                  <input
                    id="reset-pass2"
                    type={ver ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="input pl-10 h-12"
                    value={pass2}
                    onChange={(e) => { setPass2(e.target.value); setError(null); }}
                    required
                  />
                </div>
                {/* Solo cuando ya hay algo escrito y difiere: avisar mientras se
                    teclea la primera letra sería un error permanente. */}
                {pass2 && pass1 !== pass2 && (
                  <p className="mt-1.5 text-[11px] text-danger">{t('settings.passwordMismatch')}</p>
                )}
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    role="alert"
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-danger/10 border border-danger/25 text-sm text-red-600 dark:text-danger overflow-hidden"
                  >
                    <AlertCircle size={16} className="shrink-0 mt-px" />
                    <span className="leading-snug">{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

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
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    {t('reset.action')}
                    <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-[11px] text-ink-400 leading-relaxed">{t('reset.securityNote')}</p>
          </motion.div>
        )}

        {estado === 'hecho' && (
          <motion.div
            key="hecho"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transicion}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 13, stiffness: 260, delay: 0.08 }}
              className="w-16 h-16 rounded-3xl grid place-items-center mx-auto mb-5
                         bg-gradient-to-br from-brand-500 to-brand-600 text-white
                         shadow-xl shadow-brand-500/35"
            >
              <PartyPopper size={28} />
            </motion.div>
            <h2 className="text-[1.6rem] font-bold tracking-tight">{t('reset.doneTitle')}</h2>
            <p className="text-sm text-ink-400 mt-2">{t('reset.doneSub')}</p>
            <div className="mt-6 h-1 w-28 mx-auto rounded-full bg-ink-200/70 dark:bg-white/10 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-brand-500 to-magenta-500 animate-carga" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

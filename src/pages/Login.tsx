import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion, useMotionValue, useMotionTemplate, useSpring } from 'framer-motion';
import {
  Boxes, Mail, Lock, ScanLine, FileSignature, Globe, Eye, EyeOff,
  AlertCircle, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { useApp } from '@/store/useApp';
import { toast } from '@/components/ui/Toast';

const IDIOMAS = [
  { code: 'es', label: 'ES' },
  { code: 'pt', label: 'PT' },
];

export function Login() {
  const { t } = useTranslation();
  const { signIn, idioma, setIdioma } = useApp();
  const reduce = useReducedMotion();

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
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

  const features = [
    { icon: ScanLine, txt: t('auth.featureQr') },
    { icon: FileSignature, txt: t('auth.featureActa') },
    { icon: Globe, txt: t('auth.featureI18n') },
  ];

  // Foco que sigue al puntero sobre el panel izquierdo. Los valores pasan por
  // un muelle blando: seguir el ratón 1:1 delata que es un div y se siente
  // nervioso; el retardo es lo que lo hace parecer una luz real.
  const px = useSpring(useMotionValue(50), { damping: 30, stiffness: 120 });
  const py = useSpring(useMotionValue(50), { damping: 30, stiffness: 120 });
  // 0.10 de alfa era invisible sobre el degradado verde, que ya es claro de
  // por sí. A 0.22 y con el radio más corto el foco se lee como una luz.
  const foco = useMotionTemplate`radial-gradient(26rem circle at ${px}% ${py}%, rgba(255,255,255,0.22), transparent 60%)`;

  const moverFoco = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width) * 100);
    py.set(((e.clientY - r.top) / r.height) * 100);
  };

  return (
    <div className="min-h-screen flex bg-ink-50 dark:bg-ink-900">
      {/* ── Panel izquierdo: escaparate del producto ─────────────────── */}
      <div
        onMouseMove={moverFoco}
        className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden bg-ink-900"
      >
        {/* Malla de color: tres capas desenfocadas que se mueven en ciclos
            distintos, de modo que el degradado nunca se repite igual. */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700 via-ink-900 to-ink-900" />
        <motion.div
          aria-hidden
          className="absolute top-[-15%] left-[-10%] w-[34rem] h-[34rem] rounded-full bg-brand-500/30 blur-[100px]"
          animate={reduce ? {} : { scale: [1, 1.2, 1], x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'transform' }}
        />
        <motion.div
          aria-hidden
          className="absolute bottom-[-20%] right-[-10%] w-[32rem] h-[32rem] rounded-full bg-magenta-500/25 blur-[100px]"
          animate={reduce ? {} : { scale: [1.15, 1, 1.15], x: [0, -30, 0], y: [0, -40, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          style={{ willChange: 'transform' }}
        />
        <motion.div
          aria-hidden
          className="absolute top-[35%] left-[30%] w-72 h-72 rounded-full bg-brand-300/20 blur-[90px]"
          animate={reduce ? {} : { scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
          style={{ willChange: 'transform, opacity' }}
        />
        <div className="absolute inset-0 bg-grid opacity-[0.12]" />
        {/* Viñeta: hunde las esquinas para que el texto blanco siempre contraste. */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-transparent to-ink-900/40" />
        {/* Foco del puntero, por encima de la viñeta para que aclare de verdad. */}
        <motion.div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: foco }} />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex items-center gap-3 text-white"
        >
          <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 grid place-items-center shadow-lg">
            <Boxes size={24} />
          </div>
          <div>
            <div className="font-semibold tracking-tight">{t('app.name')}</div>
            <div className="text-xs text-white/60">Positivo S+ · IT Solutions</div>
          </div>
        </motion.div>

        <div className="relative z-10 space-y-8">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[2.75rem] leading-[1.1] font-bold text-white tracking-tight max-w-lg"
          >
            {t('auth.welcomeSub')}
          </motion.h1>

          {/* Aquí había una tarjeta con métricas de inventario. Se quitó: esta
              pantalla es previa a la autenticación, así que o mostraba cifras
              inventadas (1.248 / 892 / 311 eran fijas) o habría expuesto el
              inventario real de la empresa a cualquier visitante. Las métricas
              reales viven en el Dashboard, ya protegido por sesión. */}

          {/* Al quitar la tarjeta de métricas, estas pasan a ser el cuerpo del
              panel: caben más grandes y con más aire sin apretar el diseño. */}
          <div className="space-y-4">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="group flex items-center gap-4 text-white/85"
              >
                <div className="w-11 h-11 rounded-2xl bg-white/[0.08] border border-white/10 grid place-items-center shrink-0
                                transition-all duration-300 group-hover:bg-white/[0.14] group-hover:scale-105">
                  <f.icon size={19} />
                </div>
                <span className="text-[15px]">{f.txt}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-xs text-white/40">© 2026 Positivo S+ IT Solutions S.A.S</div>
      </div>

      {/* ── Panel derecho: formulario ────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Sin esto el panel queda plano: blanco liso en claro y negro puro en
            oscuro, con mucho vacío bajo el formulario. La aurora va acotada al
            panel y muy tenue, para no competir con los campos. */}
        <div className="aurora aurora-contained opacity-60" aria-hidden>
          <span />
          <span />
        </div>
        <div className="absolute inset-0 bg-grid opacity-[0.5] pointer-events-none" />
        {/* Selector de idioma: antes solo existía dentro de Ajustes, es decir
            había que iniciar sesión para poder cambiar el idioma del login. */}
        <div className="absolute top-6 right-6 flex items-center gap-1 p-1 rounded-xl bg-ink-100/70 dark:bg-white/5 border border-ink-200/60 dark:border-white/10">
          {IDIOMAS.map((l) => (
            <button
              key={l.code}
              onClick={() => setIdioma(l.code)}
              aria-pressed={idioma === l.code}
              className="relative px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors"
            >
              {idioma === l.code && (
                <motion.span
                  layoutId="lang-pill"
                  className="absolute inset-0 rounded-lg bg-white dark:bg-ink-700 shadow-sm"
                  transition={{ type: 'spring', damping: 26, stiffness: 340 }}
                />
              )}
              <span className={`relative z-10 ${idioma === l.code ? 'text-brand-600 dark:text-brand-300' : 'text-ink-400'}`}>
                {l.label}
              </span>
            </button>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-sm"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shadow-lg shadow-brand-500/25">
              <Boxes size={20} />
            </div>
            <div className="font-semibold">{t('app.name')}</div>
          </div>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.5 }}
            className="text-[1.75rem] font-bold tracking-tight"
          >
            {t('auth.welcome')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14, duration: 0.5 }}
            className="text-sm text-ink-400 mt-1.5 mb-7"
          >
            {t('app.subtitle')}
          </motion.p>

          <form onSubmit={submit} className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.5 }}
            >
              <label className="label" htmlFor="login-pass">{t('auth.password')}</label>
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
            </motion.div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-xl bg-danger/10 border border-danger/25 text-sm text-red-600 dark:text-danger overflow-hidden"
              >
                <AlertCircle size={16} className="shrink-0 mt-px" />
                <span className="leading-snug">{error}</span>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32, duration: 0.5 }}
            >
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
            </motion.div>
          </form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.42, duration: 0.5 }}
            className="mt-7 pt-5 border-t border-ink-100 dark:border-white/10"
          >
            <p className="text-xs text-ink-400 leading-relaxed">{t('auth.contactAdmin')}</p>
            <div className="flex items-center gap-1.5 mt-3 text-[11px] text-ink-400">
              <CheckCircle2 size={13} className="text-brand-500 shrink-0" />
              {t('auth.secureConnection')}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

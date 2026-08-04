import { motion, useReducedMotion, useMotionValue, useMotionTemplate, useSpring } from 'framer-motion';
import { ScanLine, FileSignature, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '@/store/useApp';
import { MascotaCalisto, IconoCalisto } from '@/components/marca/Calisto';

const IDIOMAS = [
  { code: 'es', label: 'ES' },
  { code: 'pt', label: 'PT' },
];

/**
 * Escenografía compartida de las pantallas sin sesión (entrar, recuperar y
 * restablecer contraseña).
 *
 * Vive aparte porque el panel izquierdo no es decoración suelta: la malla de
 * color, el foco que sigue al puntero y el paralaje de la mascota están
 * acoplados entre sí a través de los mismos MotionValue. Duplicarlo en cada
 * página garantizaba que se desincronizaran a la primera corrección, y además
 * hacía que pasar del formulario de entrar al de recuperar re-montara el fondo
 * entero: la mascota daba un salto y el degradado parpadeaba justo en el
 * momento en el que la transición tiene que ser invisible.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { idioma, setIdioma } = useApp();
  const reduce = useReducedMotion();

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
        className="hidden lg:flex flex-col justify-between w-1/2 p-10 xl:p-12 relative overflow-hidden bg-ink-900"
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
          <IconoCalisto size={44} className="!rounded-2xl ring-white/20" />
          <div>
            <div className="font-semibold tracking-tight text-lg">{t('app.name')}</div>
            <div className="text-xs text-white/60">Positivo S+ · IT Solutions</div>
          </div>
        </motion.div>

        {/* Cuerpo del panel: la mascota manda y el titular la sostiene. El
            bloque va centrado porque Calisto es simétrica de frente; alineada
            a un lado quedaría descompensada contra el texto. */}
        <div className="relative z-10 flex flex-col items-center text-center">
          <MascotaCalisto
            /* El límite del panel es el alto, no el ancho: en un portátil de
               768 px de alto una mascota fijada en rem empujaba las pastillas
               fuera de la pantalla. Atada a `vh` crece en el monitor grande y
               se recoge sola en el portátil. */
            className="w-[clamp(9rem,25vh,15rem)]"
            foco={{ x: px, y: py }}
            delay={0.15}
          />

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7 text-[1.85rem] xl:text-[2.2rem] leading-[1.15] font-bold text-white tracking-tight max-w-lg text-balance"
          >
            {t('auth.welcomeSub')}
          </motion.h1>
        </div>

        {/* Aquí había una tarjeta con métricas de inventario. Se quitó: esta
            pantalla es previa a la autenticación, así que o mostraba cifras
            inventadas (1.248 / 892 / 311 eran fijas) o habría expuesto el
            inventario real de la empresa a cualquier visitante. Las métricas
            reales viven en el Dashboard, ya protegido por sesión. */}
        {/* Las capacidades eran una lista vertical de tres filas altas. Como
            pastillas en una sola línea ocupan un tercio del alto, que es lo que
            deja sitio a la mascota sin que el panel se desborde a 900 px. */}
        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap justify-center gap-2.5">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.09, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-2.5 pl-2.5 pr-4 py-2 rounded-full text-white/85
                           bg-white/[0.07] border border-white/10 backdrop-blur-sm
                           transition-colors duration-300 hover:bg-white/[0.13] hover:text-white"
              >
                <span className="w-7 h-7 rounded-full bg-white/10 grid place-items-center shrink-0">
                  <f.icon size={15} />
                </span>
                <span className="text-[13px] whitespace-nowrap">{f.txt}</span>
              </motion.div>
            ))}
          </div>

          <div className="text-center text-xs text-white/40">© 2026 Positivo S+ IT Solutions S.A.S</div>
        </div>
      </div>

      {/* ── Panel derecho: contenido de cada pantalla ─────────────────── */}
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

        <div className="relative z-10 w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

/** Lockup de marca para móvil, donde el panel izquierdo no se muestra. */
export function MarcaMovil() {
  const { t } = useTranslation();
  return (
    // En móvil el panel izquierdo no existe, así que este es el único sitio
    // donde se ve la mascota: se le da tamaño de verdad en vez de reducirla al
    // icono del riel.
    <div className="lg:hidden flex items-center gap-3 mb-8">
      {/* Sin halo: a este tamaño el desenfoque es más ancho que la propia
          figura y solo la ensucia. */}
      <MascotaCalisto className="w-[5.5rem] shrink-0 -my-2" paralaje={0} halo={false} />
      <div>
        <div className="text-2xl font-bold tracking-tight wordmark leading-none">{t('app.name')}</div>
        <div className="text-[11px] text-ink-400 mt-1">Positivo S+ · IT Solutions</div>
      </div>
    </div>
  );
}

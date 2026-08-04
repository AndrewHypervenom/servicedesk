import { motion, useReducedMotion, useTransform, useMotionValue } from 'framer-motion';
import type { MotionValue } from 'framer-motion';
import clsx from 'clsx';

/** Ruta única de los recursos de marca, para no repetir cadenas sueltas. */
export const CALISTO_ART = '/calisto.png';
export const CALISTO_ICONO = '/calisto-head.png';

interface FocoPuntero {
  /** Posición del puntero en el contenedor, 0–100. */
  x: MotionValue<number>;
  y: MotionValue<number>;
}

interface MascotaProps {
  /** Ancho del arte. Se pasa como clase para poder variarlo por breakpoint. */
  className?: string;
  /**
   * Si se pasa, la mascota se desplaza unos pocos píxeles contra el puntero.
   * Es lo que la separa del fondo: sin paralaje parece una calcomanía pegada
   * al degradado, con ella parece estar delante de él.
   */
  foco?: FocoPuntero;
  /** Amplitud del paralaje en píxeles. */
  paralaje?: number;
  /**
   * Puesta en escena: halo de color, sombra de contacto y sombra proyectada
   * larga. Se apaga en los usos pequeños (lockups de 4–6 rem), donde el
   * desenfoque es más ancho que la propia figura y solo la ensucia.
   */
  halo?: boolean;
  /** Retardo de la entrada, para encadenarla con el resto de la columna. */
  delay?: number;
}

/**
 * Calisto, la mascota. Es una imagen fija, así que toda la vida que tiene se
 * la dan tres capas que se mueven a ritmos distintos: el halo respira lento,
 * el cuerpo flota, y la sombra del suelo se encoge cuando el cuerpo sube.
 * Ese desfase es lo que hace que se lea como un objeto con peso y no como un
 * PNG con un `translateY` encima.
 *
 * Todo lo continuo es `transform` u `opacity` de capas decorativas: la imagen
 * en sí nunca arranca desde `opacity: 0` sin llegar a 1, porque con la pestaña
 * en segundo plano el reloj de animación se congela en el primer fotograma y
 * la mascota se quedaría invisible para siempre.
 */
export function MascotaCalisto({
  className,
  foco,
  paralaje = 14,
  halo = true,
  delay = 0,
}: MascotaProps) {
  const reduce = useReducedMotion();

  // `useTransform` exige MotionValue sí o sí, y los hooks no pueden ir dentro
  // de un condicional: se crea un par neutro y se elige cuál se transforma.
  const neutroX = useMotionValue(50);
  const neutroY = useMotionValue(50);
  const fx = useTransform(foco?.x ?? neutroX, [0, 100], [paralaje, -paralaje]);
  const fy = useTransform(foco?.y ?? neutroY, [0, 100], [paralaje * 0.6, -paralaje * 0.6]);

  const flotar = reduce ? {} : { y: [0, -14, 0] };
  const cicloFlote = { duration: 6, repeat: Infinity, ease: 'easeInOut' as const };

  return (
    <motion.div
      className={clsx('relative select-none', className)}
      style={foco && !reduce ? { x: fx, y: fy } : undefined}
      initial={{ scale: 0.88, y: 28 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {halo && (
        <motion.div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                     w-[115%] aspect-square rounded-full blur-3xl
                     bg-[radial-gradient(circle,rgba(16,212,81,0.38),rgba(179,61,158,0.18)_55%,transparent_72%)]"
          animate={reduce ? {} : { scale: [1, 1.12, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          style={{ willChange: 'transform, opacity' }}
        />
      )}

      <motion.div
        className="relative"
        animate={flotar}
        transition={cicloFlote}
        style={{ willChange: 'transform' }}
      >
        {/* El saludo al pasar el ratón: la mascota tiene el brazo en alto, así
            que un giro corto desde el pie (origen abajo) se lee como que se
            inclina hacia quien la mira. */}
        <motion.img
          src={CALISTO_ART}
          alt="Calisto"
          draggable={false}
          className={clsx(
            'w-full h-auto',
            halo
              ? 'drop-shadow-[0_28px_45px_rgba(0,0,0,0.45)]'
              : 'drop-shadow-[0_6px_10px_rgba(0,0,0,0.22)]',
          )}
          style={{ originY: 1 }}
          whileHover={reduce ? undefined : { rotate: -3, scale: 1.035 }}
          transition={{ type: 'spring', damping: 12, stiffness: 220 }}
        />
      </motion.div>

      {/* Sombra de contacto. Va en contrafase con el flote: cuando el cuerpo
          sube, se estrecha y se aclara. */}
      {halo && (
        <motion.div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 bottom-[-2%] w-[52%] h-[5%]
                     rounded-[100%] bg-black/45 blur-md"
          animate={reduce ? {} : { scaleX: [1, 0.82, 1], opacity: [0.45, 0.24, 0.45] }}
          transition={cicloFlote}
          style={{ willChange: 'transform, opacity' }}
        />
      )}
    </motion.div>
  );
}

interface LogoProps {
  /** Lado del icono en píxeles. */
  size?: number;
  className?: string;
}

/**
 * Icono de la aplicación: el rostro de Calisto sobre fondo oscuro. A tamaños
 * de riel (32–44 px) el cuerpo entero se convierte en una mancha verde, así
 * que la marca pequeña usa el recorte de la cara, que sí sobrevive al tamaño.
 */
export function IconoCalisto({ size = 36, className }: LogoProps) {
  return (
    <img
      src={CALISTO_ICONO}
      alt="Calisto"
      width={size}
      height={size}
      draggable={false}
      className={clsx('shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-black/5 dark:ring-white/10', className)}
      style={{ width: size, height: size }}
    />
  );
}

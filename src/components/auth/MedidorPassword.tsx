import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

/** Mínimo que acepta Supabase; por debajo de esto ni se intenta guardar. */
export const LARGO_MINIMO = 6;

interface Regla {
  id: string;
  cumple: (v: string) => boolean;
}

const REGLAS: Regla[] = [
  { id: 'reqLength', cumple: (v) => v.length >= 8 },
  { id: 'reqCase', cumple: (v) => /[a-záéíóúñ]/.test(v) && /[A-ZÁÉÍÓÚÑ]/.test(v) },
  { id: 'reqNumber', cumple: (v) => /\d/.test(v) },
  { id: 'reqSymbol', cumple: (v) => /[^\w\s]/.test(v) },
];

/** 0–4: cuántas de las cuatro reglas cumple. */
export function fuerzaPassword(v: string) {
  return REGLAS.filter((r) => r.cumple(v)).length;
}

const COLORES = [
  'bg-danger',
  'bg-danger',
  'bg-warning',
  'bg-brand-400',
  'bg-brand-500',
];

/**
 * Medidor de contraseña: cuatro segmentos y la lista de lo que falta.
 *
 * La lista de requisitos se muestra siempre en vez de aparecer solo al fallar,
 * porque el objetivo es que la persona escriba una buena contraseña a la
 * primera, no enterarse de las reglas después de que el formulario la rechace.
 * Ninguna de las cuatro reglas es obligatoria salvo el largo mínimo: son guía,
 * y bloquear por ellas solo consigue que la gente escriba "Password1!".
 */
export function MedidorPassword({ valor }: { valor: string }) {
  const { t } = useTranslation();
  const fuerza = fuerzaPassword(valor);
  const corta = valor.length < LARGO_MINIMO;
  // Con menos del mínimo no importa qué reglas cumpla: no se puede guardar, y
  // pintar "Fuerte" en una de 4 caracteres sería mentir.
  const nivel = corta ? Math.min(fuerza, 1) : fuerza;

  if (!valor) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="overflow-hidden"
    >
      <div className="pt-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-1.5 flex-1 rounded-full bg-ink-200/80 dark:bg-white/10 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${COLORES[nivel]}`}
                  initial={false}
                  animate={{ width: i < nivel ? '100%' : '0%' }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            ))}
          </div>
          <span className="text-[11px] font-semibold text-ink-400 tabular-nums shrink-0">
            {t(`password.strength${nivel}`)}
          </span>
        </div>

        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {REGLAS.map((r) => {
            const ok = r.cumple(valor);
            return (
              <li
                key={r.id}
                className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                  ok ? 'text-brand-600 dark:text-brand-300' : 'text-ink-400'
                }`}
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full grid place-items-center shrink-0 transition-colors ${
                    ok ? 'bg-brand-500 text-white' : 'bg-ink-200/80 dark:bg-white/10'
                  }`}
                >
                  {ok && <Check size={9} strokeWidth={3.5} />}
                </span>
                {t(`password.${r.id}`)}
              </li>
            );
          })}
        </ul>
      </div>
    </motion.div>
  );
}

/**
 * Barra de filtros de los listados grandes (Colaboradores, Inventario, Tickets,
 * Líneas móviles).
 *
 * Nació de un problema de ancho: con el buscador y los siete filtros en la
 * misma línea, los desplegables —cada uno con su `min-w` a mano— se comían todo
 * y dejaban el buscador reducido a un cuadrado con la lupa, con el conmutador
 * de vista descolgado en una segunda línea. De ahí la forma que tiene:
 *
 *   · Arriba, solo lo que se usa siempre: escribir y elegir cómo mirar.
 *   · Abajo, los filtros en una rejilla `auto-fit` que se reparte el ancho
 *     disponible: con la pantalla ancha son columnas iguales y alineadas, con
 *     la angosta bajan de línea solas. Nunca se desbordan ni encogen nada.
 *   · Cada filtro con su etiqueta encima, porque un "Todos" suelto no dice de
 *     qué es, y resaltado cuando está puesto.
 *
 * Los filtros se describen en datos (`campos`) en vez de escribirse uno a uno:
 * es lo que permite que la rejilla cuadre cuando alguno no aparece (el de país
 * depende de quién mire, el de hoja de cuántas hojas trajo el Excel).
 */

import { useId, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SearchInput } from './SearchInput';
import { Select, type SelectOption } from './Select';

export interface CampoFiltro {
  id: string;
  /** Etiqueta gris sobre el control: "Estado", "Sede", "Ordenar por"… */
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  /** ¿Está puesto? Resalta el control. El de ordenar nunca lo está: no filtra. */
  activo?: boolean;
}

export interface ChipFiltro {
  id: string;
  texto: string;
  quitar: () => void;
}

export interface OpcionVista {
  valor: string;
  icono: LucideIcon;
  titulo: string;
}

interface Props {
  q: string;
  onQ: (v: string) => void;
  placeholder?: string;
  campos: CampoFiltro[];
  /** Filtros activos, quitables uno a uno. Sin ellos no se pinta la fila. */
  chips?: ChipFiltro[];
  onLimpiar?: () => void;
  vistas?: OpcionVista[];
  vista?: string;
  onVista?: (v: string) => void;
  /** Atajo "/" para saltar al buscador. Solo una barra por pantalla debe tenerlo. */
  atajo?: boolean;
  /** Avisos propios de la pantalla, dentro de la misma tarjeta (ej. contratos vencidos). */
  children?: ReactNode;
}

export function BarraFiltros({
  q, onQ, placeholder, campos, chips = [], onLimpiar, vistas, vista, onVista, atajo = true, children,
}: Props) {
  const { t } = useTranslation();
  // La pastilla del conmutador se desplaza con `layoutId`, que es global: dos
  // barras en la misma pantalla compartirían la animación sin este id propio.
  const idVista = useId();

  return (
    <div className="card mb-5 overflow-hidden">
      <div className="flex items-stretch gap-2 p-3">
        <SearchInput value={q} onChange={onQ} placeholder={placeholder} atajo={atajo} />

        {vistas && vistas.length > 0 && (
          <div className="flex shrink-0 rounded-xl bg-ink-100 dark:bg-white/5 p-1">
            {vistas.map((v) => (
              <button
                key={v.valor}
                onClick={() => onVista?.(v.valor)}
                aria-label={v.titulo}
                title={v.titulo}
                aria-pressed={vista === v.valor}
                className={`relative grid place-items-center rounded-lg px-3 transition-colors ${
                  vista === v.valor
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200'
                }`}
              >
                {/* La pastilla se desplaza entre los botones en vez de
                    encenderse y apagarse: el cambio de vista se ve venir. */}
                {vista === v.valor && (
                  <motion.span
                    layoutId={`vista-${idVista}`}
                    transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                    className="absolute inset-0 rounded-lg bg-white dark:bg-ink-700 shadow-sm"
                  />
                )}
                <v.icono size={16} className="relative" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-ink-100 dark:border-white/5 bg-ink-50/60 dark:bg-white/[0.02] px-3 py-3">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
          {campos.map((c) => (
            <div key={c.id} className="min-w-0">
              <label className="block px-0.5 pb-1 text-[11px] font-medium text-ink-400 truncate">{c.label}</label>
              <Select
                value={c.value} onChange={c.onChange} options={c.options}
                // El filtro puesto se distingue del que está en "todos" sin
                // tener que leerlo: el borde ya lo dice.
                className={c.activo ? 'border-brand-400/60 bg-brand-500/[0.06] text-brand-700 dark:text-brand-200' : ''}
              />
            </div>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {chips.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-1.5 pt-3">
                {chips.map((c) => (
                  <motion.button
                    key={c.id} layout
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    onClick={c.quitar}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 transition-colors"
                  >
                    <span className="max-w-[14rem] truncate">{c.texto}</span> <X size={11} className="shrink-0" />
                  </motion.button>
                ))}
                {onLimpiar && (
                  <button onClick={onLimpiar} className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 px-1.5">
                    {t('common.clearFilters')}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {children}
      </div>
    </div>
  );
}

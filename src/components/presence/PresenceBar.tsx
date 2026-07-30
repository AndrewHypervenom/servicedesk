import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Radio } from 'lucide-react';
import { usePeersEnLinea } from '@/lib/presence/hooks';
import { usePresence } from '@/store/presence';
import { destinoSeguro } from '@/lib/presence/visibilidad';
import { descripcionPeer } from '@/lib/presence/vistas';
import type { Peer } from '@/lib/presence/tipos';
import { PeerAvatar } from './PeerAvatar';

const MAX_AVATARES = 4;

/**
 * Barra de presencia: pila de avatares (incluido el tuyo, marcado "Tú") con un
 * panel rico y clicable — cada persona muestra su rol y en qué vista está, y un
 * botón para ir a su área. Responsive: dropdown anclado en escritorio, hoja a
 * pantalla completa en móvil.
 */
export function PresenceBar() {
  const otros = usePeersEnLinea();
  const yo = usePresence((s) => s.yo);
  const [abierto, setAbierto] = useState(false);
  const navigate = useNavigate();

  // Orden: yo primero, luego quienes editan, luego el resto por nombre.
  const lista = useMemo(() => {
    if (!yo) return [];
    const ordenados = [...otros].sort((a, b) => {
      const ea = a.activity?.mode === 'edit' ? 0 : 1;
      const eb = b.activity?.mode === 'edit' ? 0 : 1;
      return ea - eb || a.nombre.localeCompare(b.nombre);
    });
    return [yo, ...ordenados];
  }, [yo, otros]);

  if (!yo) return null; // aún sin conectar

  const visibles = lista.slice(0, MAX_AVATARES);
  const resto = lista.length - visibles.length;
  const totalOtros = otros.length;

  return (
    <div className="relative">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={totalOtros > 0 ? `${lista.length} personas en línea` : 'Solo tú en línea'}
        className="group flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1.5 sm:pr-2 transition-colors hover:bg-ink-100/70 dark:hover:bg-white/5"
      >
        <div className="flex -space-x-2.5">
          {visibles.map((p) => (
            <PeerAvatar key={p.user_id} peer={p} size="sm" dot={false} />
          ))}
          {resto > 0 && (
            <div className="grid place-items-center w-7 h-7 rounded-full bg-ink-200 dark:bg-white/15 text-[10px] font-bold text-ink-600 dark:text-ink-200 ring-2 ring-white dark:ring-ink-900">
              +{resto}
            </div>
          )}
        </div>
        {/* Contador "en vivo" con punto verde. */}
        <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-500 dark:text-ink-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {totalOtros > 0 ? lista.length : ''}
        </span>
      </button>

      <AnimatePresence>
        {abierto && (
          <>
            {/* Backdrop: sutil en escritorio, con desenfoque en móvil. */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-ink-900/20 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-0"
              onClick={() => setAbierto(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 340 }}
              className="fixed left-3 right-3 top-[4.25rem] z-50 origin-top overflow-hidden rounded-2xl
                         sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80
                         card !p-0 shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
            >
              <div className="flex items-center gap-2 px-4 py-3 border-b border-ink-100 dark:border-white/5">
                <Radio size={15} className="text-emerald-500" />
                <span className="text-sm font-semibold">En línea ahora</span>
                <span className="ml-auto text-xs font-medium text-ink-400 tabular-nums">
                  {totalOtros > 0 ? lista.length : 'Solo tú'}
                </span>
              </div>

              <div className="max-h-[60vh] sm:max-h-[24rem] overflow-y-auto p-1.5">
                {lista.map((p) => (
                  <FilaPeer
                    key={p.user_id}
                    peer={p}
                    soyYo={p.user_id === yo.user_id}
                    onIr={(destino) => { navigate(destino); setAbierto(false); }}
                  />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilaPeer({ peer, soyYo, onIr }: {
  peer: Peer;
  soyYo: boolean;
  onIr: (destino: string) => void;
}) {
  const { t } = useTranslation();
  const { label, Icon, editando } = descripcionPeer(peer);
  // Puedo "ir" si no soy yo y tiene una vista visible para mí (la del ADMIN
  // llega saneada a ruta null para roles inferiores, así que no habrá botón).
  const puedeIr = !soyYo && !!peer.route;

  return (
    <div className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-ink-50 dark:hover:bg-white/5">
      <PeerAvatar peer={peer} size="md" ring={false} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{peer.nombre}</span>
          {soyYo && <span className="text-[10px] font-semibold text-brand-600 dark:text-brand-400">Tú</span>}
          <span className="ml-auto shrink-0 rounded-md bg-ink-100 dark:bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink-500 dark:text-ink-300">
            {t(`rol.${peer.rol}`)}
          </span>
        </div>
        <div className={`mt-0.5 flex items-center gap-1 text-[11px] truncate ${
          editando ? 'text-amber-600 dark:text-amber-400' : 'text-ink-400'
        }`}>
          <Icon size={11} className="shrink-0" />
          <span className="truncate">{label}</span>
        </div>
      </div>

      {puedeIr && (
        <button
          onClick={() => onIr(destinoSeguro(peer))}
          title="Ir a su área"
          className="shrink-0 grid place-items-center w-7 h-7 rounded-lg text-ink-400 hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

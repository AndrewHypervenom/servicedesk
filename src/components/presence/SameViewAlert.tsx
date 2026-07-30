import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronUp, Users } from 'lucide-react';
import { usePeersEnMiVista } from '@/lib/presence/hooks';
import { vistaDeRuta, descripcionPeer } from '@/lib/presence/vistas';
import { PeerAvatar } from './PeerAvatar';

/**
 * Indicador colapsable, abajo a la izquierda: cuando otra persona visible está
 * en TU misma vista, aparece una pastilla compacta con sus avatares. Al hacer
 * clic se despliega HACIA ARRIBA la lista de quiénes son (con scroll y altura
 * acotada para móvil). No hay que descartarla: se colapsa/expande, y desaparece
 * sola cuando dejas de coincidir con alguien.
 */
export function SameViewAlert() {
  const { t } = useTranslation();
  const peers = usePeersEnMiVista();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [expandido, setExpandido] = useState(false);

  // Al cambiar de vista se colapsa: cada pantalla empieza recogida.
  useEffect(() => { setExpandido(false); }, [pathname]);

  const hay = peers.length > 0;
  const alguienEdita = peers.some((p) => p.activity?.mode === 'edit');
  const vista = vistaDeRuta(pathname);

  return (
    // En móvil pegado a la izquierda (el sidebar está oculto); en desktop,
    // desplazado a la derecha del sidebar (260px) para no quedar debajo de él.
    <div className="fixed bottom-4 left-4 lg:left-[calc(260px+1.25rem)] z-40 flex flex-col items-start gap-2 print:hidden">
      <AnimatePresence>
        {hay && expandido && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="w-[calc(100vw-2rem)] max-w-xs origin-bottom-left overflow-hidden rounded-2xl
                       bg-white/95 dark:bg-ink-800/95 backdrop-blur-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-100 dark:border-white/5">
              <vista.Icon size={14} className="text-brand-500 shrink-0" />
              <span className="text-sm font-semibold truncate">En esta vista</span>
              <span className="ml-auto text-xs font-medium text-ink-400 tabular-nums">{peers.length}</span>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-1.5">
              {peers.map((p) => {
                const { label, editando } = descripcionPeer(p);
                return (
                  <button
                    key={p.user_id}
                    onClick={() => p.route && navigate(p.route)}
                    disabled={!p.route}
                    className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-ink-50 dark:hover:bg-white/5 disabled:cursor-default"
                  >
                    <PeerAvatar peer={p} size="md" ring={false} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{p.nombre}</span>
                        <span className="ml-auto shrink-0 rounded-md bg-ink-100 dark:bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink-500 dark:text-ink-300">
                          {t(`rol.${p.rol}`)}
                        </span>
                      </div>
                      <div className={`text-[11px] truncate ${editando ? 'text-amber-600 dark:text-amber-400' : 'text-ink-400'}`}>
                        {editando ? label : 'Viendo lo mismo que tú'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pastilla compacta (colapsada por defecto). */}
      <AnimatePresence>
        {hay && (
          <motion.button
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            onClick={() => setExpandido((v) => !v)}
            aria-expanded={expandido}
            title={expandido ? 'Colapsar' : 'Ver quién está en esta vista'}
            className={`flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 shadow-xl ring-1 backdrop-blur-xl transition-colors ${
              alguienEdita
                ? 'bg-amber-500/15 ring-amber-500/30 dark:bg-amber-400/10'
                : 'bg-white/95 dark:bg-ink-800/95 ring-black/5 dark:ring-white/10'
            }`}
          >
            <span className={`grid place-items-center w-6 h-6 rounded-full shrink-0 ${
              alguienEdita ? 'text-amber-600 dark:text-amber-400' : 'text-brand-600 dark:text-brand-400'
            }`}>
              <Users size={15} />
            </span>
            <div className="flex -space-x-2">
              {peers.slice(0, 3).map((p) => <PeerAvatar key={p.user_id} peer={p} size="sm" dot={false} />)}
              {peers.length > 3 && (
                <span className="grid place-items-center w-7 h-7 rounded-full bg-ink-200 dark:bg-white/15 text-[10px] font-bold text-ink-600 dark:text-ink-200 ring-2 ring-white dark:ring-ink-900">
                  +{peers.length - 3}
                </span>
              )}
            </div>
            <span className="hidden sm:inline text-xs font-semibold text-ink-600 dark:text-ink-200 whitespace-nowrap">
              {alguienEdita ? 'También editando aquí' : 'En esta vista'}
            </span>
            <ChevronUp
              size={15}
              className={`text-ink-400 transition-transform ${expandido ? 'rotate-180' : ''}`}
            />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PresenceSync, SameViewAlert } from '@/components/presence';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="relative min-h-screen flex bg-ink-50 dark:bg-ink-900 bg-grid">
      {/* Presencia en tiempo real: conecta al canal, emite ruta/actividad y
          desconecta al cerrar sesión. No pinta nada. */}
      <PresenceSync />
      {/* Aviso flotante cuando coincides con alguien en la misma vista. */}
      <SameViewAlert />

      <div className="aurora" aria-hidden>
        <span />
        <span />
      </div>

      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          {/* La `key` remonta el subárbol en cada ruta: reinicia la animación
              de entrada y, de paso, el estado del límite de error, de modo que
              una página rota deja de estarlo al navegar a otra.

              Ya no hay AnimatePresence aquí. Sostener la página saliente
              obligaba a `mode="wait"`, que solo pinta la entrante cuando la
              saliente avisa de que terminó de animarse — un aviso que depende
              del bucle de rAF de framer-motion y que, si ese bucle está parado,
              no llega nunca. El precio de quitarlo es perder la animación de
              salida (0.18s); a cambio, que la vista aparezca deja de depender
              de que una animación termine. */}
          <div key={pathname} className="page-enter">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}

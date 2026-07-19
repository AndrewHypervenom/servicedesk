import { useState } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { PageTransition } from './PageTransition';

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // `useOutlet()` en vez de `<Outlet />`: devuelve el elemento de la ruta como
  // valor, de modo que AnimatePresence puede conservar el saliente montado
  // mientras se anima. Con <Outlet /> el router lo sustituye de golpe y la
  // animación de salida nunca llega a verse.
  const outlet = useOutlet();

  return (
    <div className="relative min-h-screen flex bg-ink-50 dark:bg-ink-900 bg-grid">
      <div className="aurora" aria-hidden>
        <span />
        <span />
      </div>

      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="flex-1 px-4 lg:px-8 py-6 max-w-[1400px] w-full mx-auto">
          <AnimatePresence mode="wait" initial={false}>
            <PageTransition key={pathname}>{outlet}</PageTransition>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

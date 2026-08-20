import { useTranslation } from 'react-i18next';
import { Menu, Sun, Moon, Monitor, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp } from '@/store/useApp';
import { PresenceBar } from '@/components/presence';
import { initials } from '@/lib/format';
import { useState } from 'react';
import clsx from 'clsx';

const IDIOMAS = [
  { v: 'es', label: 'ES', title: 'Español' },
  { v: 'pt', label: 'PT', title: 'Português' },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const { perfil, theme, setTheme, idioma, setIdioma, signOut } = useApp();
  const [menu, setMenu] = useState(false);

  const TEMAS = [
    { v: 'light', Icon: Sun, label: t('settings.light') },
    { v: 'dark', Icon: Moon, label: t('settings.dark') },
    { v: 'system', Icon: Monitor, label: t('settings.system') },
  ] as const;

  // Riel base compartido por los dos segmentos, para que idioma y tema se lean
  // como un solo sistema y no como dos controles sueltos.
  const riel = 'flex items-center gap-0.5 rounded-xl bg-ink-100/70 dark:bg-white/[0.06] p-1 ring-1 ring-inset ring-ink-200/60 dark:ring-white/10';
  const pastilla = 'absolute inset-0 rounded-lg bg-white dark:bg-ink-800 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/10';
  const muelle = { type: 'spring' as const, damping: 28, stiffness: 360 };

  return (
    <header className="sticky top-0 z-20 h-16 glass border-b border-white/30 dark:border-white/10 flex items-center gap-2.5 px-4 lg:px-6">
      <button onClick={onMenu} className="btn-ghost !p-2 lg:hidden"><Menu size={20} /></button>

      <div className="flex-1" />

      {/* Quién está en línea (presencia en tiempo real) */}
      <PresenceBar />

      {/* Idioma */}
      <div className={riel}>
        {IDIOMAS.map(({ v, label, title }) => (
          <button key={v} onClick={() => setIdioma(v)} title={title} aria-pressed={idioma === v}
            className={clsx('relative px-2.5 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-colors duration-200',
              idioma === v ? 'text-brand-600 dark:text-brand-300' : 'text-ink-500 hover:text-ink-800 dark:hover:text-white')}>
            {idioma === v && <motion.span layoutId="lang-pill" className={pastilla} transition={muelle} />}
            <span className="relative z-10">{label}</span>
          </button>
        ))}
      </div>

      {/* Tema */}
      <div className={riel}>
        {TEMAS.map(({ v, Icon, label }) => (
          <button key={v} onClick={() => setTheme(v)} title={label} aria-pressed={theme === v}
            className={clsx('relative p-1.5 rounded-lg transition-colors duration-200',
              theme === v ? 'text-brand-600 dark:text-brand-300' : 'text-ink-400 hover:text-ink-700 dark:hover:text-white')}>
            {theme === v && <motion.span layoutId="theme-pill" className={pastilla} transition={muelle} />}
            <Icon size={16} className="relative z-10" />
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-ink-200/70 dark:bg-white/10 mx-0.5" />

      <div className="relative">
        <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-ink-100/70 dark:hover:bg-white/5">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center text-xs font-bold">
            {/* Las iniciales son el respaldo de siempre: quien no ha subido
                foto sigue viendo exactamente lo mismo que antes. */}
            {perfil?.avatar_url
              ? <img src={perfil.avatar_url} alt="" className="w-full h-full object-cover" />
              : initials(perfil?.nombre)}
          </div>
          <div className="hidden sm:block text-left leading-tight">
            <div className="text-sm font-medium">{perfil?.nombre}</div>
            <div className="text-[11px] text-ink-400">{t(`rol.${perfil?.rol}`)}</div>
          </div>
        </button>

        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div className="absolute right-0 mt-2 w-56 card p-1.5 z-20 animate-slide-up">
              <div className="px-3 py-2 border-b border-ink-100 dark:border-white/5">
                <div className="text-sm font-medium">{perfil?.nombre}</div>
                <div className="text-xs text-ink-400">{perfil?.correo}</div>
              </div>
              <button onClick={() => { signOut(); setMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger/10 mt-1">
                <LogOut size={16} /> {t('auth.logout')}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

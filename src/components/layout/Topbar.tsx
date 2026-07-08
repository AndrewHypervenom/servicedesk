import { useTranslation } from 'react-i18next';
import { Menu, Sun, Moon, Monitor, LogOut, Languages } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { initials } from '@/lib/format';
import { useState } from 'react';
import clsx from 'clsx';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const { perfil, theme, setTheme, idioma, setIdioma, signOut } = useApp();
  const [menu, setMenu] = useState(false);

  return (
    <header className="sticky top-0 z-20 h-16 glass border-b border-white/30 dark:border-white/10 flex items-center gap-3 px-4 lg:px-6">
      <button onClick={onMenu} className="btn-ghost !p-2 lg:hidden"><Menu size={20} /></button>

      <div className="flex-1" />

      <div className="flex items-center rounded-xl bg-ink-100 dark:bg-ink-700 p-0.5">
        {['es', 'pt'].map((l) => (
          <button key={l} onClick={() => setIdioma(l)}
            className={clsx('px-2.5 py-1 rounded-lg text-xs font-semibold uppercase transition-colors',
              idioma === l ? 'bg-white dark:bg-ink-900 text-brand-600 shadow-sm' : 'text-ink-500')}>
            {l}
          </button>
        ))}
      </div>

      <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
        className="btn-ghost !p-2" title={t('settings.theme')}>
        {theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}
      </button>

      <div className="relative">
        <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-ink-100/70 dark:hover:bg-white/5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center text-xs font-bold">
            {initials(perfil?.nombre)}
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

import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { ROLES_EDICION } from '@/lib/roles';
import i18n from '@/i18n';
import type { Perfil, RolUsuario } from '@/types';

type Theme = 'light' | 'dark' | 'system';

interface AppState {
  perfil: Perfil | null;
  loading: boolean;
  theme: Theme;
  idioma: string;
  init: () => Promise<void>;
  updatePerfil: (patch: Partial<Perfil>) => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, nombre: string) => Promise<void>;
  signOut: () => Promise<void>;
  setTheme: (t: Theme) => void;
  setIdioma: (l: string) => void;
  can: (...roles: RolUsuario[]) => boolean;
  canEdit: () => boolean;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
}

export const useApp = create<AppState>((set, get) => ({
  perfil: null,
  loading: true,
  theme: (localStorage.getItem('theme') as Theme) || 'system',
  idioma: localStorage.getItem('idioma') || 'es',

  init: async () => {
    applyTheme(get().theme);
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', data.session.user.id).single();
      set({ perfil: perfil as Perfil });
    }
    supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session) {
        const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
        set({ perfil: perfil as Perfil });
      } else {
        set({ perfil: null });
      }
    });
    set({ loading: false });
  },

  updatePerfil: async (patch) => {
    const actual = get().perfil;
    if (!actual) return;
    const nuevo = { ...actual, ...patch };
    set({ perfil: nuevo });
    const { error } = await supabase.from('perfiles').update(patch).eq('id', actual.id);
    if (error) throw error;
  },

  signIn: async (email, pass) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  },
  signUp: async (email, pass, nombre) => {
    const { error } = await supabase.auth.signUp({ email, password: pass, options: { data: { nombre } } });
    if (error) throw error;
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ perfil: null });
  },

  setTheme: (t) => { localStorage.setItem('theme', t); applyTheme(t); set({ theme: t }); },
  setIdioma: (l) => { localStorage.setItem('idioma', l); i18n.changeLanguage(l); set({ idioma: l }); },

  can: (...roles) => { const r = get().perfil?.rol; return !!r && roles.includes(r); },
  canEdit: () => { const r = get().perfil?.rol; return !!r && ROLES_EDICION.includes(r); },
}));

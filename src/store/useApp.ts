import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { ROLES_EDICION } from '@/lib/roles';
import i18n from '@/i18n';
import type { Perfil, RolUsuario } from '@/types';

type Theme = 'light' | 'dark' | 'system';

interface AppState {
  perfil: Perfil | null;
  misSedes: string[];
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
  /** ADMIN y Jefe (LIDER) no están atados a una ciudad. */
  operaTodasLasSedes: () => boolean;
  /** ¿Puede asignarle equipos a un colaborador de esta sede? */
  puedeAsignarASede: (sedeId?: string | null) => boolean;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
}

/** Perfil + las sedes en las que puede operar (la principal y las adicionales). */
async function cargarPerfil(userId: string) {
  const [{ data: perfil }, { data: extra }] = await Promise.all([
    supabase.from('perfiles').select('*').eq('id', userId).single(),
    supabase.from('perfil_sedes').select('sede_id').eq('perfil_id', userId),
  ]);
  const sedes = new Set((extra ?? []).map((s: { sede_id: string }) => s.sede_id));
  if (perfil?.sede_id) sedes.add(perfil.sede_id);
  return { perfil: perfil as Perfil, misSedes: [...sedes] };
}

export const useApp = create<AppState>((set, get) => ({
  perfil: null,
  misSedes: [],
  loading: true,
  theme: (localStorage.getItem('theme') as Theme) || 'system',
  idioma: localStorage.getItem('idioma') || 'es',

  init: async () => {
    applyTheme(get().theme);
    const { data } = await supabase.auth.getSession();
    if (data.session) set(await cargarPerfil(data.session.user.id));
    supabase.auth.onAuthStateChange(async (_e, session) => {
      if (session) set(await cargarPerfil(session.user.id));
      else set({ perfil: null, misSedes: [] });
    });
    set({ loading: false });
  },

  updatePerfil: async (patch) => {
    const actual = get().perfil;
    if (!actual) return;
    // Escribir primero y confirmar contra la fila devuelta. Si la RLS impide la
    // escritura, PostgREST responde 403 o actualiza 0 filas (data vacío): en
    // ambos casos lanzamos, para no dejar el store mostrando un cambio que la
    // base nunca guardó (antes se hacía de forma optimista y la UI mentía).
    const { data, error } = await supabase
      .from('perfiles').update(patch).eq('id', actual.id).select().maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(i18n.t('settings.profileSaveDenied'));
    set({ perfil: { ...actual, ...(data as Perfil) } });
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
    set({ perfil: null, misSedes: [] });
  },

  setTheme: (t) => { localStorage.setItem('theme', t); applyTheme(t); set({ theme: t }); },
  setIdioma: (l) => { localStorage.setItem('idioma', l); i18n.changeLanguage(l); set({ idioma: l }); },

  can: (...roles) => { const r = get().perfil?.rol; return !!r && roles.includes(r); },
  canEdit: () => { const r = get().perfil?.rol; return !!r && ROLES_EDICION.includes(r); },

  operaTodasLasSedes: () => { const r = get().perfil?.rol; return r === 'ADMIN' || r === 'LIDER'; },
  puedeAsignarASede: (sedeId) => {
    if (get().operaTodasLasSedes()) return true;
    return !!sedeId && get().misSedes.includes(sedeId);
  },
}));

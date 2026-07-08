import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon || url.includes('xxxx') || anon.length < 20) {
  throw new Error(
    'Faltan credenciales reales de Supabase. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env.local',
  );
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});

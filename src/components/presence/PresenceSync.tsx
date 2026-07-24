import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useApp } from '@/store/useApp';
import { usePresence } from '@/store/presence';
import { listSedes } from '@/lib/api';
import { colorDeUsuario } from '@/lib/presence/color';
import { esGlobalRol } from '@/lib/presence/visibilidad';

/**
 * Puente entre la sesión y el canal de presencia. Va montado en la raíz de la
 * app (dentro del router y solo cuando hay perfil):
 *   - conecta al iniciar sesión y desconecta al cerrarla;
 *   - re-emite la ruta actual en cada navegación;
 *   - deriva los países de la persona (a partir de sus sedes) para el filtro.
 *
 * No pinta nada.
 */
export function PresenceSync() {
  const perfil = useApp((s) => s.perfil);
  const misSedes = useApp((s) => s.misSedes);
  const { pathname } = useLocation();

  const conectar = usePresence((s) => s.conectar);
  const desconectar = usePresence((s) => s.desconectar);
  const setRuta = usePresence((s) => s.setRuta);
  const conectado = usePresence((s) => s.conectado);

  // La lista de sedes trae el país de cada una; se cachea con react-query y se
  // comparte con el resto de la app (misma queryKey que los modales).
  const { data: sedes } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });

  const paises = useMemo<string[] | null>(() => {
    if (!perfil || !sedes) return null; // null = todavía sin datos para conectar
    const sedeAPais = new Map(sedes.map((s) => [s.id, s.pais_id]));
    const set = new Set<string>();
    const ids = [...misSedes];
    if (perfil.sede_id) ids.push(perfil.sede_id);
    for (const sid of ids) {
      const p = sedeAPais.get(sid);
      if (p) set.add(p);
    }
    return [...set];
  }, [perfil, sedes, misSedes]);

  // Clave estable: reconecta solo si cambia la persona, su rol o sus países.
  // La ruta NO entra aquí a propósito (navegar no debe reabrir el canal).
  const clave = perfil && paises ? `${perfil.id}|${perfil.rol}|${paises.join(',')}` : null;

  useEffect(() => {
    if (!perfil || !paises) return;
    conectar(
      {
        user_id: perfil.id,
        nombre: perfil.nombre,
        rol: perfil.rol,
        avatar_url: perfil.avatar_url,
        color: colorDeUsuario(perfil.id),
        paises,
        esGlobal: esGlobalRol(perfil.rol),
        invisible: perfil.rol === 'ADMIN',
      },
      pathname,
    );
    return () => desconectar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    if (conectado) setRuta(pathname);
  }, [pathname, conectado, setRuta]);

  return null;
}

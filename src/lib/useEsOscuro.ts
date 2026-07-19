import { useState, useEffect } from 'react';

/**
 * Sigue la clase `dark` del elemento raíz, que es donde el store aplica el tema.
 *
 * Hace falta como estado de React (y no leer la clase al vuelo) porque los
 * colores de los gráficos son props de Recharts: si el tema cambia y no hay
 * re-render, las series se quedan con los colores del tema anterior.
 */
export function useEsOscuro() {
  const [oscuro, setOscuro] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const obs = new MutationObserver(() =>
      setOscuro(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  return oscuro;
}

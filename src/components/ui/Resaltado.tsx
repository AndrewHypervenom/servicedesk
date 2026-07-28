/**
 * Marca dentro de un texto el trozo que casó con lo que se buscó.
 *
 * Sin esto, un resultado de búsqueda obliga a releer la línea entera para
 * entender por qué está ahí; con esto, el ojo lo encuentra solo.
 */

import { useMemo } from 'react';
import { partirResaltado } from '@/lib/colaboradores/buscar';

interface Props {
  texto: string | null | undefined;
  /** Términos ya normalizados (`terminosDe`). */
  terminos: string[];
}

export function Resaltado({ texto, terminos }: Props) {
  const segmentos = useMemo(() => partirResaltado(texto ?? '', terminos), [texto, terminos]);
  return (
    <>
      {segmentos.map((s, i) => (s.hit ? (
        <mark
          key={i}
          className="rounded-[3px] bg-brand-500/20 px-0.5 font-semibold text-brand-700 dark:bg-brand-400/25 dark:text-brand-200"
        >
          {s.texto}
        </mark>
      ) : (
        <span key={i}>{s.texto}</span>
      )))}
    </>
  );
}

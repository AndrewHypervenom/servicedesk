import { usePeersDeRecurso } from '@/lib/presence/hooks';
import { PeerAvatar } from './PeerAvatar';

/**
 * Chip para un ítem de lista: pinta los avatares de quién tiene ese recurso
 * abierto ahora mismo. De solo lectura — no declara actividad propia. Se apoya
 * en `usePeersDeRecurso`, así que respeta el filtro de visibilidad por rol/país.
 */
export function ResourcePeersChip({ type, id, size = 'sm' }: {
  type: string;
  id: string;
  size?: 'sm' | 'md';
}) {
  const peers = usePeersDeRecurso(type, id);
  if (peers.length === 0) return null;

  return (
    <div className="flex -space-x-1.5" aria-label={`${peers.length} en este recurso`}>
      {peers.slice(0, 3).map((p) => (
        <PeerAvatar key={p.user_id} peer={p} size={size} dot={false} />
      ))}
    </div>
  );
}

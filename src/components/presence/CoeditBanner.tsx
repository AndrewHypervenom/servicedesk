import { AlertTriangle, Eye } from 'lucide-react';
import type { Peer } from '@/lib/presence/tipos';
import { PeerAvatar } from './PeerAvatar';

/**
 * "Fulano también está aquí". Avisa cuando otra persona tiene el mismo recurso
 * abierto, para que dos guardados no se pisen. Se pinta en ámbar cuando alguno
 * está EDITANDO (choque real) y en tono neutro cuando solo lo están mirando.
 */
export function CoeditBanner({ peers, className = '' }: { peers: Peer[]; className?: string }) {
  if (peers.length === 0) return null;

  const editando = peers.filter((p) => p.activity?.mode === 'edit');
  const hayChoque = editando.length > 0;
  const relevantes = hayChoque ? editando : peers;

  const nombres = relevantes.map((p) => p.nombre);
  const texto =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
        hayChoque
          ? 'border-warning/30 bg-warning/[0.08] text-amber-700 dark:text-warning'
          : 'border-ink-200/60 dark:border-white/10 bg-ink-50 dark:bg-white/5 text-ink-600 dark:text-ink-300'
      } ${className}`}
    >
      {hayChoque
        ? <AlertTriangle size={18} className="shrink-0" />
        : <Eye size={18} className="shrink-0 text-ink-400" />}
      <div className="flex -space-x-2 shrink-0">
        {relevantes.slice(0, 3).map((p) => <PeerAvatar key={p.user_id} peer={p} size="sm" />)}
      </div>
      <p className="min-w-0">
        <strong className="font-semibold">{texto}</strong>{' '}
        {hayChoque
          ? relevantes.length === 1
            ? 'también está editando esto. Coordina antes de guardar para no pisar sus cambios.'
            : 'también lo están editando. Coordina antes de guardar para no pisar cambios.'
          : relevantes.length === 1
            ? 'también tiene esto abierto.'
            : 'también lo tienen abierto.'}
      </p>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { initials } from '@/lib/format';
import { descripcionPeer } from '@/lib/presence/vistas';
import type { Peer } from '@/lib/presence/tipos';

const TAMANOS = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-7 h-7 text-[11px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
} as const;

const PUNTO = {
  xs: 'w-1.5 h-1.5',
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
} as const;

/**
 * Avatar circular con el color determinista de la persona, un glow suave en ese
 * mismo color y un punto de estado (ámbar si edita, verde si solo está en línea).
 */
export function PeerAvatar({ peer, size = 'md', ring = true, dot = true, title }: {
  peer: Peer;
  size?: keyof typeof TAMANOS;
  ring?: boolean;
  dot?: boolean;
  title?: string;
}) {
  const { t } = useTranslation();
  const { label, editando } = descripcionPeer(peer);
  const tooltip = title ?? `${peer.nombre} · ${t(`rol.${peer.rol}`)}\n${label}`;

  return (
    <div className="relative shrink-0" title={tooltip}>
      <div
        className={`grid place-items-center rounded-full font-bold text-white select-none overflow-hidden ${TAMANOS[size]} ${
          ring ? 'ring-2 ring-white dark:ring-ink-900' : ''
        }`}
        style={{ backgroundColor: peer.color, boxShadow: `0 2px 8px -2px ${peer.color}80` }}
      >
        {peer.avatar_url
          ? <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
          : <span className="drop-shadow-sm">{initials(peer.nombre)}</span>}
      </div>
      {dot && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white dark:ring-ink-900 ${PUNTO[size]} ${
            editando ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
        />
      )}
    </div>
  );
}

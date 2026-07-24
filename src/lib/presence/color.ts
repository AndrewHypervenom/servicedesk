/**
 * Color de avatar determinista por user_id.
 *
 * Mismo id → mismo color, siempre, en cualquier pestaña de cualquier persona.
 * Así el color es una segunda pista de identidad y no un adorno aleatorio que
 * cambia entre recargas. La paleta es fija y con contraste suficiente sobre
 * texto blanco tanto en claro como en oscuro.
 */
const PALETA = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
];

export function colorDeUsuario(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PALETA[h % PALETA.length];
}

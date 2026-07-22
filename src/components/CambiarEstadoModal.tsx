import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, AlertTriangle } from 'lucide-react';
import { cambiarEstadoEquipo } from '@/lib/api';
import { transicionesEstado } from '@/lib/estados';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import type { Equipo, EstadoAsignacion } from '@/types';

/**
 * Mueve un equipo entre estados de asignación manuales (mantenimiento, baja o
 * de vuelta a disponible). Un equipo asignado o en devolución no se cambia
 * aquí: para esos casos no se ofrece ninguna opción y se explica por qué.
 */
export function CambiarEstadoModal({ equipo, onClose, onSaved }: {
  equipo: Equipo | null; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [nuevo, setNuevo] = useState<EstadoAsignacion | null>(null);
  const [obs, setObs] = useState('');
  const [busy, setBusy] = useState(false);

  // El equipo cambia entre aperturas; se recalcula todo a partir de la prop.
  const opciones = equipo ? transicionesEstado(equipo.estado_asignacion) : [];
  const bloqueado = !!equipo && opciones.length === 0;

  const cerrar = () => { if (busy) return; setNuevo(null); setObs(''); onClose(); };

  const guardar = async () => {
    if (!equipo || !nuevo) return;
    setBusy(true);
    try {
      await cambiarEstadoEquipo({ equipoId: equipo.id, estadoNuevo: nuevo, obs: obs.trim() || undefined });
      toast.success(t('estadoCambio.exito'));
      setNuevo(null); setObs('');
      onSaved(); onClose();
    } catch (e: any) {
      toast.error(e?.message ?? t('common.error'));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={!!equipo} onClose={cerrar} size="sm"
      title={t('estadoCambio.titulo')}
      subtitle={equipo ? `${equipo.marca} ${equipo.linea_modelo} · ${equipo.serial}` : undefined}>
      {bloqueado ? (
        <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/10 border border-warning/25 text-sm leading-snug">
          <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
          <span>{t('estadoCambio.bloqueado', { estado: t(`estadoAsig.${equipo!.estado_asignacion}`).toLowerCase() })}</span>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">{t('estadoCambio.nuevo')}</label>
            <div className="space-y-1.5">
              {opciones.map((op) => {
                const on = nuevo === op;
                return (
                  <button key={op} type="button" onClick={() => setNuevo(op)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                      on ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                         : 'border-ink-100 dark:border-white/10 hover:bg-ink-50 dark:hover:bg-white/5'}`}>
                    <div className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border ${
                      on ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20'}`}>
                      {on && <Check size={13} />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t(`estadoAsig.${op}`)}</div>
                      <div className="text-xs text-ink-400 leading-snug">{t(`estadoAsigDesc.${op}`)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">{t('estadoCambio.motivo')}</label>
            <textarea className="input min-h-[60px]" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6">
        <Button disabled={busy} onClick={cerrar}>{t('common.cancel')}</Button>
        {!bloqueado && (
          <Button variant="primary" loading={busy} disabled={!nuevo} onClick={guardar}>
            {busy ? t('common.saving') : t('estadoCambio.confirmar')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

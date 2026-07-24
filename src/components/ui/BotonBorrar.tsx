import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Trash2, AlertTriangle, Loader2, EyeOff } from 'lucide-react';
import { Modal } from './Modal';
import { toast } from './Toast';
import { ocultarRegistro } from '@/lib/api';
import { puedeBorrar, borradoRequiereAprobacion } from '@/lib/roles';
import { useApp } from '@/store/useApp';
import type { EntidadBorrable } from '@/types';

interface Props {
  entidad: EntidadBorrable;
  id: string;
  /** Nombre legible; se copia en la solicitud para que el ADMIN sepa qué es. */
  etiqueta: string;
  /** Claves de react-query a invalidar tras ocultar. */
  invalidar: string[];
  className?: string;
}

export function BotonBorrar({ entidad, id, etiqueta, invalidar, className }: Props) {
  const { t } = useTranslation();
  const { perfil } = useApp();
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // El botón no se pinta para quien no puede. Esto es cosmético: lo que impide
  // de verdad la acción son las políticas RLS (ver sql/01-borrado-suave.sql).
  if (!puedeBorrar(perfil?.rol)) return null;

  const requiereAprobacion = borradoRequiereAprobacion(perfil?.rol);

  const confirmar = async () => {
    setOcupado(true);
    try {
      await ocultarRegistro({
        entidad, id, etiqueta,
        motivo: motivo.trim() || undefined,
        requiereAprobacion,
        solicitadoPor: perfil!.id,
      });
      toast.success(requiereAprobacion
        ? t('deleteRecord.removedToastApproval')
        : t('deleteRecord.removedToast'));
      invalidar.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setAbierto(false);
      setMotivo('');
    } catch (e: any) {
      toast.error(e?.message ?? t('deleteRecord.errGeneric'));
    } finally { setOcupado(false); }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
        title={requiereAprobacion ? t('deleteRecord.requestDelete') : t('deleteRecord.removeFromView')}
        className={className ?? 'btn-ghost !p-1.5 text-danger'}
      >
        <Trash2 size={15} />
      </button>

      <Modal
        open={abierto}
        onClose={() => !ocupado && setAbierto(false)}
        title={requiereAprobacion ? t('deleteRecord.requestDelete') : t('deleteRecord.removeFromView')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/10 border border-warning/25">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
            <div className="text-sm leading-snug">
              {/* Se dice explícitamente que no se borra de la base: "eliminar"
                  a secas haría creer que el dato desaparece, y no es el caso. */}
              {requiereAprobacion ? (
                <Trans i18nKey="deleteRecord.warnApproval" values={{ etiqueta }} components={[<strong />]} />
              ) : (
                <Trans i18nKey="deleteRecord.warnDirect" values={{ etiqueta }} components={[<strong />]} />
              )}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="motivo-borrado">
              {t('deleteRecord.reasonLabel')} {requiereAprobacion ? t('deleteRecord.reasonHintApproval') : t('deleteRecord.reasonHintOptional')}
            </label>
            <textarea
              id="motivo-borrado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="input resize-none"
              placeholder={t('deleteRecord.reasonPlaceholder')}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setAbierto(false)} disabled={ocupado} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button onClick={confirmar} disabled={ocupado} className="btn-danger">
              {ocupado ? <Loader2 size={16} className="animate-spin" /> : <EyeOff size={16} />}
              {requiereAprobacion ? t('deleteRecord.requestDelete') : t('deleteRecord.removeShort')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

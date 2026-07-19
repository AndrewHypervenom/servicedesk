import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
        ? 'Retirado de la vista. El administrador revisará la solicitud.'
        : 'Retirado de la vista.');
      invalidar.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setAbierto(false);
      setMotivo('');
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo completar la operación');
    } finally { setOcupado(false); }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setAbierto(true); }}
        title={requiereAprobacion ? 'Solicitar eliminación' : 'Retirar de la vista'}
        className={className ?? 'btn-ghost !p-1.5 text-danger'}
      >
        <Trash2 size={15} />
      </button>

      <Modal
        open={abierto}
        onClose={() => !ocupado && setAbierto(false)}
        title={requiereAprobacion ? 'Solicitar eliminación' : 'Retirar de la vista'}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-warning/10 border border-warning/25">
            <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
            <div className="text-sm leading-snug">
              {/* Se dice explícitamente que no se borra de la base: "eliminar"
                  a secas haría creer que el dato desaparece, y no es el caso. */}
              {requiereAprobacion ? (
                <>
                  <strong>{etiqueta}</strong> dejará de aparecer en los listados,
                  pero <strong>no se borra de la base de datos</strong>. El
                  administrador decidirá si restaurarlo o eliminarlo de forma
                  definitiva.
                </>
              ) : (
                <>
                  <strong>{etiqueta}</strong> dejará de aparecer en los listados.
                  Podrás restaurarlo o eliminarlo definitivamente desde
                  <strong> Solicitudes</strong>.
                </>
              )}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="motivo-borrado">
              Motivo {requiereAprobacion ? '(ayuda al administrador a decidir)' : '(opcional)'}
            </label>
            <textarea
              id="motivo-borrado"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="input resize-none"
              placeholder="Ej.: registrado por error, equipo duplicado…"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setAbierto(false)} disabled={ocupado} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={confirmar} disabled={ocupado} className="btn-danger">
              {ocupado ? <Loader2 size={16} className="animate-spin" /> : <EyeOff size={16} />}
              {requiereAprobacion ? 'Solicitar eliminación' : 'Retirar'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

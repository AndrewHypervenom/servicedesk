import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldQuestion, Undo2, Trash2, Loader2, Boxes, Users, Truck, CheckCircle2, Clock,
} from 'lucide-react';
import { listSolicitudes, listPerfiles, restaurarRegistro, eliminarDefinitivo } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import { fmtDate } from '@/lib/format';
import type { SolicitudBorrado, EntidadBorrable } from '@/types';

const ICONO: Record<EntidadBorrable, React.ElementType> = {
  equipos: Boxes, colaboradores: Users, proveedores: Truck,
};
const NOMBRE: Record<EntidadBorrable, string> = {
  equipos: 'Equipo', colaboradores: 'Colaborador', proveedores: 'Proveedor',
};

export function Solicitudes() {
  const { perfil } = useApp();
  const qc = useQueryClient();
  const [verResueltas, setVerResueltas] = useState(false);
  const [ocupada, setOcupada] = useState<number | null>(null);

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ['solicitudes'], queryFn: () => listSolicitudes(false),
  });
  const { data: perfiles = [] } = useQuery({ queryKey: ['perfiles'], queryFn: listPerfiles });

  const nombreDe = (id?: string | null) =>
    perfiles.find((p) => p.id === id)?.nombre ?? '—';

  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE');
  const resueltas = solicitudes.filter((s) => s.estado !== 'PENDIENTE');
  const lista = verResueltas ? resueltas : pendientes;

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['solicitudes'] });
    // Los listados de datos también cambian: al restaurar reaparece la fila.
    ['equipos', 'colaboradores', 'proveedores'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }));
  };

  const restaurar = async (s: SolicitudBorrado) => {
    setOcupada(s.id);
    try {
      await restaurarRegistro(s, perfil!.id);
      toast.success('Registro restaurado');
      refrescar();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo restaurar');
    } finally { setOcupada(null); }
  };

  const eliminar = async (s: SolicitudBorrado) => {
    setOcupada(s.id);
    try {
      await eliminarDefinitivo(s, perfil!.id);
      toast.success('Eliminado definitivamente');
      refrescar();
    } catch (e: any) {
      // Caso esperado, no un fallo: los triggers bloquean el borrado duro de
      // registros con historial. El mensaje viene de la base de datos y explica
      // cuántos movimientos y actas lo impiden.
      toast.error(e?.message ?? 'No se pudo eliminar');
    } finally { setOcupada(null); }
  };

  return (
    <div>
      <PageHeader
        title="Solicitudes de eliminación"
        subtitle="Registros retirados de la vista, pendientes de su decisión"
        icon={ShieldQuestion}
      />

      <div className="flex items-center gap-1 p-1 mb-5 rounded-xl bg-ink-100/70 dark:bg-white/5 w-fit">
        {[
          { k: false, txt: `Pendientes (${pendientes.length})` },
          { k: true, txt: `Resueltas (${resueltas.length})` },
        ].map((o) => (
          <button key={String(o.k)} onClick={() => setVerResueltas(o.k)}
            className="relative px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors">
            {verResueltas === o.k && (
              <motion.span layoutId="tab-solicitudes"
                className="absolute inset-0 rounded-lg bg-white dark:bg-ink-700 shadow-sm"
                transition={{ type: 'spring', damping: 26, stiffness: 340 }} />
            )}
            <span className={`relative z-10 ${verResueltas === o.k ? 'text-brand-600 dark:text-brand-300' : 'text-ink-500'}`}>
              {o.txt}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="card p-5"><SkeletonText lines={5} /></div>
      ) : lista.length === 0 ? (
        <EmptyState
          icon={verResueltas ? Clock : CheckCircle2}
          title={verResueltas ? 'Nada resuelto todavía' : 'No hay solicitudes pendientes'}
          description={verResueltas
            ? 'Aquí aparecerán las solicitudes que ya haya restaurado o eliminado.'
            : 'Cuando un jefe de sede o un líder retire un registro, aparecerá aquí para su revisión.'}
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {lista.map((s) => {
              const Icono = ICONO[s.entidad];
              const trabajando = ocupada === s.id;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="card p-4 flex flex-wrap items-center gap-4"
                >
                  <div className="w-11 h-11 rounded-2xl bg-ink-100 dark:bg-white/5 grid place-items-center shrink-0">
                    <Icono size={20} className="text-ink-500" />
                  </div>

                  <div className="flex-1 min-w-[14rem]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{s.etiqueta}</span>
                      <span className="badge bg-ink-100 dark:bg-white/10 text-ink-500">
                        {NOMBRE[s.entidad]}
                      </span>
                      {s.estado !== 'PENDIENTE' && (
                        <span className={`badge ${s.estado === 'APROBADA'
                          ? 'bg-danger/15 text-danger' : 'bg-brand-500/15 text-brand-600 dark:text-brand-300'}`}>
                          {s.estado === 'APROBADA' ? 'Eliminada' : 'Restaurada'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-400 mt-1">
                      Solicitado por {nombreDe(s.solicitado_por)} · {fmtDate(s.solicitado_en, 'es')}
                      {s.resuelto_en && ` · Resuelto por ${nombreDe(s.resuelto_por)}`}
                    </div>
                    {s.motivo && (
                      <p className="text-sm text-ink-500 dark:text-ink-300 mt-1.5 leading-snug">
                        «{s.motivo}»
                      </p>
                    )}
                  </div>

                  {s.estado === 'PENDIENTE' && (
                    <div className="flex items-center gap-2 ml-auto">
                      <button onClick={() => restaurar(s)} disabled={trabajando}
                        className="btn-secondary text-sm">
                        {trabajando ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
                        Restaurar
                      </button>
                      <button onClick={() => eliminar(s)} disabled={trabajando}
                        className="btn-danger text-sm">
                        <Trash2 size={15} />
                        Eliminar definitivamente
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <p className="text-xs text-ink-400 mt-6 leading-relaxed max-w-2xl">
        Los equipos y colaboradores con movimientos o actas asociadas no pueden
        eliminarse de la base de datos: son la trazabilidad del sistema y las
        actas son documentos firmados. En esos casos el registro permanece
        oculto de forma indefinida.
      </p>
    </div>
  );
}

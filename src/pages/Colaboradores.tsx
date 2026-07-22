import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Building2, Mail, MapPin, Pencil } from 'lucide-react';
import { BotonBorrar } from '@/components/ui/BotonBorrar';
import { listColaboradores, crearColaborador, actualizarColaborador, campoDuplicado, listSedes } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { initials } from '@/lib/format';
import { useApp } from '@/store/useApp';
import type { Colaborador, Sede } from '@/types';

const sedeOption = (s: Sede): SelectOption =>
  ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre });

export function Colaboradores() {
  const { t } = useTranslation();
  const { canEdit } = useApp();
  const { data: colabs = [], refetch, isLoading } = useQuery({ queryKey: ['colabs'], queryFn: listColaboradores });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const nombreSede = (c: Colaborador) => sedes.find((s) => s.id === c.sede_id)?.nombre ?? c.sede;
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);  // cédula en edición
  const [f, setF] = useState<Partial<Colaborador>>({});
  const [busy, setBusy] = useState(false);

  const abrirNuevo = () => { setEditando(null); setF({}); setOpen(true); };
  const abrirEdicion = (c: Colaborador) => { setEditando(c.cedula); setF(c); setOpen(true); };
  const cerrar = () => { if (!busy) { setOpen(false); setEditando(null); setF({}); } };

  const save = async () => {
    const cedula = (f.cedula ?? '').trim();
    // La sede es obligatoria: sin ella, un Técnico o Líder de sede no podría
    // asignarle equipos (no hay contra qué comparar sus sedes).
    if (!cedula || !f.nombre || !f.sede_id) { toast.error(t('form.requiredFields')); return; }
    setBusy(true);
    try {
      if (editando) await actualizarColaborador(editando, f);
      else await crearColaborador({ ...f, cedula, activo: true, creado_en: new Date().toISOString() } as Colaborador);
      toast.success(t('common.success'));
      setOpen(false); setEditando(null); setF({}); refetch();
    } catch (e) {
      const campo = campoDuplicado(e);
      if (campo === 'correo') toast.error(t('collaborators.duplicateEmail', { correo: (f.correo ?? '').trim() }));
      else if (campo === 'cedula') toast.error(t('collaborators.duplicate', { cedula }));
      else toast.error(t('common.error'));
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title={t('collaborators.title')} subtitle={t('collaborators.subtitle')} icon={Users}
        action={canEdit() && <Button variant="primary" icon={Plus} onClick={abrirNuevo}>{t('collaborators.new')}</Button>} />

      {isLoading && <SkeletonGrid count={6} />}

      {!isLoading && colabs.length === 0 && (
        <div className="card">
          <EmptyState
            icon={Users}
            title={t('collaborators.emptyTitle')}
            description={t('collaborators.emptyDesc')}
            action={canEdit() && <Button variant="primary" icon={Plus} onClick={abrirNuevo}>{t('collaborators.new')}</Button>}
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!isLoading && colabs.map((c) => (
          <div key={c.cedula} className="card p-5 relative group">
            <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
              {canEdit() && (
                <button onClick={() => abrirEdicion(c)} title={t('common.edit')}
                  className="p-1.5 rounded-lg text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10 transition">
                  <Pencil size={15} />
                </button>
              )}
              <BotonBorrar
                entidad="colaboradores"
                id={c.cedula}
                etiqueta={`${c.nombre} · C.C. ${c.cedula}`}
                invalidar={['colaboradores', 'solicitudesPendientes']}
                className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition"
              />
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center font-bold">{initials(c.nombre)}</div>
              <div className="min-w-0">
                <div className="font-medium truncate">{c.nombre}</div>
                <div className="text-xs text-ink-400">C.C. {c.cedula}</div>
              </div>
            </div>
            <div className="space-y-1.5 text-sm text-ink-500">
              {c.cargo && <div>{c.cargo}</div>}
              {c.proyecto && <div className="flex items-center gap-2"><Building2 size={14} /> {c.proyecto}</div>}
              {c.correo && <div className="flex items-center gap-2"><Mail size={14} /> {c.correo}</div>}
              {nombreSede(c) && <div className="flex items-center gap-2"><MapPin size={14} /> {nombreSede(c)}</div>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={cerrar}
        title={editando ? t('collaborators.edit') : t('collaborators.new')}
        subtitle={editando ? t('collaborators.editHint') : undefined}>
        <div className="grid sm:grid-cols-2 gap-4">
          {[['cedula', 'C.C. *'], ['nombre', t('auth.name') + ' *'], ['cargo', 'Cargo'], ['correo', t('auth.email')],
            ['proyecto', t('equipo.proyectoAsignado')], ['lider', 'Líder'], ['telefono', 'Teléfono']].map(([k, label]) => {
            const req = label.endsWith(' *');
            return (
            <div key={k}>
              <label className={`label${req ? ' req' : ''}`}>{req ? label.slice(0, -2) : label}</label>
              <input className="input disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={k === 'cedula' && !!editando}
                value={(f as any)[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
            );
          })}
          <div>
            <label className="label req">{t('users.sede')}</label>
            <Select value={f.sede_id ?? ''} onChange={(v) => setF({ ...f, sede_id: v || null })}
              placeholder={t('users.selectSede')} options={sedes.map(sedeOption)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={cerrar} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

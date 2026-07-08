import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Building2, Mail, MapPin } from 'lucide-react';
import { listColaboradores, upsertColaborador } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { initials } from '@/lib/format';
import { useApp } from '@/store/useApp';
import type { Colaborador } from '@/types';

export function Colaboradores() {
  const { t } = useTranslation();
  const { canEdit } = useApp();
  const { data: colabs = [], refetch } = useQuery({ queryKey: ['colabs'], queryFn: listColaboradores });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Partial<Colaborador>>({});

  const save = async () => {
    if (!f.cedula || !f.nombre) { toast.error(t('form.requiredFields')); return; }
    await upsertColaborador({ ...f, activo: true, creado_en: new Date().toISOString() } as Colaborador);
    toast.success(t('common.success')); setOpen(false); setF({}); refetch();
  };

  return (
    <div>
      <PageHeader title={t('collaborators.title')} subtitle={t('collaborators.subtitle')} icon={Users}
        action={canEdit() && <button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16} /> {t('collaborators.new')}</button>} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {colabs.map((c) => (
          <div key={c.cedula} className="card p-5">
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
              {c.sede && <div className="flex items-center gap-2"><MapPin size={14} /> {c.sede}</div>}
            </div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t('collaborators.new')}>
        <div className="grid sm:grid-cols-2 gap-4">
          {[['cedula', 'C.C. *'], ['nombre', t('auth.name') + ' *'], ['cargo', 'Cargo'], ['correo', t('auth.email')],
            ['proyecto', t('equipo.proyectoAsignado')], ['lider', 'Líder'], ['telefono', 'Teléfono'], ['sede', 'Sede']].map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" value={(f as any)[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
          <button onClick={save} className="btn-primary">{t('common.save')}</button>
        </div>
      </Modal>
    </div>
  );
}

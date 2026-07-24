import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plug, Plus, Copy, Check, ArrowDownToLine, ArrowUpFromLine, Webhook, Pencil, Trash2 } from 'lucide-react';
import { listIntegraciones, createIntegracion, updateIntegracion, deleteIntegracion } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import type { Integracion } from '@/types';

const EVENTOS = ['equipo.creado', 'equipo.actualizado', 'movimiento.creado', 'acta.generada', 'contrato.por_vencer'];
const VACIO: Partial<Integracion> = { direccion: 'SALIENTE', tipo: 'WEBHOOK', eventos: [] };

export function Integraciones() {
  const { t } = useTranslation();
  const { data: items = [], refetch } = useQuery({ queryKey: ['integ'], queryFn: listIntegraciones });
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Partial<Integracion>>(VACIO);

  const copy = (k: string) => { navigator.clipboard.writeText(k); setCopied(k); setTimeout(() => setCopied(''), 1500); };

  const abrirNueva = () => { setEditId(null); setF(VACIO); setOpen(true); };
  const abrirEdicion = (i: Integracion) => {
    setEditId(i.id);
    setF({ nombre: i.nombre, direccion: i.direccion, tipo: i.tipo, url: i.url, eventos: [...(i.eventos ?? [])], activo: i.activo });
    setOpen(true);
  };
  const cerrar = () => { if (!busy) { setOpen(false); setEditId(null); setF(VACIO); } };

  const save = async () => {
    if (!f.nombre) { toast.error(t('form.requiredFields')); return; }
    setBusy(true);
    try {
      if (editId) {
        await updateIntegracion(editId, {
          nombre: f.nombre, url: f.url ?? null, eventos: f.eventos ?? [], activo: f.activo ?? true,
        });
      } else {
        await createIntegracion(f);
      }
      toast.success(t('common.success'));
      cerrar(); refetch();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  const borrar = async (i: Integracion) => {
    setBusy(true);
    try { await deleteIntegracion(i.id); toast.success(t('common.success')); refetch(); }
    catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  const entrantes = items.filter((i) => i.direccion === 'ENTRANTE');
  const salientes = items.filter((i) => i.direccion === 'SALIENTE');

  const Card = ({ i }: { i: Integracion }) => (
    <div className="card p-5 relative group">
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
        <button onClick={() => abrirEdicion(i)} title={t('common.edit')} className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-100 dark:hover:bg-white/10 transition"><Pencil size={14} /></button>
        <button onClick={() => borrar(i)} disabled={busy} title={t('common.delete')} className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition"><Trash2 size={14} /></button>
      </div>
      <div className="flex items-center justify-between mb-2 pr-16">
        <div className="font-medium">{i.nombre}</div>
        <Badge className={i.activo ? '!bg-success/15 !text-emerald-700 dark:!text-success' : ''}>{i.activo ? t('integrations.active') : t('integrations.inactive')}</Badge>
      </div>
      {i.url && <div className="text-xs text-ink-400 font-mono truncate mb-2">{i.url}</div>}
      <div className="flex items-center gap-2 bg-ink-50 dark:bg-white/5 rounded-xl px-3 py-2">
        <span className="text-xs text-ink-400">{t('integrations.apiKey')}</span>
        <code className="text-xs font-mono flex-1 truncate">{i.api_key}</code>
        <button onClick={() => copy(i.api_key)} className="btn-ghost !p-1.5">
          {copied === i.api_key ? <Check size={14} className="text-success" /> : <Copy size={14} />}
        </button>
      </div>
      {i.eventos?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {i.eventos.map((e) => <span key={e} className="badge bg-brand-500/10 text-brand-600 text-[10px]">{e}</span>)}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader title={t('integrations.title')} subtitle={t('integrations.subtitle')} icon={Plug}
        action={<button onClick={abrirNueva} className="btn-primary"><Plus size={16} /> {t('integrations.new')}</button>} />

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-ink-500"><ArrowDownToLine size={16} /> {t('integrations.incoming')}</div>
          <div className="space-y-3">
            {entrantes.map((i) => <Card key={i.id} i={i} />)}
            {entrantes.length === 0 && (
              <div className="card"><EmptyState icon={ArrowDownToLine} title={t('integrations.noneIncoming')} className="!py-8" /></div>
            )}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-ink-500"><ArrowUpFromLine size={16} /> {t('integrations.outgoing')}</div>
          <div className="space-y-3">
            {salientes.map((i) => <Card key={i.id} i={i} />)}
            {salientes.length === 0 && (
              <div className="card"><EmptyState icon={ArrowUpFromLine} title={t('integrations.noneOutgoing')} className="!py-8" /></div>
            )}
          </div>
        </div>
      </div>

      <Modal open={open} onClose={cerrar} title={editId ? t('integrations.edit') : t('integrations.new')}>
        <div className="space-y-4">
          <div>
            <label className="label req">{t('suppliers.name')}</label>
            <input className="input" placeholder="Nombre de la integración" value={f.nombre ?? ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(['ENTRANTE', 'SALIENTE'] as const).map((d) => (
              <button key={d} disabled={!!editId} onClick={() => setF({ ...f, direccion: d })}
                className={`p-3 rounded-xl border-2 flex items-center gap-2 justify-center text-sm disabled:opacity-50 disabled:cursor-not-allowed ${f.direccion === d ? 'border-brand-500 bg-brand-500/5' : 'border-ink-100 dark:border-white/10'}`}>
                {d === 'ENTRANTE' ? <ArrowDownToLine size={16} /> : <Webhook size={16} />}
                {d === 'ENTRANTE' ? t('integrations.incoming') : t('integrations.outgoing')}
              </button>
            ))}
          </div>
          {editId && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={f.activo ?? true} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
              {t('integrations.activeToggle')}
            </label>
          )}
          {f.direccion === 'SALIENTE' && (
            <>
              <div>
                <label className="label">{t('integrations.url')}</label>
                <input className="input" placeholder="https://…" value={f.url ?? ''} onChange={(e) => setF({ ...f, url: e.target.value })} />
              </div>
              <div>
                <label className="label">{t('integrations.events')}</label>
                <div className="flex flex-wrap gap-2">
                  {EVENTOS.map((ev) => {
                    const on = f.eventos?.includes(ev);
                    return <button key={ev} onClick={() => setF({ ...f, eventos: on ? f.eventos!.filter((x) => x !== ev) : [...(f.eventos ?? []), ev] })}
                      className={`badge cursor-pointer ${on ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-ink-700 text-ink-500'}`}>{ev}</button>;
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={cerrar} disabled={busy} className="btn-secondary">{t('common.cancel')}</button>
          <button onClick={save} disabled={busy} className="btn-primary">{busy ? t('common.saving') : t('common.save')}</button>
        </div>
      </Modal>
    </div>
  );
}

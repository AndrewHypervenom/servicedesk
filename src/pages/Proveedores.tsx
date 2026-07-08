import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Truck, Building2, Warehouse, ShoppingCart, Plus } from 'lucide-react';
import { listProveedores, listEquipos, createProveedor } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import type { Proveedor } from '@/types';

const tipoIcon: Record<string, React.ElementType> = {
  ARRENDADOR: Truck, PROYECTO_CLIENTE: Building2, BODEGA_INTERNA: Warehouse, PROVEEDOR_COMPRA: ShoppingCart,
};
const TIPOS = ['ARRENDADOR', 'PROVEEDOR_COMPRA', 'PROYECTO_CLIENTE', 'BODEGA_INTERNA'];

export function Proveedores() {
  const { t } = useTranslation();
  const { can } = useApp();
  const { data: provs = [], refetch } = useQuery({ queryKey: ['proveedores'], queryFn: listProveedores });
  const { data: equipos = [] } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const [open, setOpen] = useState(false);
  const puedeCrear = can('ADMIN', 'LIDER', 'JEFE_SEDE');

  return (
    <div>
      <PageHeader title={t('nav.suppliers')} subtitle={t('suppliers.subtitle')} icon={Truck}
        action={puedeCrear && <button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16} /> {t('suppliers.new')}</button>} />

      {provs.length === 0 && <div className="card p-12 text-center text-ink-400">{t('common.empty')}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {provs.map((p) => {
          const Icon = tipoIcon[p.tipo] ?? Truck;
          const count = equipos.filter((e) => e.proveedor_propietario === p.nombre).length;
          return (
            <div key={p.id} className="card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-11 h-11 rounded-2xl bg-brand-500/10 text-brand-600 grid place-items-center"><Icon size={22} /></div>
                <div>
                  <div className="font-semibold">{p.nombre}</div>
                  <Badge>{p.tipo.replace('_', ' ')}</Badge>
                </div>
                <div className="ml-auto text-2xl font-bold text-brand-600">{count}</div>
              </div>
              {p.observacion && <p className="text-sm text-ink-400">{p.observacion}</p>}
            </div>
          );
        })}
      </div>

      {puedeCrear && <NuevoProveedorModal open={open} onClose={() => setOpen(false)} onSaved={refetch} />}
    </div>
  );
}

function NuevoProveedorModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const vacio: Partial<Proveedor> = { tipo: 'ARRENDADOR' };
  const [f, setF] = useState<Partial<Proveedor>>(vacio);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Proveedor, v: string) => setF((s) => ({ ...s, [k]: v }));

  const guardar = async () => {
    if (!f.nombre?.trim()) { toast.error(t('form.requiredFields')); return; }
    setBusy(true);
    try {
      await createProveedor({ ...f, nombre: f.nombre.trim() });
      toast.success(t('common.success'));
      setF(vacio); onClose(); onSaved();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={t('suppliers.new')}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('suppliers.name')} *</label>
          <input className="input" value={f.nombre ?? ''} onChange={(e) => set('nombre', e.target.value)} />
        </div>
        <div>
          <label className="label">{t('common.type')}</label>
          <Select value={f.tipo ?? 'ARRENDADOR'} onChange={(v) => set('tipo', v)}
            options={TIPOS.map((x) => ({ value: x, label: t(`proveedorTipo.${x}`) }))} />
        </div>
        <div><label className="label">{t('suppliers.contact')}</label><input className="input" value={f.contacto ?? ''} onChange={(e) => set('contacto', e.target.value)} /></div>
        <div><label className="label">{t('auth.email')}</label><input className="input" value={f.correo ?? ''} onChange={(e) => set('correo', e.target.value)} /></div>
        <div className="sm:col-span-2"><label className="label">{t('suppliers.note')}</label><input className="input" value={f.observacion ?? ''} onChange={(e) => set('observacion', e.target.value)} /></div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button className="btn-secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn-primary" disabled={busy} onClick={guardar}>{busy ? t('common.loading') : t('common.save')}</button>
      </div>
    </Modal>
  );
}

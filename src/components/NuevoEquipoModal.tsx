import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { createEquipo, listSedes, listMarcas, listProveedores } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import type { Equipo } from '@/types';

const TIPOS = ['PORTATIL', 'ESCRITORIO', 'CELULAR', 'MONITOR', 'PERIFERICO', 'BASE_RECALENTAMIENTO', 'CARGADOR', 'OTRO'];
const FISICOS = ['BUENO', 'REGULAR', 'DANADO'];
const PROPIEDADES = ['EMPRESA', 'PROYECTO', 'RENTADO', 'COMODATO'];

export function NuevoEquipoModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { perfil } = useApp();
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const { data: marcas = [] } = useQuery({ queryKey: ['marcas'], queryFn: listMarcas });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: listProveedores });
  const sedeFija = perfil?.rol === 'JEFE_SEDE' || perfil?.rol === 'TECNICO';
  const base: Partial<Equipo> = { tipo: 'PORTATIL', estado_fisico: 'BUENO', propiedad: 'EMPRESA', sede_id: sedeFija ? perfil?.sede_id : null };
  const [f, setF] = useState<Partial<Equipo>>(base);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Equipo, v: any) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!f.marca || !f.linea_modelo || !f.serial) { toast.error(t('form.requiredFields')); return; }
    setBusy(true);
    try {
      await createEquipo(f);
      toast.success(t('form.saved'));
      setF(base);
      onSaved(); onClose();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  const Field = ({ label, k, type = 'text', req }: { label: string; k: keyof Equipo; type?: string; req?: boolean }) => (
    <div>
      <label className="label">{label}{req && <span className="text-danger"> *</span>}</label>
      <input type={type} className="input" value={(f[k] as string) ?? ''} onChange={(e) => set(k, type === 'number' ? Number(e.target.value) : e.target.value)} />
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={t('form.newTitle')} subtitle={t('form.newSub')} size="lg">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('equipo.marca')}<span className="text-danger"> *</span></label>
          <input className="input" list="dl-marcas" value={f.marca ?? ''} onChange={(e) => set('marca', e.target.value)} placeholder={t('form.pickOrType')} />
          <datalist id="dl-marcas">{marcas.map((m) => <option key={m.id} value={m.nombre} />)}</datalist>
        </div>
        <Field label={t('equipo.modelo')} k="linea_modelo" req />
        <div className="sm:col-span-2"><Field label={t('equipo.descripcion')} k="descripcion_completa" /></div>
        <Field label={t('equipo.serial')} k="serial" req />
        <div>
          <label className="label">{t('equipo.tipo')}</label>
          <Select
            value={f.tipo ?? ''}
            onChange={(v) => set('tipo', v)}
            options={TIPOS.map((x) => ({ value: x, label: t(`tipo.${x}`), description: t(`tipoDesc.${x}`) }))}
          />
        </div>
        <div>
          <label className="label">{t('equipo.estadoFisico')}</label>
          <Select
            value={f.estado_fisico ?? ''}
            onChange={(v) => set('estado_fisico', v)}
            options={FISICOS.map((x) => ({ value: x, label: t(`estadoFis.${x}`), description: t(`estadoFisDesc.${x}`) }))}
          />
        </div>
        <div>
          <label className="label">{t('equipo.propiedad')}</label>
          <Select
            value={f.propiedad ?? ''}
            onChange={(v) => set('propiedad', v)}
            options={PROPIEDADES.map((x) => ({ value: x, label: t(`propiedad.${x}`), description: t(`propiedadDesc.${x}`) }))}
          />
        </div>
        <div>
          <label className="label">{t('users.sede')}</label>
          <Select
            value={f.sede_id ?? ''}
            onChange={(v) => set('sede_id', v || null)}
            disabled={sedeFija}
            placeholder={t('users.selectSede')}
            options={[{ value: '', label: '—' }, ...sedes.map((s) => ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre }))]}
          />
        </div>
        <div>
          <label className="label">{t('equipo.proveedorPropietario')}</label>
          <input className="input" list="dl-proveedores" value={f.proveedor_propietario ?? ''} onChange={(e) => set('proveedor_propietario', e.target.value)} placeholder={t('form.pickOrType')} />
          <datalist id="dl-proveedores">{proveedores.map((p) => <option key={p.id} value={p.nombre} />)}</datalist>
        </div>
        <Field label={t('equipo.fechaIngreso')} k="fecha_ingreso" type="date" />
        {f.propiedad === 'RENTADO' && (
          <>
            <Field label={t('equipo.fechaVencimiento')} k="fecha_vencimiento_contrato" type="date" />
            <Field label={t('equipo.numeroContrato')} k="numero_contrato" />
            <Field label={t('equipo.codigoInterno')} k="codigo_interno" type="number" />
          </>
        )}
        <div className="sm:col-span-2"><Field label={t('equipo.fichaTecnica')} k="ficha_tecnica" /></div>
        <div className="sm:col-span-2"><Field label={t('equipo.observaciones')} k="observaciones" /></div>
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100 dark:border-white/10">
        <button onClick={onClose} className="btn-secondary">{t('common.cancel')}</button>
        <button onClick={save} disabled={busy} className="btn-primary">{busy ? t('common.loading') : t('common.save')}</button>
      </div>
    </Modal>
  );
}

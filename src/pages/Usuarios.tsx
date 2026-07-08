import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, UserPlus, Copy, Check } from 'lucide-react';
import { listPerfiles, updateRol, updateSedeUsuario, crearUsuario, listSedes } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { initials } from '@/lib/format';
import type { Perfil, RolUsuario, Sede } from '@/types';

const ROLES: RolUsuario[] = ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'];
const rolColor: Record<RolUsuario, string> = {
  ADMIN: 'bg-danger/15 text-red-600 dark:text-danger',
  LIDER: 'bg-info/20 text-magenta-600 dark:text-info',
  JEFE_SEDE: 'bg-brand-500/15 text-brand-600 dark:text-brand-300',
  TECNICO: 'bg-success/15 text-emerald-700 dark:text-success',
};

const rolPorSede = (r: RolUsuario) => r === 'JEFE_SEDE' || r === 'TECNICO';
const sedeOption = (s: Sede): SelectOption =>
  ({ value: s.id, label: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre });

export function Usuarios() {
  const { t } = useTranslation();
  const { data: perfiles = [], refetch } = useQuery({ queryKey: ['perfiles'], queryFn: listPerfiles });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const [nuevo, setNuevo] = useState(false);

  const change = async (id: string, rol: RolUsuario) => {
    await updateRol(id, rol); toast.success(t('common.success')); refetch();
  };

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} icon={ShieldCheck}
        action={<button onClick={() => setNuevo(true)} className="btn-primary"><UserPlus size={16} /> {t('users.newUser')}</button>} />

      <NuevoUsuarioModal open={nuevo} onClose={() => setNuevo(false)} onSaved={refetch} sedes={sedes} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {ROLES.map((r) => (
          <div key={r} className="card p-4">
            <span className={`badge ${rolColor[r]}`}>{t(`rol.${r}`)}</span>
            <p className="text-xs text-ink-400 mt-2">{t(`rolDesc.${r}`)}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-white/5">
              <th className="px-5 py-3">{t('auth.name')}</th><th className="px-4 py-3">{t('auth.email')}</th><th className="px-4 py-3">{t('users.role')}</th><th className="px-4 py-3">{t('users.sede')}</th>
            </tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr key={p.id} className="border-b border-ink-50 dark:border-white/5">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center text-xs font-bold">{initials(p.nombre)}</div>
                    {p.nombre}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-500">{p.correo}</td>
                <td className="px-4 py-3">
                  <Select
                    value={p.rol}
                    onChange={(v) => change(p.id, v as RolUsuario)}
                    className="!w-auto !py-1.5 text-xs"
                    options={ROLES.map((r) => ({ value: r, label: t(`rol.${r}`), description: t(`rolDesc.${r}`) }))}
                  />
                </td>
                <td className="px-4 py-3">
                  {rolPorSede(p.rol)
                    ? <SedeUsuario perfil={p} sedes={sedes} onSaved={refetch} />
                    : <span className="text-ink-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SedeUsuario({ perfil, sedes, onSaved }: { perfil: Perfil; sedes: Sede[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const change = async (v: string) => {
    try { await updateSedeUsuario(perfil.id, v || null); toast.success(t('common.success')); onSaved(); }
    catch { toast.error(t('common.error')); }
  };
  return (
    <Select
      value={perfil.sede_id ?? ''}
      onChange={change}
      className="!w-auto !py-1.5 text-xs"
      placeholder={t('users.selectSede')}
      options={[{ value: '', label: '—' }, ...sedes.map(sedeOption)]}
    />
  );
}

function NuevoUsuarioModal({ open, onClose, onSaved, sedes }: { open: boolean; onClose: () => void; onSaved: () => void; sedes: Sede[] }) {
  const { t } = useTranslation();
  const vacio = { nombre: '', email: '', rol: 'TECNICO' as RolUsuario, cedula: '', sedeId: '' };
  const [f, setF] = useState(vacio);
  const [busy, setBusy] = useState(false);
  const [cred, setCred] = useState<{ link: string; email: string; password: string } | null>(null);
  const set = (k: keyof typeof vacio, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const cerrar = () => { setF(vacio); setCred(null); onClose(); };

  const guardar = async () => {
    if (!f.nombre || !f.email) { toast.error(t('form.requiredFields')); return; }
    if (rolPorSede(f.rol) && !f.sedeId) { toast.error(t('users.sedeRequired')); return; }
    setBusy(true);
    try {
      const r = await crearUsuario({
        email: f.email.trim(), nombre: f.nombre.trim(), rol: f.rol,
        cedula: f.cedula.trim() || undefined,
        sedeId: rolPorSede(f.rol) ? f.sedeId : null,
      });
      setCred({ link: window.location.origin, email: r.email, password: r.password });
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? t('common.error'));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && cerrar()} title={t('users.newUser')}
      subtitle={cred ? t('users.credentialsHint') : t('users.newUserHint')}>
      {cred ? (
        <div className="space-y-3">
          <CredRow label={t('users.link')} value={cred.link} />
          <CredRow label={t('auth.email')} value={cred.email} />
          <CredRow label={t('users.tempPassword')} value={cred.password} mono />
          <CopyAll cred={cred} />
          <div className="flex justify-end mt-4">
            <button className="btn-primary" onClick={cerrar}>{t('common.done')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('auth.name')} *</label>
              <input className="input" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
            </div>
            <div>
              <label className="label">C.C.</label>
              <input className="input" value={f.cedula} onChange={(e) => set('cedula', e.target.value)} />
            </div>
            <div>
              <label className="label">{t('auth.email')} *</label>
              <input type="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <label className="label">{t('users.role')}</label>
              <Select value={f.rol} onChange={(v) => set('rol', v)} options={ROLES.map((r) => ({ value: r, label: t(`rol.${r}`), description: t(`rolDesc.${r}`) }))} />
            </div>
            {rolPorSede(f.rol) && (
              <div className="sm:col-span-2">
                <label className="label">{t('users.sede')} *</label>
                {sedes.length === 0
                  ? <p className="text-xs text-warning">{t('users.noSedes')}</p>
                  : <Select value={f.sedeId} onChange={(v) => set('sedeId', v)} placeholder={t('users.selectSede')} options={sedes.map(sedeOption)} />}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button className="btn-secondary" disabled={busy} onClick={cerrar}>{t('common.cancel')}</button>
            <button className="btn-primary" disabled={busy} onClick={guardar}>{busy ? t('common.loading') : t('users.createAccount')}</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function CredRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [ok, setOk] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); };
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <div className={`input flex-1 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
        <button onClick={copy} className="btn-secondary !px-3" title="Copiar">
          {ok ? <Check size={16} className="text-success" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
}

function CopyAll({ cred }: { cred: { link: string; email: string; password: string } }) {
  const { t } = useTranslation();
  const [ok, setOk] = useState(false);
  const texto = `${t('users.link')}: ${cred.link}\n${t('auth.email')}: ${cred.email}\n${t('users.tempPassword')}: ${cred.password}`;
  const copy = async () => { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500); toast.success(t('common.success')); };
  return (
    <button onClick={copy} className="btn-secondary w-full mt-1">
      {ok ? <Check size={16} className="text-success" /> : <Copy size={16} />} {t('users.copyAll')}
    </button>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, UserPlus, Copy, Check, Pencil, Trash2, AlertTriangle, UserX } from 'lucide-react';
import {
  listPerfiles, updateRol, crearUsuario, listSedes,
  listSedesPorPerfil, setSedesDePerfil, actualizarPerfil, eliminarUsuario,
} from '@/lib/api';
import { esAdmin } from '@/lib/roles';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { initials } from '@/lib/format';
import { useApp } from '@/store/useApp';
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
  const { data: perfiles = [], refetch, isLoading } = useQuery({ queryKey: ['perfiles'], queryFn: listPerfiles });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const { data: sedesPorPerfil = {}, refetch: refetchSedes } = useQuery({
    queryKey: ['perfil-sedes'], queryFn: listSedesPorPerfil,
  });
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Perfil | null>(null);
  const { perfil: yo } = useApp();
  const soyAdmin = esAdmin(yo?.rol);

  const recargar = () => { refetch(); refetchSedes(); };

  const change = async (id: string, rol: RolUsuario) => {
    await updateRol(id, rol); toast.success(t('common.success')); refetch();
  };

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} icon={ShieldCheck}
        action={<Button variant="primary" icon={UserPlus} onClick={() => setNuevo(true)}>{t('users.newUser')}</Button>} />

      <NuevoUsuarioModal open={nuevo} onClose={() => setNuevo(false)} onSaved={refetch} sedes={sedes} />
      <EditarUsuarioModal perfil={editando} sedes={sedes}
        onClose={() => setEditando(null)} onSaved={recargar} />

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
              {soyAdmin && <th className="px-4 py-3 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && <SkeletonRows rows={5} cols={4} />}
            {!isLoading && perfiles.map((p) => (
              <tr key={p.id} className={`border-b border-ink-50 dark:border-white/5 ${p.activo ? '' : 'opacity-55'}`}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold text-white ${
                      p.activo ? 'bg-gradient-to-br from-brand-400 to-brand-600' : 'bg-ink-300 dark:bg-ink-600'}`}>
                      {initials(p.nombre)}
                    </div>
                    <span>{p.nombre}</span>
                    {/* El estado se dice con texto, no solo con el color apagado
                        de la fila: un matiz de opacidad no es una etiqueta. */}
                    {!p.activo && (
                      <span className="badge bg-ink-200 dark:bg-white/10 text-ink-500">
                        <UserX size={11} /> Desactivado
                      </span>
                    )}
                    {p.id === yo?.id && (
                      <span className="badge bg-brand-500/15 text-brand-600 dark:text-brand-300">Tú</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-ink-500">{p.correo}</td>
                <td className="px-4 py-3">
                  {soyAdmin ? (
                    <Select
                      value={p.rol}
                      onChange={(v) => change(p.id, v as RolUsuario)}
                      className="!w-auto !py-1.5 text-xs"
                      options={ROLES.map((r) => ({ value: r, label: t(`rol.${r}`), description: t(`rolDesc.${r}`) }))}
                    />
                  ) : (
                    <span className={`badge ${rolColor[p.rol]}`}>{t(`rol.${p.rol}`)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {rolPorSede(p.rol)
                    ? <SedesUsuario perfil={p} sedes={sedes} asignadas={sedesPorPerfil[p.id] ?? []} onSaved={recargar} />
                    : <span className="text-ink-300">{t('users.todasLasSedes')}</span>}
                </td>
                {soyAdmin && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditando(p)} title="Editar usuario"
                      className="btn-ghost !p-1.5"><Pencil size={15} /></button>
                    <BorrarUsuario perfil={p} esYo={p.id === yo?.id} onDone={recargar} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && perfiles.length === 0 && (
          <EmptyState
            icon={ShieldCheck}
            title={t('users.emptyTitle')}
            description={t('users.emptyDesc')}
            action={<Button variant="primary" icon={UserPlus} onClick={() => setNuevo(true)}>{t('users.newUser')}</Button>}
          />
        )}
      </div>
    </div>
  );
}

/** Edición completa de un usuario por el administrador. */
function EditarUsuarioModal({ perfil, sedes, onClose, onSaved }:
  { perfil: Perfil | null; sedes: Sede[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { perfil: yo } = useApp();
  const [f, setF] = useState({ nombre: '', cedula: '', cargo: '', rol: 'TECNICO' as RolUsuario, sedeId: '', activo: true });
  const [busy, setBusy] = useState(false);
  const [cargado, setCargado] = useState<string | null>(null);

  // Se siembra el formulario cuando cambia el usuario que se está editando, sin
  // useEffect: comparar el id contra el último cargado evita un render extra.
  if (perfil && cargado !== perfil.id) {
    setCargado(perfil.id);
    setF({
      nombre: perfil.nombre ?? '', cedula: perfil.cedula ?? '', cargo: perfil.cargo ?? '',
      rol: perfil.rol, sedeId: perfil.sede_id ?? '', activo: perfil.activo,
    });
  }

  const esYo = perfil?.id === yo?.id;
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  const guardar = async () => {
    if (!f.nombre.trim()) { toast.error(t('form.requiredFields')); return; }
    if (rolPorSede(f.rol) && !f.sedeId) { toast.error(t('users.sedeRequired')); return; }
    setBusy(true);
    try {
      await actualizarPerfil(perfil!.id, {
        nombre: f.nombre.trim(),
        cedula: f.cedula.trim() || null,
        cargo: f.cargo.trim() || null,
        rol: f.rol,
        sede_id: rolPorSede(f.rol) ? f.sedeId : null,
        activo: f.activo,
      });
      toast.success(t('common.success'));
      onSaved(); onClose();
    } catch (e: any) {
      // Los triggers de la base rechazan degradarse o desactivarse a uno mismo
      // y dejar el sistema sin administradores. El mensaje viene de allí.
      toast.error(e?.message ?? t('common.error'));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={!!perfil} onClose={() => !busy && onClose()}
      title="Editar usuario" subtitle={perfil?.correo ?? undefined}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label req">{t('auth.name')}</label>
          <input className="input" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </div>
        <div>
          <label className="label">C.C.</label>
          <input className="input" value={f.cedula} onChange={(e) => set('cedula', e.target.value)} />
        </div>
        <div>
          <label className="label">Cargo</label>
          <input className="input" value={f.cargo} onChange={(e) => set('cargo', e.target.value)} />
        </div>
        <div>
          <label className="label">{t('users.role')}</label>
          <Select value={f.rol} onChange={(v) => set('rol', v)}
            options={ROLES.map((r) => ({ value: r, label: t(`rol.${r}`), description: t(`rolDesc.${r}`) }))} />
        </div>
        {rolPorSede(f.rol) && (
          <div className="sm:col-span-2">
            <label className="label req">{t('users.sede')}</label>
            <Select value={f.sedeId} onChange={(v) => set('sedeId', v)}
              placeholder={t('users.selectSede')} options={sedes.map(sedeOption)} />
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label">Correo</label>
          <div className="input bg-ink-50 dark:bg-white/5 text-ink-400 truncate">{perfil?.correo}</div>
          {/* Se explica por qué no es editable en vez de dejar el campo gris sin
              más: si no, parece un fallo de la pantalla. */}
          <p className="text-[11px] text-ink-400 mt-1 leading-snug">
            El correo es la credencial de acceso y no se cambia desde aquí.
            Modificarlo solo en el perfil dejaría al usuario entrando con el anterior.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button type="button" onClick={() => !esYo && set('activo', !f.activo)} disabled={esYo}
            className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
              esYo ? 'opacity-50 cursor-not-allowed border-ink-100 dark:border-white/10'
                   : f.activo ? 'border-ink-100 dark:border-white/10 hover:bg-ink-50 dark:hover:bg-white/5'
                              : 'border-warning/40 bg-warning/10'}`}>
            <div className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border ${
              f.activo ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20'}`}>
              {f.activo && <Check size={13} />}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">Cuenta activa</div>
              <div className="text-xs text-ink-400 leading-snug">
                {esYo ? 'No puede desactivar su propia cuenta.'
                      : f.activo ? 'Al desactivarla pierde el acceso de inmediato, y es reversible.'
                                 : 'Desactivado: no podrá iniciar sesión ni consultar datos.'}
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button disabled={busy} onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" loading={busy} onClick={guardar}>
          {busy ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </Modal>
  );
}

/** Eliminación definitiva de un usuario, con desactivar como alternativa. */
function BorrarUsuario({ perfil, esYo, onDone }:
  { perfil: Perfil; esYo: boolean; onDone: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState(false);

  // La propia cuenta no se ofrece siquiera. La base también lo impide, pero
  // pintar un botón que siempre falla no ayuda a nadie.
  if (esYo) return null;

  const eliminar = async () => {
    setBusy(true);
    try {
      await eliminarUsuario(perfil.id);
      toast.success(`${perfil.nombre} eliminado`);
      setAbierto(false); onDone();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo eliminar');
    } finally { setBusy(false); }
  };

  const desactivar = async () => {
    setBusy(true);
    try {
      await actualizarPerfil(perfil.id, { activo: false });
      toast.success(`${perfil.nombre} desactivado`);
      setAbierto(false); onDone();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo desactivar');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setAbierto(true)} title="Eliminar usuario"
        className="btn-ghost !p-1.5 text-danger"><Trash2 size={15} /></button>

      <Modal open={abierto} onClose={() => !busy && setAbierto(false)} size="sm"
        title="Eliminar usuario" subtitle={perfil.nombre}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/25">
            <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
            <div className="text-sm leading-snug">
              Eliminar borra su cuenta de acceso y su perfil de forma
              <strong> irreversible</strong>. Si generó actas o dejó rastro en
              auditoría, la base lo impedirá y tendrá que desactivarlo.
            </div>
          </div>

          {perfil.activo && (
            <p className="text-sm text-ink-500 dark:text-ink-300 leading-snug">
              <strong>Desactivar</strong> es casi siempre la opción correcta:
              le quita el acceso al instante, conserva su historial y se puede
              revertir.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={() => setAbierto(false)}>Cancelar</Button>
            {perfil.activo && (
              <button onClick={desactivar} disabled={busy} className="btn-secondary">
                <UserX size={15} /> Desactivar
              </button>
            )}
            <button onClick={eliminar} disabled={busy} className="btn-danger">
              <Trash2 size={15} /> Eliminar definitivamente
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Sede de un usuario. Cada usuario opera en una sola sede (su ciudad). El
 * Administrador y el Jefe (LIDER) pueden cambiársela: al guardar se ajusta
 * `perfiles.sede_id` y la tabla `perfil_sedes` (siempre con una única fila) vía
 * el RPC `set_sedes_de_perfil`, autorizado para ADMIN y LIDER. Para los demás
 * la sede se muestra en modo lectura.
 */
function SedesUsuario({ perfil, sedes, asignadas, onSaved }:
  { perfil: Perfil; sedes: Sede[]; asignadas: string[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const { perfil: yoPerfil } = useApp();
  const [open, setOpen] = useState(false);
  // Una única sede: null cuando el usuario no tiene ninguna asignada.
  const [sel, setSel] = useState<string | null>(asignadas[0] ?? null);
  const [busy, setBusy] = useState(false);
  // El Jefe (LIDER) gestiona la sede de las personas igual que el ADMIN.
  const puedeEditar = esAdmin(yoPerfil?.rol) || yoPerfil?.rol === 'LIDER';

  const abrir = () => { setSel(asignadas[0] ?? null); setOpen(true); };
  // Selección única: al tocar la sede activa se deselecciona (deja al usuario
  // sin sede); tocar otra la reemplaza.
  const elegir = (id: string) => setSel((prev) => prev === id ? null : id);

  const guardar = async () => {
    setBusy(true);
    try {
      // El RPC reemplaza la sede y alinea `perfiles.sede_id` en una sola
      // operación autorizada para ADMIN y Jefe (LIDER).
      await setSedesDePerfil(perfil.id, sel ? [sel] : []);
      toast.success(t('common.success'));
      setOpen(false); onSaved();
    } catch (e: any) { toast.error(e?.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  const nombre = asignadas[0] ? sedes.find((s) => s.id === asignadas[0])?.nombre : undefined;

  return (
    <>
      <button onClick={abrir} disabled={!puedeEditar}
        className="flex flex-wrap items-center gap-1 text-left disabled:cursor-default">
        {!nombre && <span className="text-ink-300">{t('users.selectSede')}</span>}
        {nombre && (
          <span className="badge bg-brand-500/15 text-brand-600 dark:text-brand-300">{nombre}</span>
        )}
        {puedeEditar && <Pencil size={13} className="text-ink-400 ml-1" />}
      </button>

      <Modal open={open} onClose={() => !busy && setOpen(false)}
        title={t('users.sedes')} subtitle={t('users.sedesHint', { nombre: perfil.nombre })}>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {sedes.map((s) => {
            const on = sel === s.id;
            return (
              <button key={s.id} onClick={() => elegir(s.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                  on ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500' : 'border-ink-100 dark:border-white/10 hover:bg-ink-50 dark:hover:bg-white/5'}`}>
                <div className={`w-5 h-5 rounded-full grid place-items-center shrink-0 border ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20'}`}>
                  {on && <Check size={13} />}
                </div>
                <span className="text-sm">{sedeOption(s).label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button disabled={busy} onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={guardar}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </Modal>
    </>
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
              <label className="label req">{t('auth.name')}</label>
              <input className="input" value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
            </div>
            <div>
              <label className="label">C.C.</label>
              <input className="input" value={f.cedula} onChange={(e) => set('cedula', e.target.value)} />
            </div>
            <div>
              <label className="label req">{t('auth.email')}</label>
              <input type="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <label className="label">{t('users.role')}</label>
              <Select value={f.rol} onChange={(v) => set('rol', v)} options={ROLES.map((r) => ({ value: r, label: t(`rol.${r}`), description: t(`rolDesc.${r}`) }))} />
            </div>
            {rolPorSede(f.rol) && (
              <div className="sm:col-span-2">
                <label className="label req">{t('users.sede')}</label>
                {sedes.length === 0
                  ? <p className="text-xs text-warning">{t('users.noSedes')}</p>
                  : <Select value={f.sedeId} onChange={(v) => set('sedeId', v)} placeholder={t('users.selectSede')} options={sedes.map(sedeOption)} />}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <Button disabled={busy} onClick={cerrar}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={busy} onClick={guardar}>
              {busy ? t('common.saving') : t('users.createAccount')}
            </Button>
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

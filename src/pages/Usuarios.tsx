import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { ShieldCheck, UserPlus, Copy, Check, Pencil, Trash2, AlertTriangle, UserX, SearchX } from 'lucide-react';
import {
  listPerfiles, updateRol, crearUsuario, listSedes, listPaises,
  listPaisesPorPerfil, setPaisesDePerfil, actualizarPerfil, eliminarUsuario,
} from '@/lib/api';
import { esAdmin } from '@/lib/roles';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select, type SelectOption } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { initials } from '@/lib/format';
import { useApp } from '@/store/useApp';
import type { Pais, Perfil, RolUsuario, Sede } from '@/types';

const ROLES: RolUsuario[] = ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'];
const rolColor: Record<RolUsuario, string> = {
  ADMIN: 'bg-danger/15 text-red-600 dark:text-danger',
  LIDER: 'bg-info/20 text-magenta-600 dark:text-info',
  JEFE_SEDE: 'bg-brand-500/15 text-brand-600 dark:text-brand-300',
  TECNICO: 'bg-success/15 text-emerald-700 dark:text-success',
};

/**
 * Roles con alcance geográfico. Se asignan por PAÍS y cubren todas las sedes de
 * ese país: tanto el Líder de sede como el Técnico pueden tener varios países
 * (mismos permisos; el nombre solo dice quién manda en la sede). El
 * Administrador y el Jefe (LIDER) no se limitan por país.
 */
const rolPorPais = (r: RolUsuario) => r === 'JEFE_SEDE' || r === 'TECNICO';
const paisOption = (p: Pais): SelectOption =>
  ({ value: p.id, label: p.codigo ? `${p.nombre} (${p.codigo})` : p.nombre });

export function Usuarios() {
  const { t } = useTranslation();
  const { data: perfiles = [], refetch, isLoading } = useQuery({ queryKey: ['perfiles'], queryFn: listPerfiles });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const { data: paises = [] } = useQuery({ queryKey: ['paises'], queryFn: listPaises });
  const { data: paisesPorPerfil = {}, refetch: refetchPaises } = useQuery({
    queryKey: ['perfil-paises'], queryFn: listPaisesPorPerfil,
  });
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<Perfil | null>(null);
  const [q, setQ] = useState('');
  const { perfil: yo } = useApp();
  const soyAdmin = esAdmin(yo?.rol);

  const filtrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return perfiles;
    return perfiles.filter((p) =>
      [p.nombre, p.correo, p.cedula, t(`rol.${p.rol}`)]
        .some((v) => v?.toLowerCase().includes(term)));
  }, [perfiles, q, t]);

  const recargar = () => { refetch(); refetchPaises(); };

  const change = async (id: string, rol: RolUsuario) => {
    try {
      await updateRol(id, rol);
      // Los roles sin alcance geográfico (ADMIN / Jefe) no conservan países.
      const actuales = paisesPorPerfil[id] ?? [];
      if (!rolPorPais(rol) && actuales.length) await setPaisesDePerfil(id, []);
      toast.success(t('common.success'));
    } catch (e: any) {
      toast.error(e?.message ?? t('common.error'));
    }
    recargar();
  };

  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} icon={ShieldCheck}
        action={<Button variant="primary" icon={UserPlus} onClick={() => setNuevo(true)}>{t('users.newUser')}</Button>} />

      <NuevoUsuarioModal open={nuevo} onClose={() => setNuevo(false)} onSaved={recargar} paises={paises} />
      <EditarUsuarioModal perfil={editando} paises={paises} asignados={editando ? paisesPorPerfil[editando.id] ?? [] : []}
        onClose={() => setEditando(null)} onSaved={recargar} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {ROLES.map((r) => (
          <div key={r} className="card p-4">
            <span className={`badge ${rolColor[r]}`}>{t(`rol.${r}`)}</span>
            <p className="text-xs text-ink-400 mt-2">{t(`rolDesc.${r}`)}</p>
          </div>
        ))}
      </div>

      {!isLoading && perfiles.length > 0 && (
        <div className="card p-4 mb-5">
          <SearchInput value={q} onChange={setQ} placeholder={t('users.searchPlaceholder')} />
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-white/5">
              <th className="px-5 py-3">{t('auth.name')}</th><th className="px-4 py-3">{t('auth.email')}</th><th className="px-4 py-3">{t('users.role')}</th><th className="px-4 py-3">{t('users.paises')}</th>
              {soyAdmin && <th className="px-4 py-3 text-right">{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && <SkeletonRows rows={5} cols={4} />}
            {!isLoading && filtrados.map((p) => (
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
                        <UserX size={11} /> {t('users.deactivated')}
                      </span>
                    )}
                    {p.id === yo?.id && (
                      <span className="badge bg-brand-500/15 text-brand-600 dark:text-brand-300">{t('users.you')}</span>
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
                  {rolPorPais(p.rol)
                    ? <PaisesUsuario perfil={p} paises={paises} sedes={sedes}
                        asignados={paisesPorPerfil[p.id] ?? []} onSaved={recargar} />
                    : <span className="text-ink-300">{t('users.todosLosPaises')}</span>}
                </td>
                {soyAdmin && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditando(p)} title={t('users.editUser')}
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
        {!isLoading && perfiles.length > 0 && filtrados.length === 0 && (
          <EmptyState icon={SearchX} title={t('common.noResultsTitle')} description={t('common.noResultsDesc')} />
        )}
      </div>
    </div>
  );
}

/** Edición completa de un usuario por el administrador. */
function EditarUsuarioModal({ perfil, paises, asignados, onClose, onSaved }:
  { perfil: Perfil | null; paises: Pais[]; asignados: string[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { perfil: yo } = useApp();
  const [f, setF] = useState({ nombre: '', cedula: '', cargo: '', rol: 'TECNICO' as RolUsuario, activo: true });
  const [paisIds, setPaisIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cargado, setCargado] = useState<string | null>(null);

  // Se siembra el formulario cuando cambia el usuario que se está editando, sin
  // useEffect: comparar el id contra el último cargado evita un render extra.
  if (perfil && cargado !== perfil.id) {
    setCargado(perfil.id);
    setF({
      nombre: perfil.nombre ?? '', cedula: perfil.cedula ?? '', cargo: perfil.cargo ?? '',
      rol: perfil.rol, activo: perfil.activo,
    });
    setPaisIds(asignados);
  }

  const esYo = perfil?.id === yo?.id;
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  const cambiarRol = (r: RolUsuario) => set('rol', r);

  const guardar = async () => {
    if (!f.nombre.trim()) { toast.error(t('form.requiredFields')); return; }
    if (rolPorPais(f.rol) && paisIds.length === 0) { toast.error(t('users.paisRequired')); return; }
    setBusy(true);
    try {
      await actualizarPerfil(perfil!.id, {
        nombre: f.nombre.trim(),
        cedula: f.cedula.trim() || null,
        cargo: f.cargo.trim() || null,
        rol: f.rol,
        activo: f.activo,
      });
      // Después del rol, porque el RPC valida el tope de países contra el rol ya
      // guardado. Sin alcance geográfico (ADMIN / Jefe) se limpian los países y
      // la base deja `sede_id` en NULL.
      const destino = rolPorPais(f.rol) ? paisIds : [];
      if (!mismosIds(destino, asignados)) await setPaisesDePerfil(perfil!.id, destino);
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
      title={t('users.editUser')} subtitle={perfil?.correo ?? undefined}>
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
          <label className="label">{t('users.cargo')}</label>
          <input className="input" value={f.cargo} onChange={(e) => set('cargo', e.target.value)} />
        </div>
        <div>
          <label className="label">{t('users.role')}</label>
          <Select value={f.rol} onChange={(v) => cambiarRol(v as RolUsuario)}
            options={ROLES.map((r) => ({ value: r, label: t(`rol.${r}`), description: t(`rolDesc.${r}`) }))} />
        </div>
        {rolPorPais(f.rol) && (
          <div className="sm:col-span-2">
            <label className="label req">{t('users.paises')}</label>
            {paises.length === 0
              ? <p className="text-xs text-warning">{t('users.noPaises')}</p>
              : <MultiSelect values={paisIds} onChange={setPaisIds} options={paises.map(paisOption)}
                  placeholder={t('users.selectPaises')} />}
            <p className="text-[11px] text-ink-400 mt-1 leading-snug">
              {t('users.paisHintJefeSede')}
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label">{t('auth.email')}</label>
          <div className="input bg-ink-50 dark:bg-white/5 text-ink-400 truncate">{perfil?.correo}</div>
          {/* Se explica por qué no es editable en vez de dejar el campo gris sin
              más: si no, parece un fallo de la pantalla. */}
          <p className="text-[11px] text-ink-400 mt-1 leading-snug">
            {t('users.emailReadonly')}
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
              <div className="text-sm font-medium">{t('users.accountActive')}</div>
              <div className="text-xs text-ink-400 leading-snug">
                {esYo ? t('users.cantDeactivateSelf')
                      : f.activo ? t('users.deactivateWarn')
                                 : t('users.deactivatedInfo')}
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
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState(false);

  // La propia cuenta no se ofrece siquiera. La base también lo impide, pero
  // pintar un botón que siempre falla no ayuda a nadie.
  if (esYo) return null;

  const eliminar = async () => {
    setBusy(true);
    try {
      await eliminarUsuario(perfil.id);
      toast.success(t('users.userDeleted', { nombre: perfil.nombre }));
      setAbierto(false); onDone();
    } catch (e: any) {
      toast.error(e?.message ?? t('users.errDelete'));
    } finally { setBusy(false); }
  };

  const desactivar = async () => {
    setBusy(true);
    try {
      await actualizarPerfil(perfil.id, { activo: false });
      toast.success(t('users.userDeactivated', { nombre: perfil.nombre }));
      setAbierto(false); onDone();
    } catch (e: any) {
      toast.error(e?.message ?? t('users.errDeactivate'));
    } finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setAbierto(true)} title={t('users.deleteUser')}
        className="btn-ghost !p-1.5 text-danger"><Trash2 size={15} /></button>

      <Modal open={abierto} onClose={() => !busy && setAbierto(false)} size="sm"
        title={t('users.deleteUser')} subtitle={perfil.nombre}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/25">
            <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
            <div className="text-sm leading-snug">
              <Trans i18nKey="users.deleteWarn" components={[<strong />]} />
            </div>
          </div>

          {perfil.activo && (
            <p className="text-sm text-ink-500 dark:text-ink-300 leading-snug">
              <Trans i18nKey="users.deactivateRecommend" components={[<strong />]} />
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={busy} onClick={() => setAbierto(false)}>{t('common.cancel')}</Button>
            {perfil.activo && (
              <button onClick={desactivar} disabled={busy} className="btn-secondary">
                <UserX size={15} /> {t('users.deactivate')}
              </button>
            )}
            <button onClick={eliminar} disabled={busy} className="btn-danger">
              <Trash2 size={15} /> {t('users.deleteForever')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Iguales sin importar el orden: evita guardar cuando no se cambió nada. */
const mismosIds = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Países de un usuario, editables desde la propia fila con un select de casillas.
 *
 * El alcance se asigna por país y cubre TODAS sus sedes, así que no hay que
 * volver a tocar a nadie cuando se abre una ciudad nueva. El Líder de sede puede
 * tener varios países; el Técnico, uno solo (`max`), y la base lo vuelve a
 * validar. Se guarda al cerrar el desplegable, no en cada casilla, para no
 * disparar una escritura por clic.
 *
 * El Administrador y el Jefe (LIDER) editan; para el resto es solo lectura.
 */
function PaisesUsuario({ perfil, paises, sedes, asignados, onSaved }:
  { perfil: Perfil; paises: Pais[]; sedes: Sede[]; asignados: string[]; onSaved: () => void }) {
  const { t } = useTranslation();
  const { perfil: yoPerfil } = useApp();
  const [sel, setSel] = useState<string[]>(asignados);
  const [busy, setBusy] = useState(false);
  // Se resiembra cuando el servidor devuelve otra cosa (guardado, recarga), sin
  // useEffect: comparar contra lo último visto evita un render de más.
  const [visto, setVisto] = useState(asignados.join());
  if (asignados.join() !== visto) { setVisto(asignados.join()); setSel(asignados); }

  const puedeEditar = esAdmin(yoPerfil?.rol) || yoPerfil?.rol === 'LIDER';
  const nSedes = sedes.filter((s) => sel.includes(s.pais_id)).length;

  const guardar = async (ids: string[]) => {
    if (mismosIds(ids, asignados)) return;
    setBusy(true);
    try {
      await setPaisesDePerfil(perfil.id, ids);
      toast.success(t('common.success'));
      onSaved();
    } catch (e: any) {
      setSel(asignados); // la base rechazó el cambio: la fila no debe mentir
      toast.error(e?.message ?? t('common.error'));
    } finally { setBusy(false); }
  };

  if (!puedeEditar) {
    const nombres = paises.filter((p) => asignados.includes(p.id)).map((p) => p.nombre);
    return (
      <div className="flex flex-wrap items-center gap-1">
        {nombres.length === 0 && <span className="text-ink-300">{t('users.sinPais')}</span>}
        {nombres.map((n) => (
          <span key={n} className="badge bg-brand-500/15 text-brand-600 dark:text-brand-300">{n}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-[11rem]">
      <MultiSelect
        values={sel}
        onChange={setSel}
        onCerrar={guardar}
        disabled={busy || paises.length === 0}
        options={paises.map(paisOption)}
        placeholder={paises.length ? t('users.selectPaises') : t('users.noPaises')}
        className="!py-1.5 text-xs"
      />
      {sel.length > 0 && (
        <p className="text-[11px] text-ink-400 mt-1">{t('users.sedesCubiertas', { n: nSedes })}</p>
      )}
    </div>
  );
}

function NuevoUsuarioModal({ open, onClose, onSaved, paises }: { open: boolean; onClose: () => void; onSaved: () => void; paises: Pais[] }) {
  const { t } = useTranslation();
  const vacio = { nombre: '', email: '', rol: 'TECNICO' as RolUsuario, cedula: '' };
  const [f, setF] = useState(vacio);
  const [paisIds, setPaisIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cred, setCred] = useState<{ link: string; email: string; password: string } | null>(null);
  const set = (k: keyof typeof vacio, v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const cambiarRol = (r: RolUsuario) => set('rol', r);

  const cerrar = () => { setF(vacio); setPaisIds([]); setCred(null); onClose(); };

  const guardar = async () => {
    if (!f.nombre || !f.email) { toast.error(t('form.requiredFields')); return; }
    if (rolPorPais(f.rol) && paisIds.length === 0) { toast.error(t('users.paisRequired')); return; }
    setBusy(true);
    try {
      const r = await crearUsuario({
        email: f.email.trim(), nombre: f.nombre.trim(), rol: f.rol,
        cedula: f.cedula.trim() || undefined,
        paisIds: rolPorPais(f.rol) ? paisIds : [],
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
              <Select value={f.rol} onChange={(v) => cambiarRol(v as RolUsuario)} options={ROLES.map((r) => ({ value: r, label: t(`rol.${r}`), description: t(`rolDesc.${r}`) }))} />
            </div>
            {rolPorPais(f.rol) && (
              <div className="sm:col-span-2">
                <label className="label req">{t('users.paises')}</label>
                {paises.length === 0
                  ? <p className="text-xs text-warning">{t('users.noPaises')}</p>
                  : <MultiSelect values={paisIds} onChange={setPaisIds} options={paises.map(paisOption)}
                      placeholder={t('users.selectPaises')} />}
                <p className="text-[11px] text-ink-400 mt-1 leading-snug">
                  {t('users.paisHintJefeSede')}
                </p>
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
  const { t } = useTranslation();
  const [ok, setOk] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); };
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <div className={`input flex-1 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
        <button onClick={copy} className="btn-secondary !px-3" title={t('common.copy')}>
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

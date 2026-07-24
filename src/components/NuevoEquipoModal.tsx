import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, UserPlus, Users } from 'lucide-react';
import { createEquipo, updateEquipo, listSedes, listMarcas, listProveedores, listColaboradores, cambiarEstadoEquipo } from '@/lib/api';
import { transicionesEstado, puedeCambiarEstado } from '@/lib/estados';
import { fmtDate } from '@/lib/format';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import type { Equipo } from '@/types';

const TIPOS = ['PORTATIL', 'ESCRITORIO', 'CELULAR', 'MONITOR', 'PERIFERICO', 'BASE_RECALENTAMIENTO', 'CARGADOR', 'OTRO'];
const FISICOS = ['BUENO', 'REGULAR', 'CON_FALLA', 'DANADO'];
const PROPIEDADES = ['EMPRESA', 'PROYECTO', 'RENTADO', 'COMODATO'];

// Definido fuera del componente: si estuviera dentro, React lo remontaría
// en cada tecla y el input perdería el foco (no dejaría escribir).
function Field({ label, k, f, set, type = 'text', req }: {
  label: string; k: keyof Equipo; f: Partial<Equipo>;
  set: (k: keyof Equipo, v: any) => void; type?: string; req?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}{req && <span className="text-danger"> *</span>}</label>
      <input
        type={type}
        className="input"
        value={(f[k] as string) ?? ''}
        onChange={(e) => set(k, type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </div>
  );
}

// Campos que se pueden editar (excluye id, codigo_qr, estado_asignacion, fechas del sistema, etc.)
const EDITABLES: (keyof Equipo)[] = [
  'marca', 'linea_modelo', 'descripcion_completa', 'serial', 'tipo', 'estado_fisico',
  'propiedad', 'proveedor_propietario', 'sede_id', 'fecha_ingreso',
  'fecha_vencimiento_contrato', 'numero_contrato', 'codigo_interno', 'ficha_tecnica', 'observaciones',
];

export function NuevoEquipoModal({ open, onClose, onSaved, equipo }: {
  open: boolean; onClose: () => void; onSaved: () => void; equipo?: Equipo;
}) {
  const { t } = useTranslation();
  const { perfil } = useApp();
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const { data: marcas = [] } = useQuery({ queryKey: ['marcas'], queryFn: listMarcas });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: listProveedores });
  const { data: colaboradores = [], isLoading: cargandoColabs } = useQuery({ queryKey: ['colaboradores'], queryFn: listColaboradores });
  const sedeFija = perfil?.rol === 'JEFE_SEDE' || perfil?.rol === 'TECNICO';
  const editando = !!equipo;

  // La fecha más reciente de la planta, para señalar qué tan al día está.
  const ultimaColabs = useMemo(() => {
    let max = '';
    for (const c of colaboradores) {
      const d = c.actualizado_en ?? c.creado_en ?? '';
      if (d > max) max = d;
    }
    return max || null;
  }, [colaboradores]);
  const [f, setF] = useState<Partial<Equipo>>({});
  const set = (k: keyof Equipo, v: any) => setF((s) => ({ ...s, [k]: v }));
  const qc = useQueryClient();

  // Reinicia el formulario cada vez que se abre: con los datos del equipo (editar) o vacío (crear).
  useEffect(() => {
    if (!open) return;
    setF(equipo
      ? { ...equipo }
      : { tipo: 'PORTATIL', estado_fisico: 'BUENO', propiedad: 'EMPRESA', sede_id: sedeFija ? perfil?.sede_id : null });
  }, [open, equipo]);

  // El estado de asignación no viaja en el patch normal: cambiarlo debe dejar
  // rastro en la trazabilidad, así que se hace por separado. Solo se ofrecen las
  // transiciones válidas desde el estado actual (ver `transicionesEstado`); un
  // equipo asignado o en devolución se cambia desde Asignar/Devolución.
  const estadoActual = equipo?.estado_asignacion;
  const opcionesEstado = estadoActual ? [estadoActual, ...transicionesEstado(estadoActual)] : [];
  const estadoBloqueado = !!estadoActual && !puedeCambiarEstado(estadoActual);

  const guardar = useMutation({
    mutationFn: async () => {
      if (!editando) return createEquipo(f);
      const patch: Partial<Equipo> = {};
      for (const k of EDITABLES) if (f[k] !== undefined) (patch as any)[k] = f[k];
      await updateEquipo(equipo!.id, patch);
      if (f.estado_asignacion && f.estado_asignacion !== equipo!.estado_asignacion) {
        await cambiarEstadoEquipo({ equipoId: equipo!.id, estadoNuevo: f.estado_asignacion });
      }
    },

    // Solo la edición se pinta de forma optimista: al crear no tenemos el id
    // que asigna el servidor, y una fila fantasma sin id rompe los enlaces.
    onMutate: async () => {
      if (!editando) return {};
      await qc.cancelQueries({ queryKey: ['equipos'] });
      const prev = qc.getQueryData<Equipo[]>(['equipos']);
      qc.setQueryData<Equipo[]>(['equipos'], (old) =>
        old?.map((e) => (e.id === equipo!.id ? { ...e, ...f } : e)));
      return { prev };
    },

    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['equipos'], ctx.prev);
      toast.error(e?.message ?? t('common.error'));
    },

    onSuccess: () => {
      toast.success(editando ? t('form.updated') : t('form.saved'));
      onSaved();
      onClose();
    },

    // Siempre revalida contra el servidor: el patch optimista no incluye los
    // campos que calcula la base (codigo_qr, timestamps).
    onSettled: () => qc.invalidateQueries({ queryKey: ['equipos'] }),
  });

  const save = () => {
    if (!f.marca || !f.linea_modelo || !f.serial) { toast.error(t('form.requiredFields')); return; }
    guardar.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title={editando ? t('form.editTitle') : t('form.newTitle')} subtitle={editando ? t('form.editSub') : t('form.newSub')} size="lg">
      {/* Al crear o editar: el equipo se asigna a una persona, y esa persona
          debe existir en la planta y estar al día para evitar errores. */}
      {!cargandoColabs && (
        colaboradores.length === 0 ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.08] p-4">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-warning" />
            <div className="text-sm">
              <p className="font-medium text-amber-700 dark:text-warning">Primero carga los colaboradores</p>
              <p className="mt-0.5 text-ink-500 dark:text-ink-300">
                Aún no hay colaboradores en el sistema. Sin la base de Talento Humano no habrá
                a quién asignarle este equipo.
              </p>
              <Link
                to="/colaboradores"
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                <UserPlus size={14} /> Cargar la base de colaboradores
              </Link>
            </div>
          </div>
        ) : (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-500/25 bg-brand-500/[0.06] p-4">
            <Users size={18} className="shrink-0 mt-0.5 text-brand-600 dark:text-brand-400" />
            <div className="text-sm">
              <p className="font-medium">Revisa que los colaboradores estén al día</p>
              <p className="mt-0.5 text-ink-500 dark:text-ink-300">
                Hay <strong className="text-ink-700 dark:text-ink-100">{colaboradores.length}</strong> colaboradores
                {ultimaColabs && <> (última actualización {fmtDate(ultimaColabs)})</>}. Si vas a asignar
                este equipo a alguien nuevo, confirma que ya esté en la lista para evitar errores.
              </p>
              <Link
                to="/colaboradores"
                onClick={onClose}
                className="mt-2 inline-flex items-center gap-1.5 font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                <Users size={14} /> Actualizar la base de colaboradores
              </Link>
            </div>
          </div>
        )
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{t('equipo.marca')}<span className="text-danger"> *</span></label>
          <input className="input" list="dl-marcas" value={f.marca ?? ''} onChange={(e) => set('marca', e.target.value)} placeholder={t('form.pickOrType')} />
          <datalist id="dl-marcas">{marcas.map((m) => <option key={m.id} value={m.nombre} />)}</datalist>
        </div>
        <Field label={t('equipo.modelo')} k="linea_modelo" f={f} set={set} req />
        <div className="sm:col-span-2"><Field label={t('equipo.descripcion')} k="descripcion_completa" f={f} set={set} /></div>
        <div>
          <label className="label">{t('equipo.serial')}<span className="text-danger"> *</span></label>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              value={f.serial ?? ''}
              onChange={(e) => set('serial', e.target.value)}
            />
            <button
              type="button"
              onClick={() => set('serial', 'N/A')}
              className="shrink-0 rounded-lg border border-ink-200 dark:border-white/15 px-3 text-sm font-medium text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-white/5"
              title={t('form.serialNAHint')}
            >
              N/A
            </button>
          </div>
        </div>
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
        {editando && (
          <div>
            <label className="label">{t('equipo.estadoAsignacion')}</label>
            <Select
              value={f.estado_asignacion ?? ''}
              onChange={(v) => set('estado_asignacion', v)}
              disabled={estadoBloqueado}
              options={opcionesEstado.map((x) => ({ value: x, label: t(`estadoAsig.${x}`), description: t(`estadoAsigDesc.${x}`) }))}
            />
            {estadoBloqueado && (
              <p className="text-[11px] text-ink-400 mt-1 leading-snug">{t('estadoCambio.bloqueadoCorto')}</p>
            )}
          </div>
        )}
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
        <Field label={t('equipo.fechaIngreso')} k="fecha_ingreso" type="date" f={f} set={set} />
        {f.propiedad === 'RENTADO' && (
          <>
            <Field label={t('equipo.fechaVencimiento')} k="fecha_vencimiento_contrato" type="date" f={f} set={set} />
            <Field label={t('equipo.numeroContrato')} k="numero_contrato" f={f} set={set} />
            <Field label={t('equipo.codigoInterno')} k="codigo_interno" type="number" f={f} set={set} />
          </>
        )}
        <div className="sm:col-span-2"><Field label={t('equipo.fichaTecnica')} k="ficha_tecnica" f={f} set={set} /></div>
        <div className="sm:col-span-2"><Field label={t('equipo.observaciones')} k="observaciones" f={f} set={set} /></div>
      </div>

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-ink-100 dark:border-white/10">
        <Button onClick={onClose} disabled={guardar.isPending}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={save} loading={guardar.isPending}>
          {guardar.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </Modal>
  );
}

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Undo2, Search, Warehouse, Truck, FileSignature, Eye, Check, X, Plus } from 'lucide-react';
import { listEquipos, listProveedores, getColaborador, devolverEquipo, createActa, subirPdfActa } from '@/lib/api';
import { generarActaPdf, abrirBlob, type ActaItem } from '@/lib/pdf';
import { ACTA_DEVOLUCION } from '@/lib/actaTemplates';
import { PageHeader } from '@/components/ui/PageHeader';
import { SignaturePad, type SignatureHandle } from '@/components/ui/SignaturePad';
import { Select } from '@/components/ui/Select';
import { EstadoBadge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import type { Equipo } from '@/types';

export function Devolucion() {
  const { t } = useTranslation();
  const { perfil } = useApp();
  const { data: equipos = [], refetch } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: listProveedores });

  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, Equipo>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [destino, setDestino] = useState<'bodega' | 'proveedor'>('bodega');
  const [proveedor, setProveedor] = useState('');
  const [novedades, setNovedades] = useState('');
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<SignatureHandle>(null);

  const seleccionados = Object.values(sel);

  // Solo se devuelve lo que está en manos de alguien: un equipo DISPONIBLE ya
  // está en bodega y no hay nada que devolver.
  const candidatos = equipos.filter((e) =>
    ['ASIGNADO', 'EN_MANTENIMIENTO'].includes(e.estado_asignacion) &&
    (!q || [e.serial, e.marca, e.linea_modelo, e.codigo_qr, e.tipo].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));

  const toggleEquipo = (e: Equipo) => {
    setSel((prev) => {
      const next = { ...prev };
      if (next[e.id]) delete next[e.id]; else next[e.id] = e;
      return next;
    });
  };

  const buildItems = (): ActaItem[] => seleccionados.map((e) => ({ equipo: e, observaciones: obs[e.id] }));

  const vistaPrevia = async () => {
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    try {
      const primero = seleccionados[0];
      const colab = primero.cedula_asignado ? await getColaborador(primero.cedula_asignado) : null;
      const blob = await generarActaPdf({
        tipo: 'DEVOLUCION', consecutivo: t('acta.previewWatermark'), items: buildItems(),
        colaborador: colab, firmaDataUrl: sigRef.current?.toDataURL(), tecnico: perfil?.nombre,
        tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      abrirBlob(blob, 'vista-previa-acta.pdf');
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const finalizar = async () => {
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    if (destino === 'proveedor' && !proveedor) { toast.error(t('return.selectSupplier')); return; }
    const firma = sigRef.current?.toDataURL();
    setBusy(true);
    try {
      const primero = seleccionados[0];
      const colab = primero.cedula_asignado ? await getColaborador(primero.cedula_asignado) : null;
      const acta = await createActa({
        tipo: 'DEVOLUCION', equipo_id: primero.id,
        items: seleccionados.map((e) => ({ equipo_id: e.id, observaciones: obs[e.id] })),
        cedula_colaborador: primero.cedula_asignado, firma_data: firma, firmado: !!firma, observaciones: novedades,
      });
      const blob = await generarActaPdf({
        tipo: 'DEVOLUCION', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(),
        colaborador: colab, firmaDataUrl: firma, tecnico: perfil?.nombre,
        tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      await subirPdfActa(acta.id, blob);
      for (const e of seleccionados) {
        await devolverEquipo({
          equipoId: e.id, aProveedor: destino === 'proveedor', proveedor: proveedor || undefined,
          actaId: acta.id, registradoPor: perfil?.cedula || perfil?.nombre, obs: obs[e.id] || novedades,
        });
      }
      abrirBlob(blob, `${acta.consecutivo || 'acta'}.pdf`);
      toast.success(t('return.done'));
      setSel({}); setObs({}); setNovedades(''); setProveedor(''); refetch();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title={t('return.title')} subtitle={t('return.subtitle')} icon={Undo2} />

      <div className="card p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">{t('return.selectMultiple')}</label>
            {seleccionados.length > 0 && (
              <span className="badge bg-brand-500/15 text-brand-600">{t('assign.selectedCount', { n: seleccionados.length })}</span>
            )}
          </div>
          <div className="relative my-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder={t('common.searchSerial')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {candidatos.map((e) => {
              const on = !!sel[e.id];
              return (
                <button key={e.id} onClick={() => toggleEquipo(e)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    on ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500' : 'border-ink-100 dark:border-white/10 hover:bg-ink-50 dark:hover:bg-white/5'}`}>
                  <div className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20'}`}>
                    {on && <Check size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{e.marca} {e.linea_modelo} <span className="text-xs text-ink-400">· {e.tipo}</span></div>
                    <div className="text-xs text-ink-400 font-mono">{e.serial} {e.cedula_asignado && `· C.C. ${e.cedula_asignado}`}</div>
                  </div>
                  <EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} />
                </button>
              );
            })}
            {candidatos.length === 0 && <p className="text-sm text-ink-400 text-center py-6">{t('common.empty')}</p>}
          </div>
        </div>

        {seleccionados.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="space-y-3">
              <div className="text-sm font-semibold">{t('assign.selectedItems')}</div>
              {seleccionados.map((e) => (
                <div key={e.id} className="p-3 rounded-xl bg-ink-50 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium truncate">{e.marca} {e.linea_modelo} <span className="text-xs text-ink-400 font-mono">· {e.serial}</span></div>
                    <button className="btn-ghost !p-1.5" onClick={() => toggleEquipo(e)}><X size={14} /></button>
                  </div>
                  <input className="input !py-1.5 text-sm" placeholder={t('assign.itemObs')}
                    value={obs[e.id] ?? ''} onChange={(ev) => setObs({ ...obs, [e.id]: ev.target.value })} />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {([['bodega', Warehouse, t('return.toWarehouse')], ['proveedor', Truck, t('return.toSupplier')]] as const).map(([val, Icon, label]) => (
                <button key={val} onClick={() => setDestino(val)}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                    destino === val ? 'border-brand-500 bg-brand-500/5' : 'border-ink-100 dark:border-white/10'}`}>
                  <Icon size={24} className={destino === val ? 'text-brand-500' : 'text-ink-400'} />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>

            {destino === 'proveedor' && (
              <div>
                <label className="label">{t('return.selectSupplier')}</label>
                <Select value={proveedor} onChange={setProveedor}
                  options={[{ value: '', label: '—' }, ...proveedores.map((p) => ({ value: p.nombre, label: p.nombre }))]} />
              </div>
            )}

            <div>
              <label className="label">{t('assign.novedades')}</label>
              <textarea className="input min-h-[60px]" value={novedades} onChange={(e) => setNovedades(e.target.value)} />
            </div>

            <div className="p-4 rounded-2xl bg-ink-50 dark:bg-white/5 text-sm">
              {seleccionados.map((e) => (
                <div key={e.id} className="text-ink-500 text-xs flex items-center gap-1.5">
                  <Plus size={11} /> {e.marca} {e.linea_modelo} · <span className="font-mono">{e.serial}</span>
                </div>
              ))}
            </div>
            <div className="p-4 rounded-2xl border border-ink-100 dark:border-white/10 bg-ink-50/60 dark:bg-white/5 max-h-40 overflow-y-auto space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-600">ASUNTO: {ACTA_DEVOLUCION.asunto}</div>
              {[...ACTA_DEVOLUCION.intro, ...ACTA_DEVOLUCION.legal].map((par, i) => (
                <p key={i} className="text-xs text-ink-500 dark:text-ink-300 leading-relaxed">{par}</p>
              ))}
            </div>
            <button type="button" className="btn-secondary w-full" onClick={vistaPrevia}>
              <Eye size={16} /> {t('acta.preview')}
            </button>

            <div>
              <label className="label">{t('acta.signature')}</label>
              <SignaturePad ref={sigRef} />
            </div>

            <div className="flex justify-end">
              <button className="btn-primary" disabled={busy} onClick={finalizar}>
                {busy ? t('common.loading') : <><FileSignature size={16} /> {t('return.generate')}</>}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

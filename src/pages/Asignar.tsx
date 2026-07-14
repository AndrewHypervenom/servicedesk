import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Search, Check, ArrowRight, ArrowLeft, FileSignature, Mail, Eye, Plus, X } from 'lucide-react';
import { listEquipos, getColaborador, asignarEquipo, createActa, subirPdfActa, listSedes } from '@/lib/api';
import { generarActaPdf, abrirBlob, blobToBase64, type ActaItem } from '@/lib/pdf';
import { supabase } from '@/lib/supabase';
import { ACTA_ASIGNACION } from '@/lib/actaTemplates';
import { PageHeader } from '@/components/ui/PageHeader';
import { SignaturePad, type SignatureHandle } from '@/components/ui/SignaturePad';
import { EstadoBadge } from '@/components/ui/Badge';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import type { Colaborador, Equipo } from '@/types';

export function Asignar() {
  const { t } = useTranslation();
  const { perfil, puedeAsignarASede } = useApp();
  const { data: equipos = [], refetch } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const disponibles = equipos.filter((e) => e.estado_asignacion === 'DISPONIBLE');

  const [step, setStep] = useState(0);
  const [cedula, setCedula] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [colab, setColab] = useState<Colaborador | null>(null);
  const [sel, setSel] = useState<Record<string, Equipo>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [novedades, setNovedades] = useState('');
  const [sendMail, setSendMail] = useState(true);
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<SignatureHandle>(null);

  const seleccionados = Object.values(sel);

  // Un Técnico o Líder de sede solo asigna a colaboradores de sus sedes. Puede
  // verlos, pero no continuar. La base lo vuelve a validar (asignacion_guard).
  const permitido = !colab || puedeAsignarASede(colab.sede_id);
  const sedeColab = sedes.find((s) => s.id === colab?.sede_id)?.nombre ?? colab?.sede;

  const buscar = async () => {
    if (!cedula.trim()) return;
    const c = await getColaborador(cedula.trim());
    setBuscado(true);
    setColab(c);
  };

  const toggleEquipo = (e: Equipo) => {
    setSel((prev) => {
      const next = { ...prev };
      if (next[e.id]) delete next[e.id]; else next[e.id] = e;
      return next;
    });
  };

  const buildItems = (): ActaItem[] =>
    seleccionados.map((e) => ({ equipo: e, observaciones: obs[e.id] }));

  const vistaPrevia = async () => {
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    try {
      const blob = await generarActaPdf({
        tipo: 'ENTREGA', consecutivo: t('acta.previewWatermark'), items: buildItems(),
        colaborador: colab, firmaDataUrl: sigRef.current?.toDataURL(),
        tecnico: perfil?.nombre, tecnicoCedula: perfil?.cedula ?? undefined,
        firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      abrirBlob(blob, 'vista-previa-acta.pdf');
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const finalizar = async () => {
    if (!colab) return;
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    const firma = sigRef.current?.toDataURL();
    if (!firma) { toast.error(t('common.signHere')); return; }
    setBusy(true);
    try {
      const c = colab;

      const acta = await createActa({
        tipo: 'ENTREGA', equipo_id: seleccionados[0].id,
        items: seleccionados.map((e) => ({ equipo_id: e.id, observaciones: obs[e.id] })),
        cedula_colaborador: c.cedula, firma_data: firma, firmado: true,
        correo_destino: c.correo, observaciones: novedades,
      });

      const blob = await generarActaPdf({
        tipo: 'ENTREGA', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(),
        colaborador: c, firmaDataUrl: firma, tecnico: perfil?.nombre,
        tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      await subirPdfActa(acta.id, blob);

      for (const e of seleccionados) {
        await asignarEquipo({
          equipoId: e.id, cedula: c.cedula, proyecto: c.proyecto || e.proyecto_asignado || '',
          actaId: acta.id, registradoPor: perfil?.cedula || perfil?.nombre, obs: obs[e.id],
        });
      }

      if (sendMail && c.correo) {
        try {
          const b64 = await blobToBase64(blob);
          await supabase.functions.invoke('enviar-acta', {
            body: {
              acta_id: acta.id, correo_destino: c.correo,
              asunto: `Acta de entrega ${acta.consecutivo}`, pdf_base64: b64,
              nombre_archivo: `${acta.consecutivo}.pdf`,
            },
          });
        } catch { /* noop */ }
      }

      abrirBlob(blob, `${acta.consecutivo || 'acta'}.pdf`);
      toast.success(t('assign.done'));
      setStep(0); setCedula(''); setBuscado(false); setColab(null);
      setSel({}); setObs({}); setNovedades('');
      refetch();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  const steps = [t('assign.step1'), t('assign.step2multi'), t('assign.step3')];
  const filtered = disponibles.filter((e) =>
    !q || [e.serial, e.marca, e.linea_modelo, e.codigo_qr, e.tipo].some((v) => v?.toLowerCase().includes(q.toLowerCase())));

  const dato = (label: string, value?: string | null) => (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="text-sm font-medium">{value || '—'}</div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title={t('assign.title')} subtitle={t('assign.subtitle')} icon={UserPlus} />
      <div className="flex items-center justify-between mb-8 px-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold transition-colors ${
                i < step ? 'bg-success text-white' : i === step ? 'bg-brand-500 text-white' : 'bg-ink-100 dark:bg-ink-700 text-ink-400'}`}>
                {i < step ? <Check size={16} /> : i + 1}
              </div>
              <span className={`text-sm font-medium hidden sm:block ${i === step ? '' : 'text-ink-400'}`}>{s}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-px mx-3 ${i < step ? 'bg-success' : 'bg-ink-100 dark:bg-white/10'}`} />}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="card p-6">
            <label className="label">{t('assign.enterCedula')}</label>
            <div className="flex gap-2">
              <input className="input" value={cedula} onChange={(e) => setCedula(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="1022352593" />
              <button onClick={buscar} className="btn-primary shrink-0"><Search size={16} /> {t('common.search')}</button>
            </div>

            {buscado && colab && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 rounded-2xl bg-success/8 border border-success/20">
                <div className="flex items-center gap-2 text-sm font-semibold mb-3 text-emerald-700 dark:text-success">
                  <Check size={16} /> {t('assign.found')}
                </div>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {dato(t('auth.name'), colab.nombre)}
                  {dato('Cargo', colab.cargo)}
                  {dato(t('auth.email'), colab.correo)}
                  {dato(t('equipo.proyectoAsignado'), colab.proyecto)}
                  {dato('Líder inmediato', colab.lider)}
                  {dato('Sede', sedeColab)}
                </div>
              </motion.div>
            )}

            {buscado && colab && !permitido && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-3 p-4 rounded-2xl bg-danger/8 border border-danger/20 text-sm text-red-600 dark:text-danger">
                {colab.sede_id
                  ? t('assign.otraSede', { sede: sedeColab })
                  : t('assign.sinSede')}
              </motion.div>
            )}

            {buscado && !colab && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 rounded-2xl bg-warning/8 border border-warning/20 text-sm text-amber-600 dark:text-warning">
                {t('assign.notRegistered')}
              </motion.div>
            )}

            <div className="flex justify-end mt-6">
              <button className="btn-primary" disabled={!colab || !permitido} onClick={() => setStep(1)}>
                {t('common.next')} <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}
        {step === 1 && (
          <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="card p-6">
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">{t('assign.selectMultiple')}</label>
              {seleccionados.length > 0 && (
                <span className="badge bg-brand-500/15 text-brand-600">{t('assign.selectedCount', { n: seleccionados.length })}</span>
              )}
            </div>
            <div className="relative my-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder={t('common.searchSerial')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filtered.map((e) => {
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
                      <div className="text-xs text-ink-400 font-mono">{e.serial} · {e.codigo_qr}</div>
                    </div>
                    <EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} />
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="text-sm text-ink-400 text-center py-6">{t('common.empty')}</p>}
            </div>
            {seleccionados.length > 0 && (
              <div className="mt-5 pt-5 border-t border-ink-100 dark:border-white/10 space-y-3">
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
            )}

            <div className="flex justify-between mt-6">
              <button className="btn-secondary" onClick={() => setStep(0)}><ArrowLeft size={16} /> {t('common.back')}</button>
              <button className="btn-primary" disabled={!seleccionados.length} onClick={() => setStep(2)}>{t('common.next')} <ArrowRight size={16} /></button>
            </div>
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="card p-6">
            <div className="flex items-center gap-2 mb-1"><FileSignature size={18} className="text-brand-500" /><h3 className="font-semibold">{t('assign.signTitle')}</h3></div>
            <p className="text-sm text-ink-400 mb-4">{t('assign.signSub')}</p>

            <div className="p-4 rounded-2xl bg-ink-50 dark:bg-white/5 mb-4 text-sm">
              <div className="font-medium mb-1">→ {colab?.nombre} · {colab?.proyecto || '—'}</div>
              {seleccionados.map((e) => (
                <div key={e.id} className="text-ink-500 text-xs flex items-center gap-1.5">
                  <Plus size={11} /> {e.marca} {e.linea_modelo} · <span className="font-mono">{e.serial}</span>
                </div>
              ))}
            </div>
            <div className="mb-4">
              <label className="label">{t('assign.novedades')}</label>
              <textarea className="input min-h-[60px]" value={novedades} onChange={(e) => setNovedades(e.target.value)} />
            </div>
            <div className="mb-3 p-4 rounded-2xl border border-ink-100 dark:border-white/10 bg-ink-50/60 dark:bg-white/5 max-h-40 overflow-y-auto space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-600">ASUNTO: {ACTA_ASIGNACION.asunto}</div>
              {[...ACTA_ASIGNACION.intro, ...ACTA_ASIGNACION.legal].map((par, i) => (
                <p key={i} className="text-xs text-ink-500 dark:text-ink-300 leading-relaxed">{par}</p>
              ))}
            </div>
            <button type="button" className="btn-secondary w-full mb-4" onClick={vistaPrevia}>
              <Eye size={16} /> {t('acta.preview')}
            </button>

            <SignaturePad ref={sigRef} />

            <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer">
              <input type="checkbox" checked={sendMail} onChange={(e) => setSendMail(e.target.checked)} className="accent-brand-500 w-4 h-4" />
              <Mail size={15} /> {t('assign.sendCopy')}
            </label>

            <div className="flex justify-between mt-6">
              <button className="btn-secondary" onClick={() => setStep(1)}><ArrowLeft size={16} /> {t('common.back')}</button>
              <button className="btn-primary" disabled={busy} onClick={finalizar}>
                {busy ? t('common.loading') : <><FileSignature size={16} /> {t('assign.generateActa')}</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

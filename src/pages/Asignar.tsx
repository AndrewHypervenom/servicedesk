import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Search, Check, ArrowRight, ArrowLeft, FileSignature, Eye, Plus, X, SearchX, AlertTriangle, Wrench, FileWarning } from 'lucide-react';
import { listEquipos, getColaborador, asignarEquipo, createActa, updateActa, deleteActa, subirPdfActa, subirActaFirmada, listSedes } from '@/lib/api';
import { generarActaPdf, abrirBlob, type ActaItem } from '@/lib/pdf';
import { ACTA_ASIGNACION } from '@/lib/actaTemplates';
import { fmtDate, fmtSerial } from '@/lib/format';
import { aptitudEntrega, motivoNoEntregable, type MotivoNoEntregable } from '@/lib/estados';
import { useTrabajoEnCurso } from '@/lib/actualizacion';
import { CambiarEstadoModal } from '@/components/CambiarEstadoModal';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FirmaActa, type FirmaActaHandle } from '@/components/ui/FirmaActa';
import { EstadoBadge, FisicoBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import { puedeSegundoPortatil } from '@/lib/roles';
import { useEditingPresence } from '@/lib/presence/hooks';
import { CoeditBanner } from '@/components/presence';
import type { Acta, Colaborador, Equipo } from '@/types';

export function Asignar() {
  const { t, i18n } = useTranslation();
  const { perfil, puedeAsignarASede, can } = useApp();
  const { data: equipos = [], refetch } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: sedes = [] } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });
  const disponibles = equipos.filter((e) => e.estado_asignacion === 'DISPONIBLE');
  // Mandar a mantenimiento es un cambio de estado: mismos roles que en la ficha.
  const puedeReparar = can('ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO');

  const [step, setStep] = useState(0);
  const [cedula, setCedula] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [colab, setColab] = useState<Colaborador | null>(null);
  const [sel, setSel] = useState<Record<string, Equipo>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [novedades, setNovedades] = useState('');
  const [busy, setBusy] = useState(false);
  // Confirmación explícita para entregar un equipo con falla conocida.
  const [aceptaFalla, setAceptaFalla] = useState(false);
  // Equipo que se está mandando a mantenimiento desde este mismo flujo.
  const [aReparar, setAReparar] = useState<Equipo | null>(null);
  const firmaRef = useRef<FirmaActaHandle>(null);
  // Acta reservada: se crea al descargarla para firmar a mano, para que el
  // papel salga con su consecutivo definitivo y no con un marcador.
  const borradorRef = useRef<Acta | null>(null);

  const seleccionados = Object.values(sel);

  // Una entrega a medias (colaborador buscado o equipos elegidos, firma sin
  // guardar) se perdería al recargar: se declara para que el aviso de versión
  // nueva pida guardar en vez de actualizar solo.
  useTrabajoEnCurso(!!colab || seleccionados.length > 0, t('update.workAssign'));

  // Presencia: una asignación es un flujo con un colaborador de ancla (el
  // payload lleva una sola actividad por pestaña). Declaro que estoy asignándole
  // equipos para que dos técnicos no le entreguen a la misma persona a la vez.
  const coeditores = useEditingPresence(
    colab ? { type: 'colaborador', id: colab.cedula, title: colab.nombre, detail: 'Asignando equipos' } : null,
  );

  // Un Técnico o Líder de sede solo asigna a colaboradores de sus sedes. Puede
  // verlos, pero no continuar. La base lo vuelve a validar (asignacion_guard).
  const permitido = !colab || puedeAsignarASede(colab.sede_id);

  // Regla: un colaborador no puede terminar con más de un portátil. La excepción
  // (p. ej. gerentes) la autoriza quien responde por la entrega —ADMIN, Jefe y
  // Líder de sede—, que asigna directamente.
  // Contamos los portátiles ya en su poder más los portátiles de esta entrega.
  const autorizaSegundo = puedeSegundoPortatil(perfil?.rol);
  const portatilesActuales = colab
    ? equipos.filter((e) => e.cedula_asignado === colab.cedula &&
        e.tipo === 'PORTATIL' && e.estado_asignacion === 'ASIGNADO').length
    : 0;
  const portatilesSeleccionados = seleccionados.filter((e) => e.tipo === 'PORTATIL').length;
  const totalPortatiles = portatilesActuales + portatilesSeleccionados;
  // Más de un portátil en total: bloqueado salvo para quien puede autorizarlo.
  const excedePortatiles = totalPortatiles > 1 && !autorizaSegundo;
  // Aviso informativo cuando se usa la excepción.
  const usaExcepcionPortatil = totalPortatiles > 1 && autorizaSegundo;
  const sedeColab = sedes.find((s) => s.id === colab?.sede_id)?.nombre ?? colab?.sede;

  const buscar = async () => {
    if (!cedula.trim()) return;
    const c = await getColaborador(cedula.trim());
    setBuscado(true);
    setColab(c);
  };

  // Equipos con falla que el técnico eligió igual: el aviso se muestra por
  // ellos y hay que confirmarlo antes de seguir.
  const conFalla = seleccionados.filter((e) => aptitudEntrega(e.estado_fisico) === 'ADVERTENCIA');
  // Cinturón y tirantes: si un equipo se dañó (o se le venció el contrato)
  // entre la carga y el guardado, aquí se detiene igual (la lista ya no deja
  // elegirlo). La base lo vuelve a validar en el trigger de asignación.
  const bloqueadosElegidos = seleccionados.filter((e) => motivoNoEntregable(e) !== null);
  const faltaConfirmarFalla = conFalla.length > 0 && !aceptaFalla;

  // Un solo texto para cada motivo, usado en el toast y en el aviso de la fila.
  const textoBloqueo = (e: Equipo, motivo: MotivoNoEntregable) =>
    motivo === 'CONTRATO'
      ? t('assign.contratoVencidoNoAsignable', { fecha: fmtDate(e.fecha_vencimiento_contrato, i18n.language) })
      : t('assign.danadoNoAsignable', { estado: t(`estadoFis.${e.estado_fisico}`).toLowerCase() });

  // Cambiar de equipos vuelve a pedir la confirmación: se acepta una falla
  // concreta, no "las fallas" en general.
  const idsConFalla = conFalla.map((e) => e.id).sort().join(',');
  useEffect(() => { setAceptaFalla(false); }, [idsConFalla]);

  const toggleEquipo = (e: Equipo) => {
    // Un equipo dañado, de baja o con el contrato de renta vencido no entra en
    // un acta de entrega: lo que corresponde es repararlo o devolverlo al
    // proveedor, no entregarlo así.
    const motivo = motivoNoEntregable(e);
    if (motivo && !sel[e.id]) {
      toast.error(textoBloqueo(e, motivo));
      return;
    }
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
        colaborador: colab, firmaDataUrl: firmaRef.current?.toDataURL(),
        tecnico: perfil?.nombre, tecnicoCedula: perfil?.cedula ?? undefined,
        firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      abrirBlob(blob, 'vista-previa-acta.pdf');
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  /**
   * Devuelve el acta de este flujo, creándola la primera vez. Al descargarla
   * para firmar en físico hay que reservar ya el consecutivo, porque es el que
   * queda impreso en el papel que firma el colaborador.
   */
  const asegurarActa = async (c: Colaborador): Promise<Acta> => {
    const datos = {
      tipo: 'ENTREGA' as const, equipo_id: seleccionados[0].id,
      items: seleccionados.map((e) => ({ equipo_id: e.id, observaciones: obs[e.id] })),
      cedula_colaborador: c.cedula, correo_destino: c.correo, observaciones: novedades,
    };
    const previo = borradorRef.current;
    if (previo) {
      // Pudo cambiar equipos u observaciones después de descargar: se refresca
      // el registro conservando el consecutivo ya reservado.
      await updateActa(previo.id, datos);
      borradorRef.current = { ...previo, ...datos };
      return borradorRef.current;
    }
    // Se guarda en el acta quién la generó: al reabrirla, el técnico que firma
    // el documento es este y no quien la esté consultando.
    const acta = await createActa({ ...datos, firmado: false, generado_por: perfil?.id ?? null });
    borradorRef.current = acta;
    return acta;
  };

  /** Suelta el acta reservada si el técnico abandona el flujo sin finalizar. */
  const descartarBorrador = () => {
    const b = borradorRef.current;
    borradorRef.current = null;
    // Si el borrado falla (p. ej. por RLS) el acta queda visible en la lista
    // como pendiente de firma, que es recuperable; no vale romper el flujo.
    if (b) deleteActa(b.id).catch(() => { /* noop */ });
  };

  useEffect(() => descartarBorrador, []);

  // Acta sin firmar, para el flujo manual: se descarga, se firma a mano y se
  // vuelve a subir escaneada.
  const descargarParaFirmar = async () => {
    if (!colab) return;
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    try {
      const acta = await asegurarActa(colab);
      const blob = await generarActaPdf({
        tipo: 'ENTREGA', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(),
        colaborador: colab, tecnico: perfil?.nombre, tecnicoCedula: perfil?.cedula ?? undefined,
        firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      abrirBlob(blob, `${acta.consecutivo || `acta-entrega-${colab.cedula}`}.pdf`);
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const finalizar = async () => {
    if (!colab) return;
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    if (excedePortatiles) { toast.error(t('assign.requiereAdmin')); return; }
    if (bloqueadosElegidos.length) {
      const e = bloqueadosElegidos[0];
      toast.error(textoBloqueo(e, motivoNoEntregable(e)!));
      return;
    }
    if (faltaConfirmarFalla) { toast.error(t('assign.confirmaFalla')); return; }
    const modo = firmaRef.current?.getMode() ?? 'digital';
    const firma = modo === 'digital' ? firmaRef.current?.toDataURL() : null;
    const archivoFirmado = modo === 'manual' ? firmaRef.current?.getArchivo() : null;
    if (modo === 'digital' && !firma) { toast.error(t('common.signHere')); return; }
    if (modo === 'manual' && !archivoFirmado) { toast.error(t('acta.faltaArchivo')); return; }
    setBusy(true);
    try {
      const c = colab;

      // Reutiliza el acta ya reservada si se descargó para firmar a mano, así
      // el consecutivo del papel firmado es el que queda guardado.
      const acta = await asegurarActa(c);

      // Firma física: el acta oficial es el archivo escaneado que sube el
      // técnico. No se genera ni se guarda la versión de firma digital, porque
      // esa quedaría sin firma del colaborador y compite con la real.
      let documento: Blob;
      let nombreDoc: string;
      if (archivoFirmado) {
        await subirActaFirmada(acta.id, archivoFirmado);
        documento = archivoFirmado;
        nombreDoc = archivoFirmado.name;
      } else {
        await updateActa(acta.id, { firma_data: firma, firmado: true });
        documento = await generarActaPdf({
          tipo: 'ENTREGA', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(),
          colaborador: c, firmaDataUrl: firma, tecnico: perfil?.nombre,
          tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: perfil?.firma_data, novedades,
        });
        await subirPdfActa(acta.id, documento);
        nombreDoc = `${acta.consecutivo || 'acta'}.pdf`;
      }
      // Ya está firmada y guardada: deja de ser un borrador descartable.
      borradorRef.current = null;

      for (const e of seleccionados) {
        await asignarEquipo({
          equipoId: e.id, cedula: c.cedula, proyecto: c.proyecto || e.proyecto_asignado || '',
          actaId: acta.id, registradoPor: perfil?.cedula || perfil?.nombre, obs: obs[e.id],
        });
      }

      // El envío del acta por correo se retiró: la Edge Function `enviar-acta`
      // no está desplegada y el checkbox prometía un correo que nunca salía.
      // Cuando se despliegue (deploy + secrets de Resend), restaurar aquí la
      // llamada Y avisar con un toast si falla, en vez de tragarse el error.
      abrirBlob(documento, nombreDoc);
      toast.success(t('assign.done'));
      setStep(0); setCedula(''); setBuscado(false); setColab(null);
      setSel({}); setObs({}); setNovedades(''); setAceptaFalla(false);
      refetch();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  const steps = [t('assign.step1'), t('assign.step2multi'), t('assign.step3')];
  // Los no entregables se muestran igual —si no, buscar su serial no daría nada
  // y parecería un error— pero al final de la lista y sin poder elegirlos.
  const filtered = disponibles
    .filter((e) => !q || [fmtSerial(e.serial), e.marca, e.linea_modelo, e.codigo_qr, e.tipo].some((v) => v?.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(motivoNoEntregable(a) !== null) - Number(motivoNoEntregable(b) !== null));
  const bloqueadosVisibles = filtered.filter((e) => motivoNoEntregable(e) !== null).length;

  const dato = (label: string, value?: string | null) => (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className="text-sm font-medium">{value || '—'}</div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title={t('assign.title')} subtitle={t('assign.subtitle')} icon={UserPlus} />
      {coeditores.length > 0 && <CoeditBanner peers={coeditores} className="mb-6" />}
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
                  {dato(t('colabField.centroCostos'), colab.centro_costos)}
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
                const aptitud = aptitudEntrega(e.estado_fisico);
                const motivo = motivoNoEntregable(e);
                const bloqueado = motivo !== null;
                return (
                  <div key={e.id}
                    className={`rounded-xl border transition-all ${
                      bloqueado ? 'border-danger/25 bg-danger/[0.04]'
                        : on ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                          : 'border-ink-100 dark:border-white/10 hover:bg-ink-50 dark:hover:bg-white/5'}`}>
                    <button
                      type="button"
                      onClick={() => toggleEquipo(e)}
                      disabled={bloqueado}
                      aria-disabled={bloqueado}
                      title={motivo ? textoBloqueo(e, motivo) : undefined}
                      className={`w-full text-left p-3 flex items-center gap-3 ${bloqueado ? 'cursor-not-allowed opacity-70' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border ${
                        bloqueado ? 'border-danger/40 text-red-600 dark:text-danger'
                          : on ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20'}`}>
                        {bloqueado ? <X size={13} /> : on && <Check size={13} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{e.marca} {e.linea_modelo} <span className="text-xs text-ink-400">· {e.tipo}</span></div>
                        <div className="text-xs text-ink-400 font-mono">{fmtSerial(e.serial)} · {e.codigo_qr}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} />
                        {aptitud !== 'APTO' && (
                          <FisicoBadge estado={e.estado_fisico} label={t(`estadoFis.${e.estado_fisico}`)} />
                        )}
                        {motivo === 'CONTRATO' && (
                          <span className="badge bg-danger/15 text-red-600 dark:text-danger">
                            <FileWarning size={11} /> {t('assign.contratoVencidoBadge')}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Por qué no se puede entregar y qué hacer en su lugar. */}
                    {motivo === 'FISICO' && (
                      <div className="px-3 pb-3 -mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-red-600 dark:text-danger">
                        <span className="inline-flex items-center gap-1.5">
                          <AlertTriangle size={13} className="shrink-0" />
                          {t('assign.danadoInline', { estado: t(`estadoFis.${e.estado_fisico}`).toLowerCase() })}
                        </span>
                        {puedeReparar ? (
                          <button type="button" onClick={() => setAReparar(e)}
                            className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-warning hover:underline">
                            <Wrench size={12} /> {t('assign.enviarMantenimiento')}
                          </button>
                        ) : (
                          <span className="text-ink-400">{t('assign.danadoAvisaSoporte')}</span>
                        )}
                      </div>
                    )}

                    {/* El contrato no se arregla en mantenimiento: hay que
                        renovarlo o devolver el equipo al proveedor. */}
                    {motivo === 'CONTRATO' && (
                      <div className="px-3 pb-3 -mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-red-600 dark:text-danger">
                        <span className="inline-flex items-center gap-1.5">
                          <FileWarning size={13} className="shrink-0" />
                          {t('assign.contratoVencidoInline', {
                            fecha: fmtDate(e.fecha_vencimiento_contrato, i18n.language),
                          })}
                        </span>
                        <span className="text-ink-400">
                          {e.proveedor_propietario ? `${e.proveedor_propietario} · ` : ''}
                          {t('assign.contratoVencidoAviso')}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <EmptyState variant="search" icon={SearchX} title={t('common.noResultsTitle')} description={t('assign.noCandidates')} className="!py-8" />
              )}
            </div>

            {bloqueadosVisibles > 0 && (
              <p className="mt-2 text-xs text-ink-400">
                {t('assign.bloqueadosResumen', { count: bloqueadosVisibles })}
              </p>
            )}
            {seleccionados.length > 0 && (
              <div className="mt-5 pt-5 border-t border-ink-100 dark:border-white/10 space-y-3">
                <div className="text-sm font-semibold">{t('assign.selectedItems')}</div>
                {seleccionados.map((e) => (
                  <div key={e.id} className="p-3 rounded-xl bg-ink-50 dark:bg-white/5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="text-sm font-medium truncate">{e.marca} {e.linea_modelo} <span className="text-xs text-ink-400 font-mono">· {fmtSerial(e.serial)}</span></div>
                      <button className="btn-ghost !p-1.5" onClick={() => toggleEquipo(e)}><X size={14} /></button>
                    </div>
                    <input className="input !py-1.5 text-sm" placeholder={t('assign.itemObs')}
                      value={obs[e.id] ?? ''} onChange={(ev) => setObs({ ...obs, [e.id]: ev.target.value })} />
                  </div>
                ))}
              </div>
            )}

            {/* Falla conocida: se puede entregar, pero no sin querer. */}
            {conFalla.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-4 p-4 rounded-2xl bg-warning/8 border border-warning/25">
                <div className="flex items-start gap-2.5 text-sm text-amber-600 dark:text-warning">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold">{t('assign.conFallaTitulo', { count: conFalla.length })}</div>
                    <div className="mt-1 space-y-0.5 text-xs">
                      {conFalla.map((e) => (
                        <div key={e.id} className="truncate">
                          {e.marca} {e.linea_modelo} · <span className="font-mono">{fmtSerial(e.serial)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-ink-500 dark:text-ink-300 leading-relaxed">
                      {t('assign.conFallaTexto')}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pl-[26px]">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 rounded accent-brand-500 cursor-pointer"
                      checked={aceptaFalla} onChange={(ev) => setAceptaFalla(ev.target.checked)} />
                    {t('assign.conFallaConfirmo')}
                  </label>
                  {puedeReparar && conFalla.length === 1 && (
                    <button type="button" onClick={() => setAReparar(conFalla[0])}
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-warning hover:underline">
                      <Wrench size={12} /> {t('assign.enviarMantenimiento')}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {excedePortatiles && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-4 p-4 rounded-2xl bg-danger/8 border border-danger/20 text-sm text-red-600 dark:text-danger">
                {portatilesActuales > 0 ? t('assign.unPortatilYaAsignado') : t('assign.dosPortatilesSeleccionados')}
                {' '}{t('assign.requiereAdmin')}
              </motion.div>
            )}
            {usaExcepcionPortatil && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-4 p-4 rounded-2xl bg-warning/8 border border-warning/20 text-sm text-amber-600 dark:text-warning">
                {t('assign.adminOverridePortatil')}
              </motion.div>
            )}

            <div className="flex justify-between mt-6">
              <button className="btn-secondary" onClick={() => setStep(0)}><ArrowLeft size={16} /> {t('common.back')}</button>
              <button className="btn-primary" disabled={!seleccionados.length || excedePortatiles || faltaConfirmarFalla || bloqueadosElegidos.length > 0} onClick={() => setStep(2)}>{t('common.next')} <ArrowRight size={16} /></button>
            </div>
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="card p-6">
            <div className="flex items-center gap-2 mb-1"><FileSignature size={18} className="text-brand-500" /><h3 className="font-semibold">{t('assign.signTitle')}</h3></div>
            <p className="text-sm text-ink-400 mb-4">{t('assign.signSub')}</p>

            <div className="p-4 rounded-2xl bg-ink-50 dark:bg-white/5 mb-4 text-sm">
              <div className="font-medium mb-1">→ {colab?.nombre} · {colab?.centro_costos || '—'}</div>
              {seleccionados.map((e) => (
                <div key={e.id} className="text-ink-500 text-xs flex items-center gap-1.5">
                  <Plus size={11} /> {e.marca} {e.linea_modelo} · <span className="font-mono">{fmtSerial(e.serial)}</span>
                  {aptitudEntrega(e.estado_fisico) !== 'APTO' && (
                    <span className="text-amber-600 dark:text-warning">· {t(`estadoFis.${e.estado_fisico}`)}</span>
                  )}
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

            <FirmaActa ref={firmaRef} onDescargar={descargarParaFirmar} />

            <div className="flex justify-between mt-6">
              <Button icon={ArrowLeft} disabled={busy} onClick={() => { descartarBorrador(); setStep(1); }}>{t('common.back')}</Button>
              <Button variant="primary" loading={busy} icon={FileSignature} onClick={finalizar}>
                {busy ? t('common.saving') : t('assign.generateActa')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Enviar a mantenimiento sin salir de la entrega: el equipo sale de la
          lista de disponibles y la selección se limpia sola. */}
      <CambiarEstadoModal
        equipo={aReparar}
        onClose={() => setAReparar(null)}
        onSaved={() => {
          const id = aReparar?.id;
          if (id) setSel((prev) => { const next = { ...prev }; delete next[id]; return next; });
          refetch();
        }}
      />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Undo2, Search, Warehouse, Truck, FileSignature, Eye, Check, X, Plus, PackageX } from 'lucide-react';
import { listEquipos, listProveedores, getColaborador, devolverEquipo, createActa, updateActa, deleteActa, subirPdfActa, subirActaFirmada } from '@/lib/api';
import { generarActaPdf, abrirBlob, type ActaItem } from '@/lib/pdf';
import { ACTA_DEVOLUCION } from '@/lib/actaTemplates';
import { fmtSerial } from '@/lib/format';
import { useTrabajoEnCurso } from '@/lib/actualizacion';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FirmaActa, type FirmaActaHandle } from '@/components/ui/FirmaActa';
import { Select } from '@/components/ui/Select';
import { EstadoBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import { usePeersDeRecursos } from '@/lib/presence/hooks';
import { PresenceMarker, CoeditBanner } from '@/components/presence';
import type { Acta, Equipo } from '@/types';

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
  const firmaRef = useRef<FirmaActaHandle>(null);
  // Acta reservada: se crea al descargarla para firmar a mano, para que el
  // papel salga con su consecutivo definitivo y no con un marcador.
  const borradorRef = useRef<Acta | null>(null);

  const seleccionados = Object.values(sel);

  // Devolución a medias: mismo criterio que en Asignar (ver useTrabajoEnCurso).
  useTrabajoEnCurso(seleccionados.length > 0, t('update.workReturn'));

  // Presencia: declaro edición sobre CADA equipo que estoy devolviendo (un
  // marcador por ítem) y reúno a los coeditores de cualquiera de ellos.
  const coeditores = usePeersDeRecursos('equipo', seleccionados.map((e) => e.id));

  // Solo se devuelve lo que está en manos de alguien: un equipo DISPONIBLE ya
  // está en bodega y no hay nada que devolver.
  const candidatos = equipos.filter((e) =>
    ['ASIGNADO', 'EN_MANTENIMIENTO'].includes(e.estado_asignacion) &&
    (!q || [fmtSerial(e.serial), e.marca, e.linea_modelo, e.codigo_qr, e.tipo].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));

  // Un acta de devolución la firma UNA persona y lleva UNA cédula: si se
  // mezclaran equipos de varios colaboradores, el papel saldría a nombre del
  // primero y los demás quedarían sin descargo. Por eso el flujo se ancla al
  // dueño del primer equipo elegido y el resto queda bloqueado. Los equipos en
  // mantenimiento sin cédula forman su propio grupo (null), devolubles entre sí.
  const cedulaFlujo = seleccionados.length ? seleccionados[0].cedula_asignado ?? null : undefined;
  const mismoDueno = (e: Equipo) => cedulaFlujo === undefined || (e.cedula_asignado ?? null) === cedulaFlujo;
  const nombraDueno = (cedula: string | null | undefined) =>
    cedula ? `C.C. ${cedula}` : t('return.sinColaborador');

  const toggleEquipo = (e: Equipo) => {
    if (!sel[e.id] && !mismoDueno(e)) {
      toast.error(t('return.otroDueno', { quien: nombraDueno(e.cedula_asignado), actual: nombraDueno(cedulaFlujo) }));
      return;
    }
    setSel((prev) => {
      const next = { ...prev };
      if (next[e.id]) delete next[e.id]; else next[e.id] = e;
      return next;
    });
  };

  const buildItems = (items: Equipo[] = seleccionados): ActaItem[] =>
    items.map((e) => ({ equipo: e, observaciones: obs[e.id] }));

  /**
   * Lo seleccionado son fotos del momento en que se marcó cada equipo: otro
   * técnico pudo reasignarlo o devolverlo mientras se llenaba el formulario.
   * Antes de firmar se contrasta con la base. Si algo cambió, se quita de la
   * selección y se detiene el flujo: un acta con el dueño equivocado es
   * exactamente el problema que se está evitando. Devuelve la lista vigente, o
   * null si hubo cambios y el técnico debe revisar.
   */
  const revalidarSeleccion = async (): Promise<Equipo[] | null> => {
    const { data: frescos } = await refetch();
    // Sin datos frescos (red caída) no hay con qué contrastar: la base vuelve a
    // validar en devolverEquipo, así que no se bloquea la devolución por eso.
    if (!frescos) return seleccionados;
    const porId = new Map(frescos.map((e) => [e.id, e]));
    const vigentes: Equipo[] = [];
    let cambio = false;
    for (const e of seleccionados) {
      const actual = porId.get(e.id);
      const devolvible = actual && ['ASIGNADO', 'EN_MANTENIMIENTO'].includes(actual.estado_asignacion);
      if (!devolvible || (actual.cedula_asignado ?? null) !== (e.cedula_asignado ?? null)) { cambio = true; continue; }
      vigentes.push(actual);
    }
    setSel(Object.fromEntries(vigentes.map((e) => [e.id, e])));
    if (!cambio) return vigentes;
    toast.error(t('return.seleccionDesactualizada'));
    return null;
  };

  const vistaPrevia = async () => {
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    try {
      const primero = seleccionados[0];
      const colab = primero.cedula_asignado ? await getColaborador(primero.cedula_asignado) : null;
      const blob = await generarActaPdf({
        tipo: 'DEVOLUCION', consecutivo: t('acta.previewWatermark'), items: buildItems(),
        colaborador: colab, firmaDataUrl: firmaRef.current?.toDataURL(), tecnico: perfil?.nombre,
        tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      abrirBlob(blob, 'vista-previa-acta.pdf');
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  /**
   * Devuelve el acta de este flujo, creándola la primera vez. Al descargarla
   * para firmar en físico hay que reservar ya el consecutivo, porque es el que
   * queda impreso en el papel que firma el colaborador.
   */
  const asegurarActa = async (items: Equipo[] = seleccionados): Promise<Acta> => {
    // Cinturón y tirantes: la lista ya impide mezclar dueños, pero un acta con
    // dos cédulas es un documento inválido y no puede salir de aquí.
    if (items.some((e) => !mismoDueno(e))) throw new Error(t('return.mezclaDuenos'));
    const datos = {
      tipo: 'DEVOLUCION' as const, equipo_id: items[0].id,
      items: items.map((e) => ({ equipo_id: e.id, observaciones: obs[e.id] })),
      cedula_colaborador: items[0].cedula_asignado, observaciones: novedades,
    };
    const previo = borradorRef.current;
    if (previo) {
      // Pudo cambiar equipos u observaciones después de descargar: se refresca
      // el registro conservando el consecutivo ya reservado.
      await updateActa(previo.id, datos);
      borradorRef.current = { ...previo, ...datos };
      return borradorRef.current;
    }
    const acta = await createActa({ ...datos, firmado: false });
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

  // Acta sin firmar para el flujo manual (descargar, firmar a mano, subir).
  const descargarParaFirmar = async () => {
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    try {
      const primero = seleccionados[0];
      const colab = primero.cedula_asignado ? await getColaborador(primero.cedula_asignado) : null;
      const acta = await asegurarActa();
      const blob = await generarActaPdf({
        tipo: 'DEVOLUCION', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(),
        colaborador: colab, tecnico: perfil?.nombre, tecnicoCedula: perfil?.cedula ?? undefined,
        firmaTecnicoDataUrl: perfil?.firma_data, novedades,
      });
      abrirBlob(blob, `${acta.consecutivo || `acta-devolucion-${fmtSerial(primero.serial)}`}.pdf`);
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const finalizar = async () => {
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    if (destino === 'proveedor' && !proveedor) { toast.error(t('return.selectSupplier')); return; }
    const modo = firmaRef.current?.getMode() ?? 'digital';
    const firma = modo === 'digital' ? firmaRef.current?.toDataURL() : null;
    const archivoFirmado = modo === 'manual' ? firmaRef.current?.getArchivo() : null;
    // El acta no puede salir sin firma: una vez emitida ya no se firma después.
    if (modo === 'digital' && !firma) { toast.error(t('common.signHere')); return; }
    if (modo === 'manual' && !archivoFirmado) { toast.error(t('acta.faltaArchivo')); return; }
    setBusy(true);
    try {
      // Último contraste con la base antes de emitir el documento.
      const vigentes = await revalidarSeleccion();
      if (!vigentes) return;
      if (!vigentes.length) { toast.error(t('assign.noneSelected')); return; }
      const primero = vigentes[0];
      const colab = primero.cedula_asignado ? await getColaborador(primero.cedula_asignado) : null;
      // Reutiliza el acta ya reservada si se descargó para firmar a mano, así
      // el consecutivo del papel firmado es el que queda guardado.
      const acta = await asegurarActa(vigentes);
      // Firma física: el acta oficial es el escaneo firmado a mano; no se
      // guarda además la versión de firma digital (iría sin firma real).
      let documento: Blob;
      let nombreDoc: string;
      if (archivoFirmado) {
        await subirActaFirmada(acta.id, archivoFirmado);
        documento = archivoFirmado;
        nombreDoc = archivoFirmado.name;
      } else {
        await updateActa(acta.id, { firma_data: firma, firmado: true });
        documento = await generarActaPdf({
          tipo: 'DEVOLUCION', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(vigentes),
          colaborador: colab, firmaDataUrl: firma, tecnico: perfil?.nombre,
          tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: perfil?.firma_data, novedades,
        });
        await subirPdfActa(acta.id, documento);
        nombreDoc = `${acta.consecutivo || 'acta'}.pdf`;
      }
      // Ya está firmada y guardada: deja de ser un borrador descartable.
      borradorRef.current = null;
      for (const e of vigentes) {
        await devolverEquipo({
          equipoId: e.id, aProveedor: destino === 'proveedor', proveedor: proveedor || undefined,
          actaId: acta.id, registradoPor: perfil?.cedula || perfil?.nombre, obs: obs[e.id] || novedades,
        });
      }
      abrirBlob(documento, nombreDoc);
      toast.success(t('return.done'));
      setSel({}); setObs({}); setNovedades(''); setProveedor(''); refetch();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title={t('return.title')} subtitle={t('return.subtitle')} icon={Undo2} />

      {/* Un marcador de presencia por equipo seleccionado (no pintan nada). */}
      {seleccionados.map((e) => (
        <PresenceMarker key={e.id} type="equipo" id={e.id} title={`${e.marca} ${e.linea_modelo}`} detail="En devolución" />
      ))}

      {coeditores.length > 0 && <CoeditBanner peers={coeditores} className="mb-4" />}

      <div className="card p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">{t('return.selectMultiple')}</label>
            {seleccionados.length > 0 && (
              <span className="badge bg-brand-500/15 text-brand-600">{t('assign.selectedCount', { n: seleccionados.length })}</span>
            )}
          </div>
          {/* A quién le queda esta acta: evita descubrirlo al ver el PDF. */}
          {seleccionados.length > 0 && (
            <div className="text-xs text-ink-500 dark:text-ink-300">
              {t('return.duenoActual', { quien: nombraDueno(cedulaFlujo) })}
            </div>
          )}
          <div className="relative my-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-9" placeholder={t('common.searchSerial')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {candidatos.map((e) => {
              const on = !!sel[e.id];
              // Se deja clicable a propósito: el clic explica por qué no entra
              // en esta acta, que es más útil que un botón muerto.
              const ajeno = !mismoDueno(e);
              return (
                <button key={e.id} onClick={() => toggleEquipo(e)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                    on ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                      : ajeno ? 'border-ink-100 dark:border-white/10 opacity-45'
                      : 'border-ink-100 dark:border-white/10 hover:bg-ink-50 dark:hover:bg-white/5'}`}>
                  <div className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border ${on ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20'}`}>
                    {on && <Check size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{e.marca} {e.linea_modelo} <span className="text-xs text-ink-400">· {e.tipo}</span></div>
                    <div className="text-xs text-ink-400 font-mono">{fmtSerial(e.serial)} {e.cedula_asignado && `· C.C. ${e.cedula_asignado}`}</div>
                  </div>
                  {ajeno
                    ? <span className="badge bg-ink-500/10 text-ink-500 shrink-0">{t('return.otroDuenoCorto')}</span>
                    : <EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} />}
                </button>
              );
            })}
            {candidatos.length === 0 && (
              <EmptyState variant="search" icon={PackageX} title={t('common.noResultsTitle')} description={t('return.noCandidates')} className="!py-8" />
            )}
          </div>
        </div>

        {seleccionados.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="space-y-3">
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
                  <Plus size={11} /> {e.marca} {e.linea_modelo} · <span className="font-mono">{fmtSerial(e.serial)}</span>
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
              <FirmaActa ref={firmaRef} onDescargar={descargarParaFirmar} />
            </div>

            <div className="flex justify-end">
              <Button variant="primary" loading={busy} icon={FileSignature} onClick={finalizar}>
                {busy ? t('common.saving') : t('return.generate')}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

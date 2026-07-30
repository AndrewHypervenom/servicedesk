import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Undo2, Search, Warehouse, Truck, FileSignature, Eye, Check, X, Plus, PackageX, ChevronRight, ArrowLeft, FileWarning } from 'lucide-react';
import { listEquipos, listProveedores, getColaborador, devolverEquipo, createActa, updateActa, deleteActa, subirPdfActa, subirActaFirmada } from '@/lib/api';
import { generarActaPdf, abrirBlob, type ActaItem } from '@/lib/pdf';
import { ACTA_DEVOLUCION } from '@/lib/actaTemplates';
import { contratoPorVencer, contratoVencido, diasDeContrato, tieneContrato } from '@/lib/estados';
import { fmtDate, fmtSerial } from '@/lib/format';
import { useTrabajoEnCurso } from '@/lib/actualizacion';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { FirmaActa, type FirmaActaHandle } from '@/components/ui/FirmaActa';
import { SignaturePad, type SignatureHandle } from '@/components/ui/SignaturePad';
import { Select } from '@/components/ui/Select';
import { EstadoBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import { usePeersDeRecursos } from '@/lib/presence/hooks';
import { PresenceMarker, CoeditBanner } from '@/components/presence';
import type { Acta, Equipo } from '@/types';

/** Destino de la devolución: define qué equipos son devolubles y quién firma. */
type Destino = 'bodega' | 'proveedor';

export function Devolucion() {
  const { t, i18n } = useTranslation();
  const { perfil } = useApp();
  const { data: equipos = [], refetch } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: proveedores = [] } = useQuery({ queryKey: ['proveedores'], queryFn: listProveedores });

  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, Equipo>>({});
  const [obs, setObs] = useState<Record<string, string>>({});
  // Sin destino elegido todavía: la pantalla arranca preguntándolo, porque de
  // él depende qué equipos se pueden devolver y quién firma el acta.
  const [destino, setDestino] = useState<Destino | null>(null);
  const [proveedor, setProveedor] = useState('');
  const [novedades, setNovedades] = useState('');
  const [busy, setBusy] = useState(false);
  const firmaRef = useRef<FirmaActaHandle>(null);
  const firmaTecnicoRef = useRef<SignatureHandle>(null);
  // Acta reservada: se crea al descargarla para firmar a mano, para que el
  // papel salga con su consecutivo definitivo y no con un marcador.
  const borradorRef = useRef<Acta | null>(null);

  const seleccionados = Object.values(sel);

  // Devolución a medias: mismo criterio que en Asignar (ver useTrabajoEnCurso).
  useTrabajoEnCurso(seleccionados.length > 0, t('update.workReturn'));

  // Presencia: declaro edición sobre CADA equipo que estoy devolviendo (un
  // marcador por ítem) y reúno a los coeditores de cualquiera de ellos.
  const coeditores = usePeersDeRecursos('equipo', seleccionados.map((e) => e.id));

  /**
   * A bodega solo se devuelve lo que está en manos de alguien: un equipo
   * DISPONIBLE ya está en bodega y no hay nada que devolver.
   */
  const devolvibleABodega = (e: Equipo) => ['ASIGNADO', 'EN_MANTENIMIENTO'].includes(e.estado_asignacion);

  /**
   * Al proveedor vuelve lo que no es nuestro y ya no podemos seguir usando: una
   * renta o comodato con el contrato vencido o a punto de vencer. Cuenta la
   * ubicación actual —bodega, colaborador o mantenimiento— porque ese equipo hay
   * que sacarlo de donde esté; lo dado de baja no sale por aquí.
   */
  const devolvibleAProveedor = (e: Equipo) =>
    tieneContrato(e) && (contratoVencido(e) || contratoPorVencer(e)) &&
    ['DISPONIBLE', 'ASIGNADO', 'EN_MANTENIMIENTO'].includes(e.estado_asignacion);

  const esDevolvible = (e: Equipo) => (destino === 'proveedor' ? devolvibleAProveedor(e) : devolvibleABodega(e));

  const candidatos = equipos.filter((e) => esDevolvible(e) &&
    (!q || [fmtSerial(e.serial), e.marca, e.linea_modelo, e.codigo_qr, e.tipo].some((v) => v?.toLowerCase().includes(q.toLowerCase()))));

  // Un acta de devolución tiene UNA contraparte: a bodega es el colaborador que
  // entrega, al proveedor es el dueño del equipo. Si se mezclaran, el papel
  // saldría a nombre del primero y el resto quedaría sin descargo —o peor, un
  // equipo se le devolvería al proveedor equivocado—. Por eso el flujo se ancla
  // a la contraparte del primer equipo elegido y el resto queda bloqueado. Los
  // equipos sin cédula (o sin proveedor registrado) forman su propio grupo
  // (null), devolubles entre sí.
  const llevaColaborador = destino === 'bodega';
  const claveGrupo = (e: Equipo) => (llevaColaborador ? e.cedula_asignado : e.proveedor_propietario) ?? null;
  const grupoFlujo = seleccionados.length ? claveGrupo(seleccionados[0]) : undefined;
  const mismoGrupo = (e: Equipo) => grupoFlujo === undefined || claveGrupo(e) === grupoFlujo;
  const nombraGrupo = (clave: string | null | undefined) =>
    clave ? (llevaColaborador ? `C.C. ${clave}` : clave)
      : t(llevaColaborador ? 'return.sinColaborador' : 'return.sinProveedor');

  // El proveedor del acta no se elige a mano cuando el equipo ya dice de quién
  // es: se toma del grupo y el selector queda solo para los que no lo tienen.
  useEffect(() => {
    if (destino !== 'proveedor') return;
    // Al cambiar de grupo (o quedarse sin selección) no puede sobrevivir el
    // proveedor del grupo anterior: sería devolverle equipos que no son suyos.
    setProveedor(typeof grupoFlujo === 'string' ? grupoFlujo : '');
  }, [destino, grupoFlujo]);

  const toggleEquipo = (e: Equipo) => {
    if (!sel[e.id] && !mismoGrupo(e)) {
      toast.error(t(llevaColaborador ? 'return.otroDueno' : 'return.otroProveedor',
        { quien: nombraGrupo(claveGrupo(e)), actual: nombraGrupo(grupoFlujo) }));
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
   * Firma que respalda el acta como técnico: la registrada en el perfil o, si no
   * hay, la que dibuje en el momento. En la devolución al proveedor es la única
   * firma del documento (no hay colaborador que descargue nada).
   */
  const firmaTecnico = (): string | null => perfil?.firma_data || firmaTecnicoRef.current?.toDataURL() || null;

  /** Cambiar de destino cambia la lista y el acta: se empieza de cero. */
  const elegirDestino = (d: Destino | null) => {
    descartarBorrador();
    setDestino(d);
    setSel({}); setObs({}); setQ(''); setProveedor('');
  };

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
      if (!actual || !esDevolvible(actual)) { cambio = true; continue; }
      // Si le cambiaron la contraparte (otro colaborador, otro proveedor
      // propietario) el acta ya no la cubre: fuera de la selección.
      if (claveGrupo(actual) !== claveGrupo(e)) { cambio = true; continue; }
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
      const colab = await colaboradorDelActa(seleccionados[0]);
      const blob = await generarActaPdf({
        tipo: 'DEVOLUCION', consecutivo: t('acta.previewWatermark'), items: buildItems(),
        colaborador: colab, firmaDataUrl: llevaColaborador ? firmaRef.current?.toDataURL() : null,
        tecnico: perfil?.nombre,
        tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: firmaTecnico(), novedades,
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
    // Cinturón y tirantes: la lista ya impide mezclar contrapartes, pero un acta
    // con dos cédulas —o dos proveedores— es un documento inválido y no puede
    // salir de aquí.
    if (items.some((e) => !mismoGrupo(e))) {
      throw new Error(t(llevaColaborador ? 'return.mezclaDuenos' : 'return.mezclaProveedores'));
    }
    const datos = {
      tipo: 'DEVOLUCION' as const, equipo_id: items[0].id,
      items: items.map((e) => ({ equipo_id: e.id, observaciones: obs[e.id] })),
      // El acta al proveedor no va a nombre de nadie aunque el equipo esté
      // asignado: quien responde por la salida es el técnico.
      cedula_colaborador: llevaColaborador ? items[0].cedula_asignado : null,
      observaciones: novedades,
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

  /** Colaborador que encabeza el acta, o null si esta devolución no lleva uno. */
  const colaboradorDelActa = async (primero: Equipo) =>
    llevaColaborador && primero.cedula_asignado ? await getColaborador(primero.cedula_asignado) : null;

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
      const colab = await colaboradorDelActa(primero);
      const acta = await asegurarActa();
      const blob = await generarActaPdf({
        tipo: 'DEVOLUCION', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(),
        colaborador: colab, tecnico: perfil?.nombre, tecnicoCedula: perfil?.cedula ?? undefined,
        firmaTecnicoDataUrl: firmaTecnico(), novedades,
      });
      abrirBlob(blob, `${acta.consecutivo || `acta-devolucion-${fmtSerial(primero.serial)}`}.pdf`);
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const finalizar = async () => {
    if (!seleccionados.length) { toast.error(t('assign.noneSelected')); return; }
    if (destino === 'proveedor' && !proveedor) { toast.error(t('return.selectSupplier')); return; }
    // El acta no puede salir sin firma: una vez emitida ya no se firma después.
    // A bodega firma el colaborador (digital o física); al proveedor no hay
    // colaborador y responde el técnico que registra la salida.
    const firmaTec = firmaTecnico();
    const modo = llevaColaborador ? firmaRef.current?.getMode() ?? 'digital' : 'digital';
    const firma = llevaColaborador && modo === 'digital' ? firmaRef.current?.toDataURL() ?? null : null;
    const archivoFirmado = llevaColaborador && modo === 'manual' ? firmaRef.current?.getArchivo() ?? null : null;
    if (!llevaColaborador && !firmaTec) { toast.error(t('return.faltaFirmaTecnico')); return; }
    if (llevaColaborador && modo === 'digital' && !firma) { toast.error(t('common.signHere')); return; }
    if (llevaColaborador && modo === 'manual' && !archivoFirmado) { toast.error(t('acta.faltaArchivo')); return; }
    setBusy(true);
    try {
      // Último contraste con la base antes de emitir el documento.
      const vigentes = await revalidarSeleccion();
      if (!vigentes) return;
      if (!vigentes.length) { toast.error(t('assign.noneSelected')); return; }
      const colab = await colaboradorDelActa(vigentes[0]);
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
        await updateActa(acta.id, { firma_data: firma ?? firmaTec, firmado: true });
        documento = await generarActaPdf({
          tipo: 'DEVOLUCION', consecutivo: acta.consecutivo || 'ACTA', items: buildItems(vigentes),
          colaborador: colab, firmaDataUrl: firma, tecnico: perfil?.nombre,
          tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: firmaTec, novedades,
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
      // Vuelve a la pregunta inicial: la siguiente devolución puede ir a otro
      // destino y arrastrar la elección anterior confunde más de lo que ahorra.
      setSel({}); setObs({}); setNovedades(''); setProveedor(''); setDestino(null); refetch();
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

      {/* Paso 1: a dónde va la devolución. Cada destino tiene su propia lista de
          equipos devolubles, así que se pregunta antes de mostrar nada. */}
      {!destino && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
          <div className="text-sm font-semibold">{t('return.destinoTitulo')}</div>
          <p className="text-sm text-ink-400 mb-4">{t('return.destinoSub')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {([
              ['bodega', Warehouse, t('return.toWarehouse'), t('return.toWarehouseDesc'), equipos.filter(devolvibleABodega).length],
              ['proveedor', Truck, t('return.toSupplier'), t('return.toSupplierDesc'), equipos.filter(devolvibleAProveedor).length],
            ] as const).map(([val, Icon, label, desc, n]) => (
              <button key={val} onClick={() => elegirDestino(val)}
                className="p-5 rounded-2xl border-2 border-ink-100 dark:border-white/10 text-left transition-all hover:border-brand-500 hover:bg-brand-500/5">
                <div className="flex items-center gap-3 mb-2">
                  <Icon size={22} className="text-brand-500 shrink-0" />
                  <span className="font-semibold flex-1">{label}</span>
                  <ChevronRight size={16} className="text-ink-400 shrink-0" />
                </div>
                <p className="text-xs text-ink-400 leading-relaxed">{desc}</p>
                <div className="mt-3 text-xs font-medium text-ink-500 dark:text-ink-300">
                  {t('return.disponiblesParaDevolver', { n })}
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {destino && (
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <button className="btn-ghost !p-1.5" onClick={() => elegirDestino(null)} title={t('return.cambiarDestino')}>
            <ArrowLeft size={16} />
          </button>
          <span className="badge bg-brand-500/15 text-brand-600 inline-flex items-center gap-1.5">
            {destino === 'bodega' ? <Warehouse size={13} /> : <Truck size={13} />}
            {destino === 'bodega' ? t('return.toWarehouse') : t('return.toSupplier')}
          </span>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">
              {destino === 'proveedor' ? t('return.selectMultipleProveedor') : t('return.selectMultiple')}
            </label>
            {seleccionados.length > 0 && (
              <span className="badge bg-brand-500/15 text-brand-600">{t('assign.selectedCount', { n: seleccionados.length })}</span>
            )}
          </div>
          {/* A nombre de quién queda esta acta: evita descubrirlo al ver el PDF. */}
          {seleccionados.length > 0 && (
            <div className="text-xs text-ink-500 dark:text-ink-300">
              {t(llevaColaborador ? 'return.duenoActual' : 'return.proveedorActual', { quien: nombraGrupo(grupoFlujo) })}
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
              const ajeno = !mismoGrupo(e);
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
                    <div className="text-xs text-ink-400 font-mono">
                      {fmtSerial(e.serial)}
                      {/* De quién es el equipo: es lo que decide en qué acta entra. */}
                      {destino === 'proveedor'
                        ? ` · ${nombraGrupo(e.proveedor_propietario)}`
                        : e.cedula_asignado && ` · C.C. ${e.cedula_asignado}`}
                    </div>
                    {/* Por qué este equipo sale al proveedor: el estado de su contrato. */}
                    {destino === 'proveedor' && (
                      <div className={`text-xs mt-0.5 flex items-center gap-1 ${
                        contratoVencido(e) ? 'text-red-600 dark:text-danger' : 'text-amber-600 dark:text-warning'}`}>
                        <FileWarning size={11} className="shrink-0" />
                        {contratoVencido(e)
                          ? t('return.contratoVencidoEl', { fecha: fmtDate(e.fecha_vencimiento_contrato, i18n.language) })
                          : t('return.contratoVenceEn', { dias: diasDeContrato(e) })}
                      </div>
                    )}
                  </div>
                  {ajeno
                    ? <span className="badge bg-ink-500/10 text-ink-500 shrink-0">
                        {t(llevaColaborador ? 'return.otroDuenoCorto' : 'return.otroProveedorCorto')}
                      </span>
                    : <EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} />}
                </button>
              );
            })}
            {candidatos.length === 0 && (
              <EmptyState variant="search" icon={PackageX} title={t('common.noResultsTitle')}
                description={destino === 'proveedor' ? t('return.noCandidatesProveedor') : t('return.noCandidates')} className="!py-8" />
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

            {/* El proveedor sale del equipo, no de una lista: elegir otro sería
                devolvérselo a quien no es. Solo se pregunta cuando los equipos
                elegidos no tienen proveedor propietario registrado. */}
            {destino === 'proveedor' && (
              <div>
                <label className="label">{t('return.selectSupplier')}</label>
                {typeof grupoFlujo === 'string' ? (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl border border-ink-100 dark:border-white/10 bg-ink-50 dark:bg-white/5">
                    <Truck size={16} className="text-brand-500 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{grupoFlujo}</span>
                    <span className="text-xs text-ink-400">{t('return.proveedorDelEquipo')}</span>
                  </div>
                ) : (
                  <>
                    <Select value={proveedor} onChange={setProveedor}
                      options={[{ value: '', label: '—' }, ...proveedores.map((p) => ({ value: p.nombre, label: p.nombre }))]} />
                    <p className="text-xs text-ink-400 mt-1">{t('return.proveedorSinRegistrar')}</p>
                  </>
                )}
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

            {/* La salida al proveedor no la firma ningún colaborador: la respalda
                el técnico, con la firma de su perfil o dibujada aquí mismo. */}
            {destino === 'proveedor' ? (
              <div>
                <label className="label">{t('return.firmaTecnico')}</label>
                <p className="text-xs text-ink-400 mb-2">{t('return.firmaTecnicoHint')}</p>
                {perfil?.firma_data ? (
                  <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-success/40 bg-success/8">
                    <img src={perfil.firma_data} alt="" className="h-10 max-w-[140px] object-contain" />
                    <div className="text-xs text-ink-500 dark:text-ink-300">
                      {t('return.firmaPerfil', { nombre: perfil?.nombre ?? '' })}
                    </div>
                  </div>
                ) : (
                  <SignaturePad ref={firmaTecnicoRef} />
                )}
              </div>
            ) : (
              <div>
                <label className="label">{t('acta.signature')}</label>
                <FirmaActa ref={firmaRef} onDescargar={descargarParaFirmar} />
              </div>
            )}

            <div className="flex justify-end">
              <Button variant="primary" loading={busy} icon={FileSignature} onClick={finalizar}>
                {busy ? t('common.saving') : t('return.generate')}
              </Button>
            </div>
          </motion.div>
        )}
      </div>
      )}
    </div>
  );
}

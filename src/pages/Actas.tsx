import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { FileSignature, ExternalLink, CheckCircle2, Mail, Printer, FileCheck2, Eye, SearchX, UserRound, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { listActas, listEquipos, listColaboradores, getTecnicoDeActa, getAutoresDeActas, eliminarActaConDocumentos } from '@/lib/api';
import { generarActaPdf, abrirBlob, imprimirBlob, type ActaItem } from '@/lib/pdf';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tooltip } from '@/components/ui/Tooltip';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { fmtDate, fmtSerial } from '@/lib/format';
import { esAdmin } from '@/lib/roles';
import { useApp } from '@/store/useApp';
import type { Acta } from '@/types';

export function Actas() {
  const { t, i18n } = useTranslation();
  const { perfil } = useApp();
  const { data: actas = [], isLoading } = useQuery({ queryKey: ['actas'], queryFn: listActas });
  const { data: equipos = [] } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: colaboradores = [] } = useQuery({ queryKey: ['colaboradores'], queryFn: listColaboradores });
  const { data: autores } = useQuery({ queryKey: ['actas', 'autores'], queryFn: getAutoresDeActas });
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  // Solo el ADMIN borra actas. Esto oculta el botón; la barrera real es el
  // trigger `actas_borrado_solo_admin`, porque la API REST es alcanzable sin
  // pasar por esta pantalla.
  const puedeEliminar = esAdmin(perfil?.rol);
  const [aBorrar, setABorrar] = useState<Acta | null>(null);
  const [borrando, setBorrando] = useState(false);

  const confirmarBorrado = async () => {
    if (!aBorrar) return;
    setBorrando(true);
    try {
      await eliminarActaConDocumentos(aBorrar);
      toast.success(t('acta.deleteDone', { consecutivo: aBorrar.consecutivo ?? '' }));
      setABorrar(null);
      qc.invalidateQueries({ queryKey: ['actas'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
    } catch (e: any) {
      toast.error(e?.message ?? t('common.error'));
    } finally { setBorrando(false); }
  };

  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const colabByCedula = useMemo(() => new Map(colaboradores.map((c) => [c.cedula, c])), [colaboradores]);

  /** Quién del Service Desk generó el acta, o null si no quedó registrado. */
  const autorDe = (a: Acta) => (a.generado_por ? autores?.get(a.id) ?? null : null);

  const actasFiltradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return actas;
    return actas.filter((a) => {
      const colab = a.cedula_colaborador ? colabByCedula.get(a.cedula_colaborador) : null;
      const seriales = (a.items?.length ? a.items.map((i) => i.equipo_id) : a.equipo_id ? [a.equipo_id] : [])
        .map((id) => fmtSerial(equiposById.get(id)?.serial));
      const tipoLabel = t(`movimiento.${a.tipo === 'ENTREGA' ? 'ASIGNACION' : 'DEVOLUCION_COLABORADOR'}`);
      return [a.consecutivo, a.cedula_colaborador, colab?.nombre, tipoLabel, autores?.get(a.id), ...seriales]
        .some((v) => v?.toLowerCase().includes(term));
    });
  }, [actas, q, colabByCedula, equiposById, autores, t]);

  const generarPdf = async (a: Acta) => {
    const snapshots = a.items?.length
      ? a.items
      : a.equipo_id ? [{ equipo_id: a.equipo_id, observaciones: null }] : [];
    const items: ActaItem[] = [];
    for (const s of snapshots) {
      const eq = equiposById.get(s.equipo_id);
      if (eq) items.push({ equipo: eq, observaciones: s.observaciones ?? undefined });
    }
    if (!items.length) throw new Error(t('acta.noEquipment'));
    // El acta la firma quien la generó. Solo se cae al perfil actual si no se
    // puede resolver el autor: actas anteriores a `generado_por` o un perfil
    // que ya no existe. Si el RPC falla, tampoco vale romper la reimpresión.
    const autor = await getTecnicoDeActa(a.id).catch(() => null);
    const tecnico = autor ?? perfil;
    return generarActaPdf({
      tipo: a.tipo, consecutivo: a.consecutivo || 'ACTA', items,
      colaborador: a.cedula_colaborador ? colabByCedula.get(a.cedula_colaborador) : null,
      firmaDataUrl: a.firma_data, tecnico: tecnico?.nombre,
      tecnicoCedula: tecnico?.cedula ?? undefined, firmaTecnicoDataUrl: tecnico?.firma_data,
      fecha: a.creado_en?.slice(0, 10), novedades: a.observaciones ?? undefined,
    });
  };

  /**
   * Documento oficial ya guardado, si existe. El escaneo del acta firmada a
   * mano manda sobre el PDF de firma digital. Ambos se generaron en su momento
   * con los datos correctos —técnico, firmas, equipos tal como estaban ese
   * día—, así que ver/imprimir los prefieren en vez de regenerar el acta.
   */
  const documentoGuardado = (a: Acta) => a.archivo_firmado_url || a.pdf_url || null;

  const ver = async (a: Acta) => {
    const url = documentoGuardado(a);
    if (url) { window.open(url, '_blank', 'noreferrer'); return; }
    try { abrirBlob(await generarPdf(a)); }
    catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const imprimir = async (a: Acta) => {
    const url = documentoGuardado(a);
    if (url) {
      // Solo los PDF se pueden mandar a la impresora en un iframe; una foto o
      // escaneo en imagen se abre en pestaña para que el navegador la imprima.
      if (/\.pdf(\?|$)/i.test(url)) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          imprimirBlob(await res.blob());
          return;
        } catch { /* cae a abrir en pestaña */ }
      }
      window.open(url, '_blank', 'noreferrer');
      return;
    }
    try { imprimirBlob(await generarPdf(a)); }
    catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  return (
    <div>
      <PageHeader title={t('acta.title')} subtitle={t('acta.subtitle')} icon={FileSignature} />

      {!isLoading && actas.length > 0 && (
        <div className="card p-4 mb-5">
          <SearchInput value={q} onChange={setQ} placeholder={t('acta.searchPlaceholder')} />
        </div>
      )}

      {!isLoading && actas.length === 0 ? (
        <div className="card">
          <EmptyState icon={FileSignature} title={t('acta.emptyTitle')} description={t('acta.emptyDesc')} />
        </div>
      ) : !isLoading && actasFiltradas.length === 0 ? (
        <div className="card">
          <EmptyState icon={SearchX} title={t('common.noResultsTitle')} description={t('common.noResultsDesc')} />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-400 border-b border-ink-100 dark:border-white/5">
                <th className="px-5 py-3">{t('acta.consecutive')}</th>
                <th className="px-4 py-3">{t('common.type')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('acta.generatedBy')}</th>
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={6} cols={6} />}
              {!isLoading && actasFiltradas.map((a) => (
                <tr key={a.id} className="border-b border-ink-50 dark:border-white/5 hover:bg-ink-50/60 dark:hover:bg-white/5">
                  <td className="px-5 py-3 font-mono text-xs">{a.consecutivo}</td>
                  <td className="px-4 py-3"><Badge>{t(`movimiento.${a.tipo === 'ENTREGA' ? 'ASIGNACION' : 'DEVOLUCION_COLABORADOR'}`)}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {a.firmado
                        ? <span className="badge bg-success/15 text-emerald-700 dark:text-success"><CheckCircle2 size={11} /> {t('acta.signed')}</span>
                        : <span className="badge bg-ink-500/10 text-ink-500">{t('acta.pendingSign')}</span>}
                      {a.correo_enviado && <span className="badge bg-brand-500/15 text-brand-600"><Mail size={11} /> {t('acta.emailSent')}</span>}
                      {a.archivo_firmado_url && <span className="badge bg-brand-500/15 text-brand-600"><FileCheck2 size={11} /> {t('acta.signedFile')}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {autorDe(a)
                      ? <span className="inline-flex items-center gap-1.5 text-ink-600 dark:text-ink-300"><UserRound size={13} className="text-ink-400 shrink-0" />{autorDe(a)}</span>
                      : <span className="text-ink-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-500">{fmtDate(a.creado_en?.slice(0, 10), i18n.language)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip
                        label={t('acta.tipView')}
                        hint={a.archivo_firmado_url ? t('acta.tipViewSignedHint') : t('acta.tipViewHint')}
                      >
                        <button className="btn-ghost !p-2" aria-label={t('acta.tipView')} onClick={() => ver(a)}><Eye size={16} /></button>
                      </Tooltip>
                      <Tooltip label={t('acta.tipPrint')} hint={t('acta.tipPrintHint')}>
                        <button className="btn-ghost !p-2" aria-label={t('acta.tipPrint')} onClick={() => imprimir(a)}><Printer size={16} /></button>
                      </Tooltip>
                      {a.archivo_firmado_url && (
                        <Tooltip label={t('acta.signedFile')} hint={t('acta.tipSignedFileHint')}>
                          <a href={a.archivo_firmado_url} target="_blank" rel="noreferrer" aria-label={t('acta.signedFile')} className="btn-ghost !p-2 text-emerald-600">
                            <FileCheck2 size={16} />
                          </a>
                        </Tooltip>
                      )}
                      {a.pdf_url && (
                        <Tooltip label={t('acta.tipPdf')} hint={t('acta.tipPdfHint')}>
                          <a href={a.pdf_url} target="_blank" rel="noreferrer" aria-label={t('acta.tipPdf')} className="btn-ghost !p-2">
                            <ExternalLink size={16} />
                          </a>
                        </Tooltip>
                      )}
                      {puedeEliminar && (
                        <Tooltip label={t('acta.tipDelete')} hint={t('acta.tipDeleteHint')}>
                          <button className="btn-ghost !p-2 text-danger" aria-label={t('acta.tipDelete')} onClick={() => setABorrar(a)}>
                            <Trash2 size={16} />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Modal
        open={!!aBorrar}
        onClose={() => !borrando && setABorrar(null)}
        title={t('acta.deleteTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-danger/10 border border-danger/25">
            <AlertTriangle size={18} className="text-danger shrink-0 mt-0.5" />
            <div className="text-sm leading-snug">
              {/* A diferencia del borrado de equipos o colaboradores, esto no
                  oculta: destruye el acta y sus PDF. El aviso lo dice sin
                  rodeos porque no hay pantalla de restauración a la que acudir. */}
              <Trans
                i18nKey="acta.deleteWarn"
                values={{ consecutivo: aBorrar?.consecutivo ?? '' }}
                components={[<strong />]}
              />
            </div>
          </div>
          <p className="text-sm text-ink-500">{t('acta.deleteKeepsHistory')}</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setABorrar(null)} disabled={borrando} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button onClick={confirmarBorrado} disabled={borrando} className="btn-danger">
              {borrando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {t('common.delete')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

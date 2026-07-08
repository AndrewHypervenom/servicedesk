import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileSignature, ExternalLink, CheckCircle2, Mail, Printer, PenLine, Upload, FileCheck2, Eye } from 'lucide-react';
import { listActas, listEquipos, listColaboradores, updateActa, subirPdfActa, subirActaFirmada } from '@/lib/api';
import { generarActaPdf, abrirBlob, imprimirBlob, type ActaItem } from '@/lib/pdf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SignaturePad, type SignatureHandle } from '@/components/ui/SignaturePad';
import { toast } from '@/components/ui/Toast';
import { fmtDate } from '@/lib/format';
import { useApp } from '@/store/useApp';
import type { Acta } from '@/types';

export function Actas() {
  const { t, i18n } = useTranslation();
  const { perfil } = useApp();
  const { data: actas = [], refetch } = useQuery({ queryKey: ['actas'], queryFn: listActas });
  const { data: equipos = [] } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const { data: colaboradores = [] } = useQuery({ queryKey: ['colaboradores'], queryFn: listColaboradores });

  const [firmando, setFirmando] = useState<Acta | null>(null);
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<SignatureHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const actaSubidaRef = useRef<Acta | null>(null);

  const equiposById = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const colabByCedula = useMemo(() => new Map(colaboradores.map((c) => [c.cedula, c])), [colaboradores]);

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
    return generarActaPdf({
      tipo: a.tipo, consecutivo: a.consecutivo || 'ACTA', items,
      colaborador: a.cedula_colaborador ? colabByCedula.get(a.cedula_colaborador) : null,
      firmaDataUrl: a.firma_data, tecnico: perfil?.nombre,
      tecnicoCedula: perfil?.cedula ?? undefined, firmaTecnicoDataUrl: perfil?.firma_data,
      fecha: a.creado_en?.slice(0, 10), novedades: a.observaciones ?? undefined,
    });
  };

  const ver = async (a: Acta) => {
    try { abrirBlob(await generarPdf(a)); }
    catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const imprimir = async (a: Acta) => {
    try { imprimirBlob(await generarPdf(a)); }
    catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };

  const guardarFirma = async () => {
    if (!firmando) return;
    const firma = sigRef.current?.toDataURL();
    if (!firma) { toast.error(t('common.signHere')); return; }
    setBusy(true);
    try {
      await updateActa(firmando.id, { firma_data: firma, firmado: true });
      const actualizada = { ...firmando, firma_data: firma, firmado: true };
      const blob = await generarPdf(actualizada);
      await subirPdfActa(firmando.id, blob);
      abrirBlob(blob);
      toast.success(t('acta.signDone'));
      setFirmando(null);
      refetch();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setBusy(false); }
  };

  const pedirArchivo = (a: Acta) => {
    actaSubidaRef.current = a;
    fileRef.current?.click();
  };

  const subirArchivo = async (file: File | undefined) => {
    const a = actaSubidaRef.current;
    if (!a || !file) return;
    setBusy(true);
    try {
      await subirActaFirmada(a.id, file);
      toast.success(t('acta.uploadDone'));
      refetch();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
      actaSubidaRef.current = null;
    }
  };

  return (
    <div>
      <PageHeader title={t('acta.title')} subtitle={t('acta.subtitle')} icon={FileSignature} />

      <input
        ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
        onChange={(e) => subirArchivo(e.target.files?.[0])}
      />

      {actas.length === 0 ? (
        <div className="card p-12 text-center text-ink-400">{t('common.empty')}</div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-400 border-b border-ink-100 dark:border-white/5">
                <th className="px-5 py-3">{t('acta.consecutive')}</th>
                <th className="px-4 py-3">{t('common.type')}</th>
                <th className="px-4 py-3">{t('common.status')}</th>
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {actas.map((a) => (
                <tr key={a.id} className="border-b border-ink-50 dark:border-white/5 hover:bg-ink-50/60 dark:hover:bg-white/5">
                  <td className="px-5 py-3 font-mono text-xs">{a.consecutivo}</td>
                  <td className="px-4 py-3"><Badge>{t(`movimiento.${a.tipo === 'ENTREGA' ? 'ASIGNACION' : 'DEVOLUCION_COLABORADOR'}`)}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {a.firmado
                        ? <span className="badge bg-success/15 text-emerald-700 dark:text-success"><CheckCircle2 size={11} /> {t('acta.signed')}</span>
                        : <span className="badge bg-warning/15 text-amber-600 dark:text-warning">{t('acta.pendingSign')}</span>}
                      {a.correo_enviado && <span className="badge bg-brand-500/15 text-brand-600"><Mail size={11} /> {t('acta.emailSent')}</span>}
                      {a.archivo_firmado_url && <span className="badge bg-brand-500/15 text-brand-600"><FileCheck2 size={11} /> {t('acta.signedFile')}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-500">{fmtDate(a.creado_en?.slice(0, 10), i18n.language)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button className="btn-ghost !p-2" title={t('common.view')} onClick={() => ver(a)}><Eye size={16} /></button>
                      <button className="btn-ghost !p-2" title={t('common.print')} onClick={() => imprimir(a)}><Printer size={16} /></button>
                      {!a.firmado && (
                        <button className="btn-ghost !p-2 text-brand-600" title={t('acta.sign')} onClick={() => setFirmando(a)}>
                          <PenLine size={16} />
                        </button>
                      )}
                      <button className="btn-ghost !p-2" title={t('acta.uploadSigned')} disabled={busy} onClick={() => pedirArchivo(a)}>
                        <Upload size={16} />
                      </button>
                      {a.archivo_firmado_url && (
                        <a href={a.archivo_firmado_url} target="_blank" rel="noreferrer" className="btn-ghost !p-2 text-emerald-600" title={t('acta.signedFile')}>
                          <FileCheck2 size={16} />
                        </a>
                      )}
                      {a.pdf_url && (
                        <a href={a.pdf_url} target="_blank" rel="noreferrer" className="btn-ghost !p-2" title="PDF">
                          <ExternalLink size={16} />
                        </a>
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

      <Modal open={!!firmando} onClose={() => !busy && setFirmando(null)} title={t('acta.signTitle')} subtitle={firmando?.consecutivo ?? ''}>
        <p className="text-sm text-ink-400 mb-4">{t('acta.signHint')}</p>
        <SignaturePad ref={sigRef} />
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn-secondary" disabled={busy} onClick={() => setFirmando(null)}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={guardarFirma}>
            {busy ? t('common.loading') : <><FileSignature size={16} /> {t('acta.sign')}</>}
          </button>
        </div>
      </Modal>
    </div>
  );
}

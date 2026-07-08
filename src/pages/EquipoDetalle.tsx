import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Printer, Download, QrCode, User, MapPin, Calendar, FileText,
  Cpu, ShieldCheck, Building2, History,
} from 'lucide-react';
import { getEquipo, trazabilidad, getColaborador } from '@/lib/api';
import { equipoQrDataUrl, imprimirEtiquetaQr, descargarQr } from '@/lib/qr';
import { fmtDate, diasRestantes } from '@/lib/format';
import { EstadoBadge, FisicoBadge, Badge } from '@/components/ui/Badge';
import type { Colaborador } from '@/types';

export function EquipoDetalle() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [qr, setQr] = useState('');
  const [colab, setColab] = useState<Colaborador | null>(null);

  const { data: equipo, isLoading } = useQuery({ queryKey: ['equipo', id], queryFn: () => getEquipo(id) });
  const { data: movs = [] } = useQuery({ queryKey: ['traz', id], queryFn: () => trazabilidad(id) });

  useEffect(() => { if (equipo) equipoQrDataUrl(equipo.codigo_qr, 300).then(setQr); }, [equipo]);
  useEffect(() => { if (equipo?.cedula_asignado) getColaborador(equipo.cedula_asignado).then(setColab); else setColab(null); }, [equipo]);

  if (isLoading) return <div className="py-20 text-center text-ink-400">{t('common.loading')}</div>;
  if (!equipo) return (
    <div className="py-20 text-center text-ink-400">
      {t('common.empty')}
      <div className="mt-4"><Link to="/inventario" className="btn-secondary inline-flex"><ArrowLeft size={16} /> {t('common.back')}</Link></div>
    </div>
  );

  const dias = diasRestantes(equipo.fecha_vencimiento_contrato);

  const infoRows: [string, React.ReactNode][] = [
    [t('equipo.serial'), <span className="font-mono">{equipo.serial}</span>],
    [t('equipo.tipo'), t(`tipo.${equipo.tipo}`)],
    [t('equipo.propiedad'), <span>{t(`propiedad.${equipo.propiedad}`)}{equipo.proveedor_propietario && ` · ${equipo.proveedor_propietario}`}</span>],
    [t('equipo.fechaIngreso'), fmtDate(equipo.fecha_ingreso, i18n.language)],
    [t('equipo.proyectoAsignado'), equipo.proyecto_asignado ?? '—'],
    [t('equipo.fichaTecnica'), equipo.ficha_tecnica ?? '—'],
  ];
  if (equipo.propiedad === 'RENTADO') {
    infoRows.push([t('equipo.numeroContrato'), equipo.numero_contrato ?? '—']);
    infoRows.push([t('equipo.fechaVencimiento'),
      <span>{fmtDate(equipo.fecha_vencimiento_contrato, i18n.language)}
        {dias !== null && dias >= 0 && dias <= 30 && <Badge className="!bg-warning/15 !text-amber-600 dark:!text-warning ml-2">{dias}d</Badge>}
      </span>]);
  }

  return (
    <div>
      <button onClick={() => navigate(-1)} className="btn-ghost mb-4 !px-2"><ArrowLeft size={18} /> {t('common.back')}</button>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{equipo.marca} {equipo.linea_modelo}</h1>
                  <EstadoBadge estado={equipo.estado_asignacion} label={t(`estadoAsig.${equipo.estado_asignacion}`)} />
                  <FisicoBadge estado={equipo.estado_fisico} label={t(`estadoFis.${equipo.estado_fisico}`)} />
                </div>
                <p className="text-ink-400 mt-1">{equipo.descripcion_completa}</p>
                <div className="text-xs text-ink-400 font-mono mt-2">{equipo.codigo_qr}</div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-6">
              {infoRows.map(([k, v], idx) => (
                <div key={idx} className="flex justify-between gap-3 py-2 border-b border-ink-50 dark:border-white/5">
                  <span className="text-sm text-ink-400">{k}</span>
                  <span className="text-sm font-medium text-right">{v}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
            <div className="flex items-center gap-2 mb-5">
              <History size={18} className="text-brand-500" />
              <h3 className="font-semibold">{t('equipo.traceability')}</h3>
            </div>

            {movs.length === 0 ? (
              <p className="text-sm text-ink-400 py-6 text-center">{t('equipo.noMovements')}</p>
            ) : (
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-ink-100 dark:bg-white/10" />
                {movs.map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="relative pb-6 last:pb-0">
                    <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-brand-500 ring-4 ring-brand-500/15" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t(`movimiento.${m.tipo_movimiento}`)}</span>
                      <span className="text-xs text-ink-400">{fmtDate(m.fecha, i18n.language)}</span>
                    </div>
                    <div className="text-sm text-ink-500 mt-1 space-y-0.5">
                      {m.nombre_destino && <div>→ {m.nombre_destino}{m.proyecto_destino && ` · ${m.proyecto_destino}`}</div>}
                      {m.nombre_origen && <div>← {m.nombre_origen}</div>}
                      {m.proveedor && <div>Proveedor: {m.proveedor}</div>}
                      {m.estado_anterior && m.estado_nuevo && (
                        <div className="text-xs text-ink-400">{t(`estadoAsig.${m.estado_anterior}`)} → {t(`estadoAsig.${m.estado_nuevo}`)}</div>
                      )}
                      {m.observaciones && <div className="text-xs italic">{m.observaciones}</div>}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-6 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-500 mb-3">
              <QrCode size={16} /> {t('equipo.codigoQr')}
            </div>
            {qr && <img src={qr} alt="QR" className="w-44 h-44 mx-auto rounded-2xl border border-ink-100 dark:border-white/10 p-2 bg-white" />}
            <div className="font-mono text-sm mt-3">{equipo.codigo_qr}</div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => imprimirEtiquetaQr(equipo)} className="btn-secondary flex-1"><Printer size={16} /> {t('common.print')}</button>
              <button onClick={() => descargarQr(equipo)} className="btn-secondary flex-1"><Download size={16} /> PNG</button>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-500 mb-3"><User size={16} /> {t('equipo.assignedTo')}</div>
            {colab ? (
              <div className="space-y-2">
                <div className="font-medium">{colab.nombre}</div>
                <div className="text-sm text-ink-400 flex items-center gap-2"><ShieldCheck size={14} /> C.C. {colab.cedula}</div>
                {colab.cargo && <div className="text-sm text-ink-400 flex items-center gap-2"><Cpu size={14} /> {colab.cargo}</div>}
                {colab.proyecto && <div className="text-sm text-ink-400 flex items-center gap-2"><Building2 size={14} /> {colab.proyecto}</div>}
                {colab.lider && <div className="text-sm text-ink-400 flex items-center gap-2"><User size={14} /> {colab.lider}</div>}
                {colab.sede && <div className="text-sm text-ink-400 flex items-center gap-2"><MapPin size={14} /> {colab.sede}</div>}
              </div>
            ) : <p className="text-sm text-ink-400">{t('equipo.unassigned')}</p>}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

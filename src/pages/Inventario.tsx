import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Boxes, Search, Plus, Download, QrCode, AlertTriangle, SlidersHorizontal, Pencil } from 'lucide-react';
import { listEquipos } from '@/lib/api';
import { exportEquiposExcel } from '@/lib/excel';
import { descargarQr } from '@/lib/qr';
import { diasRestantes } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { EstadoBadge, Badge } from '@/components/ui/Badge';
import { NuevoEquipoModal } from '@/components/NuevoEquipoModal';
import { useApp } from '@/store/useApp';
import { scopeEquipos } from '@/lib/roles';
import type { Equipo } from '@/types';

export function Inventario() {
  const { t } = useTranslation();
  const { canEdit, can, perfil } = useApp();
  const { data: equiposRaw = [], refetch } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const equipos = useMemo(() => scopeEquipos(equiposRaw, perfil), [equiposRaw, perfil]);
  const puedeEditar = can('ADMIN', 'LIDER', 'JEFE_SEDE');

  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fProp, setFProp] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Equipo | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return equipos.filter((e) => {
      if (fEstado && e.estado_asignacion !== fEstado) return false;
      if (fTipo && e.tipo !== fTipo) return false;
      if (fProp && e.proveedor_propietario !== fProp) return false;
      if (!s) return true;
      return [e.serial, e.marca, e.linea_modelo, e.codigo_qr, e.proyecto_asignado, e.descripcion_completa]
        .some((v) => v?.toLowerCase().includes(s));
    });
  }, [equipos, q, fEstado, fTipo, fProp]);

  const proveedores = Array.from(new Set(equipos.map((e) => e.proveedor_propietario).filter(Boolean))) as string[];

  return (
    <div>
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle', { n: equipos.length })}
        icon={Boxes}
        action={
          <div className="flex gap-2">
            <button onClick={() => exportEquiposExcel(filtered)} className="btn-secondary"><Download size={16} /> Excel</button>
            {canEdit() && <button onClick={() => setShowNew(true)} className="btn-primary"><Plus size={16} /> {t('inventory.newEquipment')}</button>}
          </div>
        }
      />

      <div className="card p-4 mb-5">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input className="input pl-11" placeholder={t('common.searchSerial')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select
              value={fEstado}
              onChange={setFEstado}
              className="!w-auto"
              options={[
                { value: '', label: `${t('common.status')}: ${t('common.all')}` },
                ...['DISPONIBLE', 'ASIGNADO', 'EN_MANTENIMIENTO', 'EN_DEVOLUCION', 'DE_BAJA'].map((s) => ({ value: s, label: t(`estadoAsig.${s}`), description: t(`estadoAsigDesc.${s}`) })),
              ]}
            />
            <Select
              value={fTipo}
              onChange={setFTipo}
              className="!w-auto"
              options={[
                { value: '', label: `${t('common.type')}: ${t('common.all')}` },
                ...['PORTATIL', 'ESCRITORIO', 'CELULAR', 'MONITOR', 'PERIFERICO', 'BASE_RECALENTAMIENTO', 'CARGADOR', 'OTRO'].map((s) => ({ value: s, label: t(`tipo.${s}`), description: t(`tipoDesc.${s}`) })),
              ]}
            />
            <Select
              value={fProp}
              onChange={setFProp}
              className="!w-auto"
              options={[
                { value: '', label: `Proveedor: ${t('common.all')}` },
                ...proveedores.map((p) => ({ value: p, label: p })),
              ]}
            />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-400 border-b border-ink-100 dark:border-white/5">
              <th className="px-5 py-3 font-semibold">{t('inventory.columns.equipment')}</th>
              <th className="px-4 py-3 font-semibold">{t('inventory.columns.serial')}</th>
              <th className="px-4 py-3 font-semibold">{t('inventory.columns.type')}</th>
              <th className="px-4 py-3 font-semibold">{t('inventory.columns.status')}</th>
              <th className="px-4 py-3 font-semibold">{t('inventory.columns.owner')}</th>
              <th className="px-4 py-3 font-semibold">{t('inventory.columns.project')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => <Row key={e.id} e={e} i={i} onEdit={puedeEditar ? setEditing : undefined} />)}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="py-12 text-center text-ink-400">{t('common.empty')}</div>}
      </div>

      <div className="md:hidden space-y-3">
        {filtered.map((e) => <MobileCard key={e.id} e={e} onEdit={puedeEditar ? setEditing : undefined} />)}
        {filtered.length === 0 && <div className="py-12 text-center text-ink-400">{t('common.empty')}</div>}
      </div>

      <NuevoEquipoModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => refetch()} />
      <NuevoEquipoModal open={!!editing} onClose={() => setEditing(null)} onSaved={() => refetch()} equipo={editing ?? undefined} />
    </div>
  );
}

function VenceAlert({ e }: { e: Equipo }) {
  const d = diasRestantes(e.fecha_vencimiento_contrato);
  if (e.propiedad !== 'RENTADO' || d === null || d < 0 || d > 30) return null;
  return <span className="badge bg-warning/15 text-amber-600 dark:text-warning ml-2"><AlertTriangle size={11} /> {d}d</span>;
}

function Row({ e, i, onEdit }: { e: Equipo; i: number; onEdit?: (e: Equipo) => void }) {
  const { t } = useTranslation();
  return (
    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
      className="border-b border-ink-50 dark:border-white/5 hover:bg-ink-50/60 dark:hover:bg-white/5 transition-colors">
      <td className="px-5 py-3">
        <Link to={`/equipo/${e.id}`} className="block">
          <div className="font-medium">{e.marca} {e.linea_modelo}<VenceAlert e={e} /></div>
          <div className="text-xs text-ink-400">{e.codigo_qr}</div>
        </Link>
      </td>
      <td className="px-4 py-3 font-mono text-xs">{e.serial}</td>
      <td className="px-4 py-3"><Badge>{t(`tipo.${e.tipo}`)}</Badge></td>
      <td className="px-4 py-3"><EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} /></td>
      <td className="px-4 py-3 text-ink-500">{e.proveedor_propietario ?? '—'}</td>
      <td className="px-4 py-3 text-ink-500">{e.proyecto_asignado ?? '—'}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {onEdit && <button onClick={() => onEdit(e)} className="btn-ghost !p-2" title={t('common.edit')}><Pencil size={16} /></button>}
        <button onClick={() => descargarQr(e)} className="btn-ghost !p-2" title="QR"><QrCode size={16} /></button>
      </td>
    </motion.tr>
  );
}

function MobileCard({ e, onEdit }: { e: Equipo; onEdit?: (e: Equipo) => void }) {
  const { t } = useTranslation();
  return (
    <Link to={`/equipo/${e.id}`} className="card p-4 flex items-center gap-3 block">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{e.marca} {e.linea_modelo}<VenceAlert e={e} /></div>
        <div className="text-xs text-ink-400 font-mono">{e.serial}</div>
        <div className="flex items-center gap-2 mt-2">
          <EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} />
          <Badge>{t(`tipo.${e.tipo}`)}</Badge>
        </div>
      </div>
      {onEdit && (
        <button
          onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); onEdit(e); }}
          className="btn-ghost !p-2 shrink-0" title={t('common.edit')}>
          <Pencil size={16} />
        </button>
      )}
    </Link>
  );
}

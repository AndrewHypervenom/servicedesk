import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Boxes, Search, Plus, Download, QrCode, AlertTriangle, Pencil, Upload, SearchX, X } from 'lucide-react';
import { BotonBorrar } from '@/components/ui/BotonBorrar';
import { listEquipos } from '@/lib/api';
import { exportEquiposExcel } from '@/lib/excel';
import { descargarQr } from '@/lib/qr';
import { diasRestantes } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { EstadoBadge, Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { NuevoEquipoModal } from '@/components/NuevoEquipoModal';
import { ImportarModal } from '@/components/importar/ImportarModal';
import { useApp } from '@/store/useApp';
import { scopeEquipos } from '@/lib/roles';
import type { Equipo } from '@/types';

export function Inventario() {
  const { t } = useTranslation();
  const { canEdit, can, perfil } = useApp();
  const { data: equiposRaw = [], refetch, isLoading } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const equipos = useMemo(() => scopeEquipos(equiposRaw, perfil), [equiposRaw, perfil]);
  const puedeEditar = can('ADMIN', 'LIDER', 'JEFE_SEDE');

  const [q, setQ] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fProp, setFProp] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Equipo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const hayFiltros = !!(q.trim() || fEstado || fTipo || fProp);
  const limpiarFiltros = () => { setQ(''); setFEstado(''); setFTipo(''); setFProp(''); };

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

  const descargarQrsEnLote = async (rows: Equipo[], clear: () => void) => {
    setBulkBusy(true);
    try {
      // Secuencial a propósito: varios .click() simultáneos hacen que el
      // navegador descarte todas las descargas menos la primera.
      for (const e of rows) await descargarQr(e);
      toast.success(t('inventory.qrDone', { count: rows.length }));
      clear();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBulkBusy(false);
    }
  };

  const columns: Column<Equipo>[] = [
    {
      key: 'equipo',
      header: t('inventory.columns.equipment'),
      sortValue: (e) => `${e.marca ?? ''} ${e.linea_modelo ?? ''}`.trim(),
      className: '!px-5',
      headerClassName: '!px-5',
      cell: (e) => (
        <Link to={`/equipo/${e.id}`} className="block">
          <div className="font-medium">{e.marca} {e.linea_modelo}<VenceAlert e={e} /></div>
          <div className="text-xs text-ink-400">{e.codigo_qr}</div>
        </Link>
      ),
    },
    {
      key: 'serial',
      header: t('inventory.columns.serial'),
      sortValue: (e) => e.serial,
      className: 'font-mono text-xs',
      cell: (e) => e.serial,
    },
    {
      key: 'tipo',
      header: t('inventory.columns.type'),
      sortValue: (e) => t(`tipo.${e.tipo}`),
      cell: (e) => <Badge>{t(`tipo.${e.tipo}`)}</Badge>,
    },
    {
      key: 'estado',
      header: t('inventory.columns.status'),
      sortValue: (e) => t(`estadoAsig.${e.estado_asignacion}`),
      cell: (e) => <EstadoBadge estado={e.estado_asignacion} label={t(`estadoAsig.${e.estado_asignacion}`)} />,
    },
    {
      key: 'propiedad',
      header: t('inventory.columns.owner'),
      sortValue: (e) => e.proveedor_propietario,
      className: 'text-ink-500',
      cell: (e) => e.proveedor_propietario ?? '—',
    },
    {
      key: 'proyecto',
      header: t('inventory.columns.project'),
      sortValue: (e) => e.proyecto_asignado,
      className: 'text-ink-500',
      cell: (e) => e.proyecto_asignado ?? '—',
    },
    {
      key: 'acciones',
      header: '',
      className: 'text-right whitespace-nowrap',
      cell: (e) => (
        <>
          {puedeEditar && (
            <Button variant="ghost" iconOnly icon={Pencil} onClick={() => setEditing(e)} title={t('common.edit')} />
          )}
          <Button variant="ghost" iconOnly icon={QrCode} onClick={() => descargarQr(e)} title="QR" />
          <BotonBorrar
            entidad="equipos"
            id={e.id}
            etiqueta={`${e.marca} ${e.linea_modelo} · ${e.serial}`}
            invalidar={['equipos', 'solicitudesPendientes']}
          />
        </>
      ),
    },
  ];

  const vacio = hayFiltros ? (
    <EmptyState
      variant="search"
      icon={SearchX}
      title={t('common.noResultsTitle')}
      description={t('common.noResultsDesc')}
      action={<Button variant="secondary" icon={X} onClick={limpiarFiltros}>{t('common.clearFilters')}</Button>}
    />
  ) : (
    <EmptyState
      icon={Boxes}
      title={t('inventory.emptyTitle')}
      description={t('inventory.emptyDesc')}
      action={canEdit() && (
        <>
          <Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>{t('inventory.newEquipment')}</Button>
          {puedeEditar && <Button variant="secondary" icon={Upload} onClick={() => setShowImport(true)}>{t('import.button')}</Button>}
        </>
      )}
    />
  );

  return (
    <div>
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle', { n: equipos.length })}
        icon={Boxes}
        action={
          <div className="flex gap-2">
            <Button icon={Download} onClick={() => exportEquiposExcel(filtered)} disabled={filtered.length === 0}>Excel</Button>
            {puedeEditar && <Button icon={Upload} onClick={() => setShowImport(true)}>{t('import.button')}</Button>}
            {canEdit() && <Button variant="primary" icon={Plus} onClick={() => setShowNew(true)}>{t('inventory.newEquipment')}</Button>}
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
            {hayFiltros && (
              <Button variant="ghost" icon={X} onClick={limpiarFiltros}>{t('common.clearFilters')}</Button>
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(e) => e.id}
          loading={isLoading}
          empty={vacio}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          bulkActions={(rows, clear) => (
            <>
              <Button variant="secondary" icon={Download} onClick={() => { exportEquiposExcel(rows); clear(); }}>
                {t('inventory.bulkExport')}
              </Button>
              <Button variant="secondary" icon={QrCode} loading={bulkBusy} onClick={() => descargarQrsEnLote(rows, clear)}>
                {t('inventory.bulkQr')}
              </Button>
              <Button variant="ghost" iconOnly icon={X} onClick={clear} title={t('inventory.bulkClear')} />
            </>
          )}
        />
      </div>

      <div className="md:hidden">
        {isLoading ? (
          <SkeletonCards count={5} />
        ) : filtered.length === 0 ? (
          <div className="card">{vacio}</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((e) => <MobileCard key={e.id} e={e} onEdit={puedeEditar ? setEditing : undefined} />)}
          </div>
        )}
      </div>

      <NuevoEquipoModal open={showNew} onClose={() => setShowNew(false)} onSaved={() => refetch()} />
      <NuevoEquipoModal open={!!editing} onClose={() => setEditing(null)} onSaved={() => refetch()} equipo={editing ?? undefined} />
      <ImportarModal open={showImport} onClose={() => setShowImport(false)} onImportado={() => refetch()} />
    </div>
  );
}

function VenceAlert({ e }: { e: Equipo }) {
  const d = diasRestantes(e.fecha_vencimiento_contrato);
  if (e.propiedad !== 'RENTADO' || d === null || d < 0 || d > 30) return null;
  return <span className="badge bg-warning/15 text-amber-600 dark:text-warning ml-2"><AlertTriangle size={11} /> {d}d</span>;
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

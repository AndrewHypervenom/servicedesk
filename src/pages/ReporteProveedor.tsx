import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PackageOpen, Download, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { listProveedores, listEquipos } from '@/lib/api';
import { exportReporteProveedor } from '@/lib/excel';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';

export function ReporteProveedor() {
  const { t } = useTranslation();
  const { data: provs = [] } = useQuery({ queryKey: ['proveedores'], queryFn: listProveedores });
  const { data: equipos = [] } = useQuery({ queryKey: ['equipos'], queryFn: listEquipos });
  const [prov, setProv] = useState('');

  const lista = useMemo(() => equipos.filter((e) => e.proveedor_propietario === prov), [equipos, prov]);

  const pdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Devolución a proveedor: ${prov}`, 14, 18);
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text('Positivo S+ · Service Desk — ' + new Date().toLocaleDateString(), 14, 25);
    autoTable(doc, {
      startY: 32,
      head: [['#', 'Serial', 'Marca', 'Modelo', 'Cód. interno', 'Contrato', 'Estado']],
      body: lista.map((e, i) => [i + 1, e.serial, e.marca, e.linea_modelo, e.codigo_interno ?? '', e.numero_contrato ?? '', e.estado_asignacion]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [10, 132, 255] },
    });
    doc.save(`devolucion_${prov}.pdf`);
  };

  return (
    <div>
      <PageHeader title={t('supplierReport.title')} subtitle={t('supplierReport.subtitle')} icon={PackageOpen} />

      <div className="card p-5 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="label">{t('supplierReport.select')}</label>
            <Select
              value={prov}
              onChange={setProv}
              options={[
                { value: '', label: '—' },
                ...provs.map((p) => ({ value: p.nombre, label: p.nombre })),
              ]}
            />
          </div>
          {prov && (
            <>
              <button onClick={() => exportReporteProveedor(prov, lista)} className="btn-secondary"><Download size={16} /> Excel</button>
              <button onClick={pdf} className="btn-primary"><FileText size={16} /> PDF</button>
            </>
          )}
        </div>
      </div>

      {prov && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-100 dark:border-white/5 flex items-center justify-between">
            <span className="font-medium">{t('supplierReport.count', { n: lista.length, p: prov })}</span>
            <Badge>{lista.length} seriales</Badge>
          </div>
          {lista.length === 0 ? (
            <div className="py-10 text-center text-ink-400">{t('supplierReport.empty')}</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-white/5">
                  <th className="px-5 py-2">#</th><th className="px-4 py-2">Serial</th><th className="px-4 py-2">Marca / Modelo</th>
                  <th className="px-4 py-2">Cód. interno</th><th className="px-4 py-2">Contrato</th><th className="px-4 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e, i) => (
                  <tr key={e.id} className="border-b border-ink-50 dark:border-white/5">
                    <td className="px-5 py-2 text-ink-400">{i + 1}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.serial}</td>
                    <td className="px-4 py-2">{e.marca} {e.linea_modelo}</td>
                    <td className="px-4 py-2">{e.codigo_interno ?? '—'}</td>
                    <td className="px-4 py-2">{e.numero_contrato ?? '—'}</td>
                    <td className="px-4 py-2">{t(`estadoAsig.${e.estado_asignacion}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

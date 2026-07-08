import * as XLSX from 'xlsx';
import { excelSerialToDate } from './format';
import type { Equipo } from '@/types';

export function exportEquiposExcel(equipos: Equipo[], nombre = 'inventario.xlsx') {
  const rows = equipos.map((e) => ({
    'Código QR': e.codigo_qr,
    Marca: e.marca,
    'Línea/Modelo': e.linea_modelo,
    Serial: e.serial,
    Tipo: e.tipo,
    'Estado físico': e.estado_fisico,
    'Estado asignación': e.estado_asignacion,
    Propiedad: e.propiedad,
    'Proveedor/Propietario': e.proveedor_propietario ?? '',
    Proyecto: e.proyecto_asignado ?? '',
    'Cédula asignado': e.cedula_asignado ?? '',
    'N° contrato': e.numero_contrato ?? '',
    'Vence contrato': e.fecha_vencimiento_contrato ?? '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  XLSX.writeFile(wb, nombre);
}

export function exportReporteProveedor(proveedor: string, equipos: Equipo[]) {
  const rows = equipos.map((e, i) => ({
    '#': i + 1,
    Serial: e.serial,
    Marca: e.marca,
    Modelo: e.linea_modelo,
    'Código interno': e.codigo_interno ?? '',
    'N° contrato': e.numero_contrato ?? '',
    Estado: e.estado_asignacion,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, proveedor.slice(0, 30));
  XLSX.writeFile(wb, `devolucion_${proveedor}.xlsx`);
}

export interface ImportRow extends Partial<Equipo> { _raw?: Record<string, unknown>; }

export async function importEquiposExcel(file: File): Promise<ImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const pick = (r: Record<string, unknown>, keys: string[]) => {
    for (const k of Object.keys(r)) {
      const nk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keys.some((t) => nk.includes(t))) return r[k];
    }
    return undefined;
  };
  const toDate = (v: unknown) =>
    typeof v === 'number' ? excelSerialToDate(v) : (v ? String(v) : undefined);

  return json.map((r) => ({
    marca: String(pick(r, ['marca']) ?? '').toUpperCase(),
    linea_modelo: String(pick(r, ['linea', 'modelo']) ?? ''),
    descripcion_completa: String(pick(r, ['descripcion']) ?? ''),
    serial: String(pick(r, ['serial', 'serie']) ?? ''),
    proveedor_propietario: String(pick(r, ['proveedor', 'propietario', 'origen']) ?? ''),
    numero_contrato: String(pick(r, ['contrato']) ?? ''),
    fecha_vencimiento_contrato: toDate(pick(r, ['vencimiento', 'fin'])),
    fecha_ingreso: toDate(pick(r, ['ingreso'])) ?? new Date().toISOString().slice(0, 10),
    _raw: r,
  }));
}

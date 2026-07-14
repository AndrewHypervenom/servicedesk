export type TipoActivo =
  | 'PORTATIL' | 'ESCRITORIO' | 'CELULAR' | 'MONITOR'
  | 'PERIFERICO' | 'BASE_RECALENTAMIENTO' | 'CARGADOR' | 'OTRO';

export type EstadoFisico = 'BUENO' | 'REGULAR' | 'DANADO' | 'DE_BAJA';

export type EstadoAsignacion =
  | 'DISPONIBLE' | 'ASIGNADO' | 'EN_MANTENIMIENTO' | 'EN_DEVOLUCION' | 'DE_BAJA';

export type PropiedadActivo = 'EMPRESA' | 'PROYECTO' | 'RENTADO' | 'COMODATO';

export type TipoMovimiento =
  | 'RECEPCION' | 'ASIGNACION' | 'DEVOLUCION_COLABORADOR'
  | 'DEVOLUCION_PROVEEDOR' | 'REASIGNACION' | 'MANTENIMIENTO' | 'BAJA';

export type RolUsuario = 'ADMIN' | 'LIDER' | 'JEFE_SEDE' | 'TECNICO';

export interface Pais {
  id: string;
  nombre: string;
  codigo?: string | null;
  creado_en?: string;
}

export interface Sede {
  id: string;
  nombre: string;
  pais_id: string;
  pais_nombre?: string | null;
  creado_en?: string;
}

export type TipoActa = 'ENTREGA' | 'DEVOLUCION' | 'BAJA' | 'MANTENIMIENTO';

export interface Equipo {
  id: string;
  codigo_qr: string;
  marca: string;
  linea_modelo: string;
  descripcion_completa?: string | null;
  serial: string;
  tipo: TipoActivo;
  estado_fisico: EstadoFisico;
  estado_asignacion: EstadoAsignacion;
  propiedad: PropiedadActivo;
  proveedor_propietario?: string | null;
  fecha_ingreso: string;
  fecha_vencimiento_contrato?: string | null;
  numero_contrato?: string | null;
  codigo_interno?: number | null;
  cedula_asignado?: string | null;
  proyecto_asignado?: string | null;
  sede_id?: string | null;
  proveedor_compra?: string | null;
  fecha_compra?: string | null;
  fecha_garantia?: string | null;
  ficha_tecnica?: string | null;
  observaciones?: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface Colaborador {
  cedula: string;
  nombre: string;
  cargo?: string | null;
  correo?: string | null;
  telefono?: string | null;
  proyecto?: string | null;
  lider?: string | null;
  sede?: string | null;       // texto libre heredado; se conserva por historia
  sede_id?: string | null;    // la sede real (FK a sedes)
  activo: boolean;
  creado_en: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  tipo: string;
  contacto?: string | null;
  correo?: string | null;
  telefono?: string | null;
  observacion?: string | null;
}

export interface Marca {
  id: string;
  nombre: string;
}

export interface Movimiento {
  id: number;
  equipo_id: string;
  tipo_movimiento: TipoMovimiento;
  cedula_origen?: string | null;
  cedula_destino?: string | null;
  nombre_origen?: string | null;
  nombre_destino?: string | null;
  proyecto_origen?: string | null;
  proyecto_destino?: string | null;
  proveedor?: string | null;
  estado_anterior?: EstadoAsignacion | null;
  estado_nuevo?: EstadoAsignacion | null;
  fecha: string;
  acta_id?: string | null;
  registrado_por?: string | null;
  observaciones?: string | null;
  creado_en: string;
}

export interface ActaItemSnapshot {
  equipo_id: string;
  observaciones?: string | null;
}

export interface Acta {
  id: string;
  consecutivo?: string | null;
  tipo: TipoActa;
  equipo_id?: string | null;
  items?: ActaItemSnapshot[] | null;
  cedula_colaborador?: string | null;
  pdf_url?: string | null;
  archivo_firmado_url?: string | null;
  firma_data?: string | null;
  firmado: boolean;
  correo_enviado: boolean;
  correo_destino?: string | null;
  observaciones?: string | null;
  creado_en: string;
}

export interface Perfil {
  id: string;
  nombre: string;
  correo?: string | null;
  cedula?: string | null;
  cargo?: string | null;
  rol: RolUsuario;
  idioma: string;
  activo: boolean;
  avatar_url?: string | null;
  sede_id?: string | null;
  debe_cambiar_password?: boolean | null;
  firma_data?: string | null;
}

export interface Integracion {
  id: string;
  nombre: string;
  direccion: 'ENTRANTE' | 'SALIENTE';
  tipo?: string | null;
  url?: string | null;
  api_key: string;
  eventos: string[];
  activo: boolean;
  creado_en: string;
}

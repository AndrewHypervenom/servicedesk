export type TipoActivo =
  | 'PORTATIL' | 'ESCRITORIO' | 'CELULAR' | 'MONITOR'
  | 'PERIFERICO' | 'BASE_RECALENTAMIENTO' | 'CARGADOR' | 'OTRO';

export type EstadoFisico = 'BUENO' | 'REGULAR' | 'CON_FALLA' | 'DANADO' | 'DE_BAJA';

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
  // Null cuando el equipo no tiene serial que registrar (todo lo que no es
  // portátil se guarda así): el índice único admite varios nulos, 'N/A' no.
  serial: string | null;
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
  /** Borrado suave. Solo el ADMIN recibe filas con esto relleno (ver RLS). */
  eliminado_en?: string | null;
  eliminado_por?: string | null;
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
  // --- Datos que llegan en la base mensual de Talento Humano ---
  estado_interno?: string | null;   // ACTIVO, RENUNCIA VOLUNTARIA, …
  fecha_ingreso?: string | null;
  fecha_retiro?: string | null;
  fecha_nacimiento?: string | null;
  correo_personal?: string | null;
  centro_costos?: string | null;
  cc_sap?: string | null;
  area?: string | null;
  coordinador?: string | null;
  gerente?: string | null;
  termino_contrato?: string | null;
  ciudad?: string | null;
  actualizado_en?: string | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
}

/**
 * Una línea móvil corporativa (SIM de Claro).
 *
 * Los nueve primeros campos son, uno a uno, las columnas del archivo que esta
 * pantalla vino a reemplazar; se conservan con su forma original (texto libre,
 * incluida `fecha_corte`, que en el archivo son frases y no fechas) para que la
 * exportación devuelva exactamente el mismo formato. Lo demás es lo que el
 * archivo no podía tener: sede, titular real y rastro de cambios.
 */
export interface LineaMovil {
  id: string;
  /**
   * Null en las SIM que todavía no se han activado (la hoja "EMPAQUES NUEVOS"
   * del libro): existen en el inventario, pero aún no tienen línea asignada.
   * La identidad en ese caso es el ICCID — la base lo resuelve en `clave`.
   */
  numero: string | null;
  iccid?: string | null;
  /** El equipo, no la SIM. Solo lo trae la hoja "IMEI CELULARES SAMSUNG". */
  imei?: string | null;
  /** Identidad calculada por la base: el número, o "SIM:<iccid>" si no hay. */
  clave?: string;
  /** Hoja del libro de la que salió la línea. */
  hoja_origen?: string | null;
  estado?: string | null;
  /** Titular tal como venía escrito en el archivo. */
  nombre?: string | null;
  cr?: string | null;
  proyecto?: string | null;
  observacion?: string | null;
  fecha_corte?: string | null;
  solicitud_claro?: string | null;
  operador?: string | null;
  /** Titular real: solo si esa persona existe en la planta (tiene FK). */
  cedula_asignado?: string | null;
  /**
   * La cédula tal como venía en el archivo, sin FK. Las líneas suspendidas son
   * de gente que ya no está en la planta, y su cédula sigue siendo el dato que
   * dice de quién era la línea.
   */
  cedula_archivo?: string | null;
  sede_id?: string | null;
  creado_en?: string;
  actualizado_en?: string | null;
  creado_por?: string | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
}

export interface Proveedor {
  id: string;
  nombre: string;
  tipo: string;
  contacto?: string | null;
  correo?: string | null;
  telefono?: string | null;
  observacion?: string | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
}

/**
 * Una persona a la que se le puede atribuir un ticket.
 *
 * No es un `Perfil` recortado por comodidad: es todo lo que la base entrega del
 * directorio (`analistas_de_mesa()`). El Líder de sede no puede leer la tabla
 * `perfiles`, así que esto es lo único que tiene para enlazar — un nombre y un
 * identificador, sin correo, rol ni sede.
 */
export interface AnalistaMesa {
  id: string;
  nombre: string;
  /** Si no, solo sirve para leer un enlace ya hecho: ADMIN, cuenta de servicio o baja. */
  seleccionable: boolean;
}

export type EstadoTicket = 'COMPLETADA' | 'EN_PROGRESO' | 'PENDIENTE' | 'BLOQUEADA';
export type PrioridadTicket = 'ALTA' | 'MEDIA' | 'BAJA';

/**
 * Un renglón del control de tickets de la mesa de servicio.
 *
 * Es una fila del libro "CONTROL TICKETS.xlsx", que tenía una hoja por mes. El
 * mes aquí es un campo (`periodo`), no una hoja: las cuatro hojas del archivo
 * viven en la misma tabla y se filtran, no se abren.
 *
 * Los campos van en parejas allí donde el archivo traía texto libre y aquí hay
 * un enlace real: `analista_id`/`analista_texto` y `sede_id`/`ciudad_texto`. El
 * enlace es lo que se agrupa y se grafica; el texto es lo que decía el archivo,
 * y se conserva para poder revisar un enlace mal hecho.
 */
export interface Ticket {
  id: string;
  /** Número de la mesa de servicio, "161116-1". No es único: el mismo ticket
   *  puede traer dos tareas (una devolución y un retiro). */
  ticket: string;
  descripcion?: string | null;
  estado: EstadoTicket;
  prioridad?: PrioridadTicket | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  /** Días calendario entre inicio y fin. Lo calcula la base; no se escribe.
   *  La identidad de una fila —lo que impide que la misma se cargue dos veces—
   *  es ticket + descripción + fecha de inicio, y no vive en ninguna columna:
   *  la impone un índice único (ver la migración). */
  dias?: number | null;
  /** Mes al que pertenece, 'AAAA-MM'. */
  periodo?: string | null;
  hoja_origen?: string | null;
  analista_id?: string | null;
  analista_texto?: string | null;
  sede_id?: string | null;
  ciudad_texto?: string | null;
  /** Porcentaje de cumplimiento, 0–100. */
  cumplimiento?: number | null;
  notas?: string | null;
  creado_en?: string;
  actualizado_en?: string | null;
  creado_por?: string | null;
  eliminado_en?: string | null;
  eliminado_por?: string | null;
}

/** Entidades sobre las que existe borrado suave. */
export type EntidadBorrable = 'equipos' | 'colaboradores' | 'proveedores';

export type EstadoSolicitud = 'PENDIENTE' | 'APROBADA' | 'RESTAURADA';

export interface SolicitudBorrado {
  id: number;
  entidad: EntidadBorrable;
  registro_id: string;
  /** Nombre legible copiado al solicitar, para que la solicitud siga
   *  entendiéndose aunque el registro acabe eliminado definitivamente. */
  etiqueta: string;
  motivo?: string | null;
  estado: EstadoSolicitud;
  solicitado_por: string;
  solicitado_en: string;
  resuelto_por?: string | null;
  resuelto_en?: string | null;
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
  /** Perfil del técnico que generó el acta; queda fijo aunque la abra otro. */
  generado_por?: string | null;
  creado_en: string;
}

/** Lo que el RPC `tecnico_de_acta` expone del autor de un acta. */
export interface TecnicoActa {
  nombre: string;
  cedula: string | null;
  firma_data: string | null;
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
  /**
   * País desde el que trabaja la persona. No da acceso a nada: el alcance real
   * se asigna en `perfil_paises`. Sirve para que las pantallas abran filtradas
   * por su país y las listas de sedes pongan las suyas primero.
   */
  pais_id?: string | null;
  debe_cambiar_password?: boolean | null;
  firma_data?: string | null;
}

export type AccionAuditoria = 'INSERT' | 'UPDATE' | 'DELETE';

/** Un renglón de la bitácora. En UPDATE, `datos` es un diff por campo
 *  `{ campo: { antes, despues } }`; en INSERT/DELETE es el registro completo. */
export interface RegistroAuditoria {
  id: number;
  entidad: string;
  entidad_id: string | null;
  accion: AccionAuditoria;
  actor: string | null;
  datos: Record<string, unknown> | null;
  creado_en: string;
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

/**
 * Respuesta a "¿entregó el equipo este colaborador?".
 *
 * Es una fila por persona, no por equipo: la pregunta se hace sobre la salida,
 * y lo que se responde es si esa salida quedó saldada. El detalle de qué equipo
 * volvió y cuándo ya lo cuenta la trazabilidad de cada equipo.
 */
export type RespuestaEntrega = 'ENTREGO' | 'NO_ENTREGO' | 'SIN_EQUIPOS';

export interface RevisionSalida {
  cedula: string;
  respuesta: RespuestaEntrega;
  revisado_por?: string | null;
  revisado_en: string;
}

import type { EstadoAsignacion, EstadoFisico, TipoActivo, TipoMovimiento } from '@/types';

/** Qué tan grave es lo que encontró el análisis. */
export type Severidad =
  /** Impide importar la fila. El usuario tiene que resolverlo antes de continuar. */
  | 'BLOQUEANTE'
  /** La fila entra, pero con un dato dudoso que conviene revisar después. */
  | 'ADVERTENCIA'
  /** Solo informativo: decisiones que tomó el importador y conviene que se sepan. */
  | 'INFO';

export type TipoIncidencia =
  | 'CEDULA_FALTANTE'
  | 'CEDULA_INVALIDA'
  | 'SERIAL_CONFLICTO'
  | 'SERIAL_HUERFANO'
  | 'SERIAL_YA_EXISTE'
  | 'MODELO_SOSPECHOSO'
  | 'MODELO_AUSENTE'
  | 'MARCA_SOSPECHOSA'
  | 'VALOR_NO_CATALOGADO'
  | 'FECHA_INVALIDA'
  | 'HOJA_IGNORADA'
  | 'FILAS_PLANTILLA';

export interface Incidencia {
  id: string;
  tipo: TipoIncidencia;
  severidad: Severidad;
  hoja: string;
  /** Fila tal como se ve en Excel (con encabezado = 1), para que el usuario la ubique. */
  fila?: number;
  columna?: string;
  valor?: string;
  mensaje: string;
  sugerencia?: string;
}

/** Una persona que aparece con equipo a cargo pero de la que no conocemos la cédula. */
export interface PendienteCedula {
  nombre: string;
  /** Seriales que quedarían sin dueño si no se resuelve. */
  seriales: string[];
  /** Dónde apareció, para dar contexto al usuario. */
  origen: string[];
}

/** Las dos versiones en conflicto de un mismo serial. */
export interface ConflictoSerial {
  serial: string;
  opciones: Array<{
    fila: number;
    estado_asignacion: EstadoAsignacion;
    estado_fisico: EstadoFisico;
    usuario: string | null;
    resumen: string;
  }>;
}

export interface EquipoImport {
  fila: number;
  serial: string;
  marca: string;
  linea_modelo: string;
  tipo: TipoActivo;
  estado_fisico: EstadoFisico;
  estado_asignacion: EstadoAsignacion;
  observaciones: string | null;
  /** Nombre crudo del Excel; se convierte en cédula al aplicar. */
  usuarioNombre: string | null;
  ubicacion: string | null;
}

export interface ColaboradorImport {
  cedula: string;
  nombre: string;
  origen: string;
}

export interface MovimientoImport {
  fila: number;
  hoja: string;
  serial: string;
  tipo_movimiento: TipoMovimiento;
  fecha: string | null;
  personaNombre: string | null;
  personaCedula: string | null;
  registrado_por: string | null;
  observaciones: string | null;
}

export interface ResumenHoja {
  nombre: string;
  filasLeidas: number;
  filasUtiles: number;
  destino: string;
  /** Las hojas sin datos aprovechables se muestran pero no aportan registros. */
  ignorada: boolean;
  nota?: string;
}

export interface ResultadoAnalisis {
  archivo: string;
  hojas: ResumenHoja[];
  equipos: EquipoImport[];
  colaboradores: ColaboradorImport[];
  movimientos: MovimientoImport[];
  incidencias: Incidencia[];
  pendientesCedula: PendienteCedula[];
  conflictos: ConflictoSerial[];
  /** Nombres de sede que el Excel menciona y hay que mapear contra `sedes`. */
  ubicaciones: string[];
  duracionMs: number;
}

/** Lo que el usuario decide en la pantalla de revisión. */
export interface Resoluciones {
  /** nombre normalizado -> cédula que escribió el usuario. */
  cedulas: Record<string, string>;
  /** serial -> fila del Excel que gana. */
  conflictos: Record<string, number>;
  /** Sede destino para todo lo importado. */
  sedeId: string | null;
}

/**
 * La escritura es una sola transacción en la base, así que no hay un avance
 * parcial que reportar: solo en qué está la llamada.
 */
export interface ProgresoAplicacion {
  etapa: 'preparando' | 'escribiendo' | 'catalogos' | 'listo';
}

/** Solo se construye si la transacción entró completa; si no, `aplicar` lanza. */
export interface ResultadoAplicacion {
  colaboradoresCreados: number;
  equiposCreados: number;
  equiposOmitidos: number;
  movimientosCreados: number;
}

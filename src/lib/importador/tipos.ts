import type { EstadoAsignacion, EstadoFisico, PropiedadActivo, TipoActivo, TipoMovimiento } from '@/types';
import type { HojaId } from './campos';

/** Cómo tratar una columna del Excel que ningún campo reclamó. */
export type ModoExtra = 'IGNORAR' | 'OBSERVACIONES';

/** El mapeo de una hoja: qué columna del Excel alimenta cada campo del sistema. */
export interface MapeoHoja {
  /** Nombre real de la hoja en el Excel (con tildes y espacios). */
  hoja: string;
  /** Encabezados detectados en la hoja. */
  columnas: string[];
  /** Primeros valores de cada columna, para orientar al usuario en el mapeo. */
  muestras: Record<string, string[]>;
  /** Filas con datos (sin contar el encabezado). */
  filas: number;
  /** campoId -> columna elegida (o null si el usuario lo dejó sin asignar). */
  campos: Record<string, string | null>;
  /** Columnas que ningún campo usa: se ignoran o van a observaciones. */
  extras: Record<string, ModoExtra>;
}

/** El mapeo completo del libro, indexado por la hoja conocida a la que corresponde. */
export type Mapeo = Partial<Record<HojaId, MapeoHoja>>;

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
  /** De quién es el equipo: EMPRESA (BD_EQUIPOS) o COMODATO del operador (CLARO). */
  propiedad: PropiedadActivo;
  /** Dueño externo cuando no es de la empresa (ej. "CLARO"). */
  proveedor_propietario: string | null;
  /** Hoja de la que salió el equipo, para el resumen y el trazo. */
  origen: HojaId;
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
  /** Ubicación normalizada del Excel -> sede del sistema a la que se manda. */
  sedes: Record<string, string>;
  /** Sede para lo que no trae ubicación (colaboradores y equipos sin sede). */
  sedeDefecto: string | null;
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

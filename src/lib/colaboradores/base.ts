/**
 * Lectura de la base mensual de Talento Humano ("EMPLEADOS COLOMBIA.xlsx").
 *
 * El archivo lo arma otra área y cambia de mes a mes: columnas que se mueven de
 * sitio, encabezados con puntos ("DESC. AREA"), fechas como seriales de Excel,
 * celdas con un espacio en blanco en vez de vacías y estatus escritos de nueve
 * maneras distintas. Nada de eso puede llegar a la base de datos, así que este
 * módulo hace tres cosas y ninguna toca la red:
 *
 *   1. `leerLibroBase`  — abre el Excel, encuentra la fila de encabezados
 *                         (no siempre es la primera) y devuelve filas crudas.
 *   2. `mapeoAutomatico`— propone a qué campo va cada columna, para que el
 *                         usuario solo confirme en vez de mapear 18 columnas.
 *   3. `analizarBase`   — valida fila a fila y devuelve un informe: qué entra,
 *                         qué se descarta y por qué, qué ciudades aparecen.
 *
 * Nada se escribe hasta que el usuario confirma: `filasParaCarga` es el último
 * paso y solo traduce el análisis al formato que espera el RPC.
 */

import * as XLSX from 'xlsx';
import i18n from '@/i18n';
import {
  limpioODefecto, normCedula, nombrePropio, normNombre, parseFecha,
} from '@/lib/importador/normalizar';
import { esEstatusActivo } from './estatus';
import type { Colaborador } from '@/types';

// --------------------------------------------------------------- campos

export type CampoId =
  | 'cedula' | 'nombre' | 'estado_interno' | 'fecha_ingreso' | 'fecha_retiro'
  | 'fecha_nacimiento' | 'telefono' | 'ciudad' | 'proyecto' | 'centro_costos' | 'cc_sap'
  | 'correo_personal' | 'correo' | 'cargo' | 'area' | 'lider' | 'coordinador'
  | 'gerente' | 'termino_contrato';

export interface CampoBase {
  id: CampoId;
  /** Clave i18n de la etiqueta (se traduce al pintar el mapeo). */
  etiqueta: string;
  /** Clave i18n de la ayuda bajo el campo. */
  ayuda: string;
  obligatorio?: boolean;
  /** Encabezados que se reconocen, del más específico al más genérico. */
  alias: string[];
}

/**
 * El orden importa dos veces: es el orden en que se pinta el mapeo y el orden
 * en que se reparten las columnas (el primero que reclama una columna se la
 * queda). Por eso `correo_personal` va antes que `correo`: si no, el corporativo
 * se llevaría la columna "CORREO PERSONAL" por contener la palabra "CORREO".
 */
export const CAMPOS_BASE: CampoBase[] = [
  { id: 'cedula', etiqueta: 'colabField.cedula', ayuda: 'baseImport.fields.cedula', obligatorio: true,
    alias: ['CEDULA', 'NO DOCUMENTO', 'NUMERO DE DOCUMENTO', 'DOCUMENTO', 'IDENTIFICACION', 'CC'] },
  { id: 'nombre', etiqueta: 'colabField.nombre', ayuda: 'baseImport.fields.nombre', obligatorio: true,
    alias: ['NOMBRE Y APELLIDO', 'NOMBRE COMPLETO', 'NOMBRES Y APELLIDOS', 'COLABORADOR', 'EMPLEADO', 'NOMBRE'] },
  { id: 'estado_interno', etiqueta: 'colabField.estatusInterno', ayuda: 'baseImport.fields.estatus',
    alias: ['ESTATUS INTERNO', 'ESTADO INTERNO', 'ESTATUS', 'ESTADO'] },
  { id: 'cargo', etiqueta: 'colabField.cargo', ayuda: 'baseImport.fields.cargo',
    alias: ['DESC OFICIO', 'DESCRIPCION OFICIO', 'OFICIO', 'CARGO', 'PUESTO'] },
  { id: 'area', etiqueta: 'colabField.area', ayuda: 'baseImport.fields.area',
    alias: ['DESC AREA', 'DESCRIPCION AREA', 'AREA'] },
  { id: 'ciudad', etiqueta: 'colabField.ciudad', ayuda: 'baseImport.fields.ciudad',
    alias: ['CIUDAD', 'MUNICIPIO', 'UBICACION', 'SEDE'] },
  { id: 'correo', etiqueta: 'colabField.correo', ayuda: 'baseImport.fields.correo',
    alias: ['CORREO POSITIVO', 'CORREO CORPORATIVO', 'CORREO EMPRESARIAL', 'CORREO INSTITUCIONAL', 'CORREO', 'EMAIL'] },
  { id: 'correo_personal', etiqueta: 'colabField.correoPersonal', ayuda: 'baseImport.fields.correoPersonal',
    alias: ['CORREO PERSONAL', 'EMAIL PERSONAL', 'MAIL PERSONAL'] },
  { id: 'telefono', etiqueta: 'colabField.telefono', ayuda: 'baseImport.fields.telefono',
    alias: ['TELEFONO', 'CELULAR', 'MOVIL', 'CONTACTO'] },
  { id: 'fecha_ingreso', etiqueta: 'colabField.fechaIngreso', ayuda: 'baseImport.fields.fechaIngreso',
    alias: ['FECHA INGRESO', 'FECHA DE INGRESO', 'INGRESO'] },
  { id: 'fecha_retiro', etiqueta: 'colabField.fechaRetiro', ayuda: 'baseImport.fields.fechaRetiro',
    alias: ['FECHA DE RETIRO', 'FECHA RETIRO', 'RETIRO'] },
  { id: 'fecha_nacimiento', etiqueta: 'colabField.fechaNacimiento', ayuda: 'common.optional',
    alias: ['FECHA DE NACIMIENTO', 'FECHA NACIMIENTO', 'NACIMIENTO'] },
  { id: 'proyecto', etiqueta: 'colabField.proyecto', ayuda: 'baseImport.fields.proyecto',
    alias: ['PROYECTO', 'CUENTA', 'CAMPAÑA', 'CAMPANA'] },
  { id: 'centro_costos', etiqueta: 'colabField.centroCostos', ayuda: 'baseImport.fields.centroCostos',
    alias: ['CENTRO DE COSTOS A', 'CENTRO DE COSTOS', 'CENTRO COSTOS', 'CECO'] },
  { id: 'cc_sap', etiqueta: 'colabField.ccSap', ayuda: 'baseImport.fields.ccSap',
    alias: ['CC SAP', 'CODIGO SAP', 'SAP'] },
  { id: 'lider', etiqueta: 'colabField.supervisorLider', ayuda: 'baseImport.fields.lider',
    alias: ['SUPERVISOR LIDER', 'SUPERVISOR', 'LIDER', 'JEFE INMEDIATO'] },
  { id: 'coordinador', etiqueta: 'colabField.coordinador', ayuda: 'common.optional', alias: ['COORDINADOR'] },
  { id: 'gerente', etiqueta: 'colabField.gerente', ayuda: 'common.optional', alias: ['GERENTE'] },
  { id: 'termino_contrato', etiqueta: 'colabField.terminoContrato', ayuda: 'baseImport.fields.terminoContrato',
    alias: ['TERMINO CONTRATO', 'TERMINO DE CONTRATO', 'TIPO DE CONTRATO', 'TIPO CONTRATO', 'CONTRATO'] },
];

/** Columna del Excel asignada a cada campo (`null` = ese campo no se importa). */
export type MapeoBase = Record<CampoId, string | null>;

export const MAPEO_VACIO: MapeoBase = Object.fromEntries(
  CAMPOS_BASE.map((c) => [c.id, null]),
) as MapeoBase;

// ---------------------------------------------------------------- lectura

export interface LibroBase {
  nombreArchivo: string;
  hojas: string[];
  hoja: string;
  columnas: string[];
  filas: Record<string, unknown>[];
  /** Fila del Excel (1-based) donde estaban los encabezados. */
  filaEncabezado: number;
}

/** Todos los alias en una bolsa, para reconocer la fila de encabezados. */
const TODOS_LOS_ALIAS = CAMPOS_BASE.flatMap((c) => c.alias);

function pareceEncabezado(celdas: unknown[]): number {
  const textos = celdas.map((c) => normNombre(c)).filter(Boolean);
  if (textos.length < 3) return 0;
  return textos.filter((t) => TODOS_LOS_ALIAS.some((a) => t === a || t.startsWith(a) || t.includes(a))).length;
}

/**
 * Abre el Excel y devuelve las filas de la hoja elegida.
 *
 * Busca la fila de encabezados entre las 15 primeras en vez de asumir la 1:
 * las bases de RR. HH. suelen traer un título o una fila en blanco arriba, y
 * ese detalle bastaba para que la importación leyera basura.
 */
export async function leerLibroBase(file: File, hojaPedida?: string): Promise<LibroBase> {
  const buf = await file.arrayBuffer();
  return parseLibroDesdeBuffer(buf, file.name, hojaPedida);
}

/**
 * El parseo puro (sin File): abre el buffer y arma el `LibroBase`. Vive aparte
 * de `leerLibroBase` porque `XLSX.read` bloquea el hilo con archivos grandes, y
 * así se puede ejecutar dentro de un Web Worker sin congelar la interfaz.
 */
export function parseLibroDesdeBuffer(
  buf: ArrayBuffer, nombreArchivo: string, hojaPedida?: string,
): LibroBase {
  const wb = XLSX.read(buf, { type: 'array' });
  const hojas = wb.SheetNames;
  if (!hojas.length) throw new Error(i18n.t('baseImport.errNoSheets'));

  // Sin hoja pedida, se prefiere una llamada BASE y si no la de más filas.
  const hoja = hojaPedida && hojas.includes(hojaPedida)
    ? hojaPedida
    : hojas.find((h) => normNombre(h) === 'BASE')
      ?? hojas.reduce((may, h) => (
        (XLSX.utils.decode_range(wb.Sheets[h]['!ref'] ?? 'A1').e.r)
        > (XLSX.utils.decode_range(wb.Sheets[may]['!ref'] ?? 'A1').e.r) ? h : may), hojas[0]);

  const ws = wb.Sheets[hoja];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });

  let idx = 0;
  let mejor = 0;
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const puntos = pareceEncabezado(matriz[i] ?? []);
    if (puntos > mejor) { mejor = puntos; idx = i; }
  }
  if (!mejor) throw new Error(i18n.t('baseImport.errNoHeaders', { hoja }));

  // Encabezados únicos: si dos columnas se llaman igual, la segunda pasa a
  // "NOMBRE (2)" para que el mapeo pueda distinguirlas.
  const vistos = new Map<string, number>();
  const columnas = (matriz[idx] ?? []).map((c, i) => {
    const base = limpioODefecto(c) ?? `Columna ${i + 1}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });

  const filas: Record<string, unknown>[] = [];
  for (let i = idx + 1; i < matriz.length; i++) {
    const celdas = matriz[i] ?? [];
    if (celdas.every((c) => c == null || String(c).trim() === '')) continue;
    const fila: Record<string, unknown> = { __fila: i + 1 };
    columnas.forEach((col, j) => { fila[col] = celdas[j] ?? null; });
    filas.push(fila);
  }

  return { nombreArchivo, hojas, hoja, columnas, filas, filaEncabezado: idx + 1 };
}

// ----------------------------------------------------------------- mapeo

/** Qué tan bien encaja una columna con un campo. 0 = no encaja. */
function puntuar(columna: string, campo: CampoBase): number {
  const c = normNombre(columna);
  if (!c) return 0;
  for (let i = 0; i < campo.alias.length; i++) {
    const a = campo.alias[i];
    // Los alias más específicos van primero, así que un empate por tipo de
    // coincidencia lo desempata la posición: "DESC AREA" gana a "AREA".
    if (c === a) return 100 - i;
    if (c.startsWith(a) || c.endsWith(a)) return 70 - i;
    if (c.includes(a)) return 40 - i;
  }
  return 0;
}

/** Propuesta de mapeo: cada campo se queda con la columna que mejor puntúa. */
export function mapeoAutomatico(columnas: string[]): MapeoBase {
  const mapeo = { ...MAPEO_VACIO };
  const tomadas = new Set<string>();
  for (const campo of CAMPOS_BASE) {
    let mejor: { col: string; pts: number } | null = null;
    for (const col of columnas) {
      if (tomadas.has(col)) continue;
      const pts = puntuar(col, campo);
      if (pts > 0 && (!mejor || pts > mejor.pts)) mejor = { col, pts };
    }
    if (mejor) { mapeo[campo.id] = mejor.col; tomadas.add(mejor.col); }
  }
  return mapeo;
}

export function mapeoCompleto(mapeo: MapeoBase): boolean {
  return CAMPOS_BASE.filter((c) => c.obligatorio).every((c) => !!mapeo[c.id]);
}

// --------------------------------------------------------------- análisis

export interface PersonaBase {
  fila: number;
  cedula: string;
  nombre: string;
  cargo: string | null;
  correo: string | null;
  correo_personal: string | null;
  telefono: string | null;
  ciudad: string | null;
  area: string | null;
  proyecto: string | null;
  centro_costos: string | null;
  cc_sap: string | null;
  lider: string | null;
  coordinador: string | null;
  gerente: string | null;
  estado_interno: string | null;
  termino_contrato: string | null;
  fecha_ingreso: string | null;
  fecha_retiro: string | null;
  fecha_nacimiento: string | null;
  activo: boolean;
  /** true si esa cédula todavía no existe en la base. */
  nueva: boolean;
}

export interface FilaDescartada {
  fila: number;
  motivo: string;
  detalle: string;
}

export interface Conteo { nombre: string; total: number }

export interface AnalisisBase {
  archivo: string;
  hoja: string;
  filasLeidas: number;
  personas: PersonaBase[];
  descartadas: FilaDescartada[];
  /** Cédulas repetidas dentro del archivo: se conserva la última aparición. */
  repetidas: { cedula: string; nombre: string; filas: number[] }[];
  ciudades: Conteo[];
  estatus: Conteo[];
  areas: Conteo[];
  nuevas: number;
  existentes: number;
  activos: number;
  inactivos: number;
  sinCorreo: number;
  fechasIlegibles: number;
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const conteo = (valores: (string | null)[]): Conteo[] => {
  const m = new Map<string, number>();
  for (const v of valores) {
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
};

/**
 * Valida el archivo entero contra el mapeo y devuelve el informe de la
 * revisión. No escribe nada: es lo que el usuario ve antes de decidir.
 */
export function analizarBase(
  libro: LibroBase,
  mapeo: MapeoBase,
  existentes: Colaborador[],
): AnalisisBase {
  const yaEnBase = new Set(existentes.map((c) => c.cedula));
  const val = (fila: Record<string, unknown>, id: CampoId): unknown => {
    const col = mapeo[id];
    return col ? fila[col] : null;
  };

  const porCedula = new Map<string, PersonaBase>();
  const filasPorCedula = new Map<string, number[]>();
  const descartadas: FilaDescartada[] = [];
  let fechasIlegibles = 0;

  for (const fila of libro.filas) {
    const nFila = Number(fila.__fila ?? 0);
    const cedula = normCedula(val(fila, 'cedula'));
    const nombreCrudo = limpioODefecto(val(fila, 'nombre'));

    if (!cedula) {
      descartadas.push({
        fila: nFila,
        // Se guarda la clave i18n; la pantalla la traduce al idioma activo.
        motivo: 'baseImport.discard.noId',
        detalle: nombreCrudo ?? String(val(fila, 'cedula') ?? i18n.t('baseImport.discard.emptyRow')),
      });
      continue;
    }
    if (!nombreCrudo) {
      descartadas.push({ fila: nFila, motivo: 'baseImport.discard.noName', detalle: `C.C. ${cedula}` });
      continue;
    }

    const fecha = (id: CampoId): string | null => {
      const r = parseFecha(val(fila, id));
      if (r.invalida) fechasIlegibles++;
      return r.iso;
    };

    const correoCrudo = limpioODefecto(val(fila, 'correo'))?.toLowerCase() ?? null;
    const personalCrudo = limpioODefecto(val(fila, 'correo_personal'))?.toLowerCase() ?? null;
    const estado = limpioODefecto(val(fila, 'estado_interno'));
    const retiro = fecha('fecha_retiro');

    const persona: PersonaBase = {
      fila: nFila,
      cedula,
      nombre: nombrePropio(nombreCrudo),
      cargo: limpioODefecto(val(fila, 'cargo')),
      // Un correo mal escrito no bloquea a la persona: entra sin correo y se
      // corrige a mano, que es mejor que perder la fila entera.
      correo: correoCrudo && RE_CORREO.test(correoCrudo) ? correoCrudo : null,
      correo_personal: personalCrudo && RE_CORREO.test(personalCrudo) ? personalCrudo : null,
      telefono: limpioODefecto(val(fila, 'telefono')),
      ciudad: limpioODefecto(val(fila, 'ciudad')),
      area: limpioODefecto(val(fila, 'area')),
      proyecto: limpioODefecto(val(fila, 'proyecto')),
      centro_costos: limpioODefecto(val(fila, 'centro_costos')),
      cc_sap: limpioODefecto(val(fila, 'cc_sap')),
      lider: limpioODefecto(val(fila, 'lider')),
      coordinador: limpioODefecto(val(fila, 'coordinador')),
      gerente: limpioODefecto(val(fila, 'gerente')),
      estado_interno: estado ? normNombre(estado) : null,
      termino_contrato: limpioODefecto(val(fila, 'termino_contrato'))?.toUpperCase() ?? null,
      fecha_ingreso: fecha('fecha_ingreso'),
      fecha_retiro: retiro,
      fecha_nacimiento: fecha('fecha_nacimiento'),
      // Sin columna de estatus, la fecha de retiro es la única señal de baja.
      activo: estado ? esEstatusActivo(estado) : !retiro,
      nueva: !yaEnBase.has(cedula),
    };

    // Una cédula repetida es la misma persona dos veces (reingresos, sobre todo):
    // se queda la última aparición, que es la fila más reciente del archivo.
    filasPorCedula.set(cedula, [...(filasPorCedula.get(cedula) ?? []), nFila]);
    porCedula.set(cedula, persona);
  }

  const personas = [...porCedula.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const repetidas = [...filasPorCedula.entries()]
    .filter(([, filas]) => filas.length > 1)
    .map(([cedula, filas]) => ({ cedula, nombre: porCedula.get(cedula)?.nombre ?? '', filas }));

  return {
    archivo: libro.nombreArchivo,
    hoja: libro.hoja,
    filasLeidas: libro.filas.length,
    personas,
    descartadas,
    repetidas,
    ciudades: conteo(personas.map((p) => p.ciudad)),
    estatus: conteo(personas.map((p) => p.estado_interno)),
    areas: conteo(personas.map((p) => p.area)),
    nuevas: personas.filter((p) => p.nueva).length,
    existentes: personas.filter((p) => !p.nueva).length,
    activos: personas.filter((p) => p.activo).length,
    inactivos: personas.filter((p) => !p.activo).length,
    sinCorreo: personas.filter((p) => !p.correo).length,
    fechasIlegibles,
  };
}

// ------------------------------------------------------------- resolución

/** Llave con la que se compara una ciudad del archivo contra una sede. */
export const claveCiudad = (ciudad?: string | null): string => normNombre(ciudad);

/**
 * Traduce el análisis al formato del RPC.
 *
 * `sedePorCiudad` viene de la pantalla de revisión: cada ciudad del archivo
 * apunta a una sede real. No hay sede por defecto —la revisión obliga a asignar
 * o crear una sede para cada ciudad—; una persona sin ciudad legible entra sin
 * sede (se ve como "sin sede" y no se le pueden asignar equipos hasta corregirla).
 *
 * `nombrePorSede` traduce el id de sede a su nombre, para que el campo de texto
 * `sede` guarde la sede real resuelta (la misma que `sede_id`) y no la ciudad
 * cruda del Excel, igual que cuando se crea un colaborador a mano.
 */
export function filasParaCarga(
  personas: PersonaBase[],
  sedePorCiudad: Record<string, string>,
  nombrePorSede: Record<string, string> = {},
): Record<string, unknown>[] {
  return personas.map((p) => {
    const sedeId = (p.ciudad ? sedePorCiudad[claveCiudad(p.ciudad)] : null) || null;
    return {
      cedula: p.cedula,
      nombre: p.nombre,
      cargo: p.cargo,
      correo: p.correo,
      correo_personal: p.correo_personal,
      telefono: p.telefono,
      // Solo si el archivo trae una columna de proyecto y el usuario la mapeó;
      // si no, entra vacío (no se hereda del centro de costos).
      proyecto: p.proyecto,
      lider: p.lider,
      coordinador: p.coordinador,
      gerente: p.gerente,
      sede: sedeId ? nombrePorSede[sedeId] ?? null : null,
      sede_id: sedeId,
      ciudad: p.ciudad,
      area: p.area,
      centro_costos: p.centro_costos,
      cc_sap: p.cc_sap,
      estado_interno: p.estado_interno,
      termino_contrato: p.termino_contrato,
      fecha_ingreso: p.fecha_ingreso,
      fecha_retiro: p.fecha_retiro,
      fecha_nacimiento: p.fecha_nacimiento,
      activo: p.activo,
    };
  });
}

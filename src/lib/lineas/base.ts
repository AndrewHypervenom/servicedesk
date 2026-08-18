/**
 * Lectura y análisis del libro de líneas móviles.
 *
 * El archivo de referencia es
 * "LINEAS CELULARES - SIM CORPORATIVAS POSITIVOS-2026 BUENOS.xlsx", y lo
 * primero que hay que entender de él es que NO es una tabla: son cinco hojas
 * que hablan de lo mismo desde sitios distintos y con columnas distintas.
 *
 *   · "LINEAS NUEVAS" (240)               ICCID · NUMERO · ESTADO · NOMBRE ·
 *                                         CR · PROYECTO · OBSERVACION ·
 *                                         FECHA DE CORTE · SOLICITUD CLARO
 *   · "IMEI CELULARES SAMSUNG" (15)       NUMERO · IMEI · ICCID · RESPONSABLE · CR
 *   · "Sheet1" (0)                        vacía
 *   · "Lineas que fueron suspendidas"(46) Nombre · Cedula · Linea Corpo · CR ·
 *                                         (una columna sin encabezado con notas)
 *   · "EMPAQUES NUEVOS" (50)              las nueve columnas, pero casi todas
 *                                         las filas solo traen ICCID: son SIM
 *                                         en empaque, sin número todavía
 *
 * Por eso este módulo lee el libro ENTERO y trata cada hoja como una fuente con
 * su propio mapeo. Después las fusiona: la misma línea aparece en varias hojas
 * y cada una sabe algo que las demás no —el IMEI, la cédula, el proyecto—, así
 * que la carga suma en vez de quedarse con la última que pasó.
 *
 * Lo demás que trae el archivo y que también se resuelve aquí:
 *
 *   · ICCID de 20 dígitos que Excel guardó como número y devolvió redondeados
 *     y sin el prefijo 89 ("8957101702604517056" → "57101702604517056").
 *   · IMEI metidos en la columna ICCID (15 dígitos que empiezan por 35).
 *   · el mismo estado escrito "OK", "ok" y "Ok ".
 *   · nombres con un salto de línea dentro de la celda, filas repetidas enteras
 *     y columnas de cola completamente vacías.
 *
 * Nada de esto toca la red. `analizarLibro` devuelve el informe que el usuario
 * revisa y `filasParaCarga` lo traduce a lo que espera el RPC. Nada se escribe
 * hasta el último clic.
 */

import * as XLSX from 'xlsx';
import i18n from '@/i18n';
import { limpioODefecto, normCedula, normNombre } from '@/lib/importador/normalizar';
import {
  categoriaEstado, ciudadDeStock, estadoCanonico, iccidIncompleto, iccidSospechoso, mejorIccid,
  normIccid, normImei, normNumero, pareceImei, type CategoriaLinea,
} from './estado';
import type { Colaborador, LineaMovil } from '@/types';

// --------------------------------------------------------------- campos

export type CampoLinea =
  | 'numero' | 'iccid' | 'imei' | 'estado' | 'nombre' | 'cedula' | 'cr' | 'proyecto'
  | 'observacion' | 'fecha_corte' | 'solicitud_claro';

export interface DefinicionCampo {
  id: CampoLinea;
  /** Clave i18n de la etiqueta. */
  etiqueta: string;
  /** Clave i18n de la ayuda que va bajo el desplegable. */
  ayuda: string;
  /** Encabezados reconocidos, del más específico al más genérico. */
  alias: string[];
}

/**
 * El orden es el del archivo original, que es como la gente lo tiene en la
 * cabeza. También es el orden en que se reparten las columnas: el primer campo
 * que reclama una columna se la queda. De ahí que `imei` vaya antes que
 * `iccid` y que `numero` lleve alias muy concretos ("LINEA CORPO" es el número
 * en la hoja de suspendidas).
 *
 * Ningún campo es obligatorio por sí solo: lo que exige el importador es que la
 * hoja identifique la línea de ALGUNA forma, con número o con ICCID (ver
 * `hojaImportable`). La hoja de empaques solo trae ICCID y es válida.
 */
export const CAMPOS_LINEA: DefinicionCampo[] = [
  { id: 'iccid', etiqueta: 'lines.fIccid', ayuda: 'linesImport.help.iccid',
    alias: ['ICCID', 'SERIAL SIM', 'NUMERO SIM', 'SIM', 'CHIP'] },
  { id: 'imei', etiqueta: 'lines.fImei', ayuda: 'linesImport.help.imei',
    alias: ['IMEI', 'IMEI EQUIPO', 'SERIAL EQUIPO'] },
  { id: 'numero', etiqueta: 'lines.fNumero', ayuda: 'linesImport.help.numero',
    alias: ['LINEA CORPO', 'LINEA CORPORATIVA', 'NUMERO DE LINEA', 'NUMERO LINEA',
      'NUMERO', 'LINEA', 'CELULAR', 'MOVIL', 'ABONADO', 'TELEFONO'] },
  { id: 'estado', etiqueta: 'lines.fEstado', ayuda: 'linesImport.help.estado',
    alias: ['ESTADO', 'ESTATUS', 'STATUS'] },
  { id: 'nombre', etiqueta: 'lines.fNombre', ayuda: 'linesImport.help.nombre',
    alias: ['NOMBRE', 'RESPONSABLE', 'USUARIO', 'TITULAR', 'COLABORADOR', 'EMPLEADO'] },
  { id: 'cedula', etiqueta: 'lines.fCedula', ayuda: 'linesImport.help.cedula',
    alias: ['CEDULA', 'CC', 'DOCUMENTO', 'IDENTIFICACION', 'NO DOCUMENTO'] },
  { id: 'cr', etiqueta: 'lines.fCr', ayuda: 'linesImport.help.cr',
    alias: ['CR', 'CENTRO DE RESULTADO', 'CENTRO RESULTADO', 'CENTRO DE COSTOS', 'CECO'] },
  { id: 'proyecto', etiqueta: 'lines.fProyecto', ayuda: 'linesImport.help.proyecto',
    alias: ['PROYECTO', 'CUENTA', 'CAMPANA', 'CAMPAÑA', 'CLIENTE'] },
  { id: 'observacion', etiqueta: 'lines.fObservacion', ayuda: 'linesImport.help.observacion',
    alias: ['OBSERVACION', 'OBSERVACIONES', 'NOTA', 'NOTAS', 'COMENTARIO'] },
  { id: 'fecha_corte', etiqueta: 'lines.fFechaCorte', ayuda: 'linesImport.help.fechaCorte',
    alias: ['FECHA DE CORTE', 'FECHA CORTE', 'CORTE'] },
  { id: 'solicitud_claro', etiqueta: 'lines.fSolicitud', ayuda: 'linesImport.help.solicitud',
    alias: ['SOLICITUD CLARO', 'SOLICITUD', 'TICKET', 'CASO', 'RADICADO'] },
];

/** Columna de la hoja asignada a cada campo (`null` = no se importa). */
export type MapeoLinea = Record<CampoLinea, string | null>;

export const MAPEO_VACIO: MapeoLinea = Object.fromEntries(
  CAMPOS_LINEA.map((c) => [c.id, null]),
) as MapeoLinea;

// --------------------------------------------------------------- lectura

export interface HojaLineas {
  nombre: string;
  columnas: string[];
  filas: Record<string, unknown>[];
  /** Fila de la hoja (1-based) donde estaban los encabezados. */
  filaEncabezado: number;
  /** Cuántos encabezados se reconocieron. 0 = no parece una tabla de líneas. */
  reconocidas: number;
  /** Por qué esta hoja no se puede importar, si es el caso. */
  problema?: 'vacia' | 'sinEncabezados';
}

export interface LibroLineas {
  nombreArchivo: string;
  /** true si se leyó como texto plano (CSV): los ICCID llegan intactos. */
  crudo: boolean;
  hojas: HojaLineas[];
}

const TODOS_LOS_ALIAS = CAMPOS_LINEA.flatMap((c) => c.alias).map((a) => normNombre(a));

function pareceEncabezado(celdas: unknown[]): number {
  const textos = celdas.map((c) => normNombre(c)).filter(Boolean);
  if (!textos.length) return 0;
  return textos.filter((t) => TODOS_LOS_ALIAS.some((a) => t === a || t.startsWith(a) || t.includes(a))).length;
}

export const esCsv = (nombre: string) => /\.(csv|txt)$/i.test(nombre);

/** Lee una hoja concreta; nunca lanza: los problemas se devuelven en `problema`. */
function leerHoja(ws: XLSX.WorkSheet | undefined, nombre: string, crudo: boolean): HojaLineas {
  const vacia: HojaLineas = {
    nombre, columnas: [], filas: [], filaEncabezado: 0, reconocidas: 0, problema: 'vacia',
  };
  if (!ws || !ws['!ref']) return vacia;

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, blankrows: false, defval: null, raw: crudo,
  });
  if (!matriz.length) return vacia;

  // La fila de encabezados no siempre es la primera: las hojas de trabajo
  // suelen traer un título encima o una fila en blanco.
  let idx = 0;
  let mejor = 0;
  for (let i = 0; i < Math.min(matriz.length, 15); i++) {
    const puntos = pareceEncabezado(matriz[i] ?? []);
    if (puntos > mejor) { mejor = puntos; idx = i; }
  }
  if (!mejor) {
    return { ...vacia, problema: 'sinEncabezados', filas: [], reconocidas: 0 };
  }

  // El CSV real arrastra 19 columnas vacías al final (la cola de comas) y las
  // hojas del libro también. Se recorta hasta la última columna con nombre…
  const cabecera = matriz[idx] ?? [];
  let ultima = cabecera.length;
  while (ultima > 0 && !limpioODefecto(cabecera[ultima - 1])) ultima--;

  // …salvo que debajo SÍ haya datos en una columna sin encabezado, que es el
  // caso de la hoja de suspendidas: su quinta columna no tiene título y trae
  // las notas ("reactivada para 18 Julio"). Descartarla perdería ese dato.
  const usadaAbajo = (col: number) =>
    matriz.slice(idx + 1).some((fila) => limpioODefecto((fila ?? [])[col]));
  let tope = cabecera.length;
  while (tope > ultima && !usadaAbajo(tope - 1)) tope--;

  const vistos = new Map<string, number>();
  const columnas = Array.from({ length: tope }, (_, i) => {
    const base = limpioODefecto(cabecera[i]) ?? `${i18n.t('linesImport.unnamedColumn')} ${XLSX.utils.encode_col(i)}`;
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

  return { nombre, columnas, filas, filaEncabezado: idx + 1, reconocidas: mejor };
}

/**
 * Abre el archivo y devuelve TODAS sus hojas.
 *
 * Los CSV se leen con `raw: true`, que deja cada celda como texto: sin eso, un
 * ICCID de 20 dígitos se convierte en número y pierde los últimos dígitos, y
 * dos SIM distintas acaban con el mismo identificador. En los .xlsx esa opción
 * no existe (el daño ya viene hecho desde el archivo), así que el análisis los
 * detecta y los avisa antes de guardar.
 */
export function parseArchivoDesdeBuffer(buf: ArrayBuffer, nombreArchivo: string): LibroLineas {
  const crudo = esCsv(nombreArchivo);
  const wb = XLSX.read(buf, { type: 'array', raw: crudo });
  if (!wb.SheetNames.length) throw new Error(i18n.t('linesImport.errNoSheets'));

  const hojas = wb.SheetNames.map((h) => leerHoja(wb.Sheets[h], h, crudo));
  if (hojas.every((h) => h.problema)) throw new Error(i18n.t('linesImport.errNoHeadersAny'));

  return { nombreArchivo, crudo, hojas };
}

// ----------------------------------------------------------------- mapeo

function puntuar(columna: string, campo: DefinicionCampo): number {
  const c = normNombre(columna);
  if (!c) return 0;
  for (let i = 0; i < campo.alias.length; i++) {
    const a = normNombre(campo.alias[i]);
    if (c === a) return 100 - i;
    if (c.startsWith(a) || c.endsWith(a)) return 70 - i;
    if (c.includes(a)) return 40 - i;
  }
  return 0;
}

/** Propuesta de mapeo para una hoja: cada campo se queda con su mejor columna. */
export function mapeoAutomatico(columnas: string[]): MapeoLinea {
  const mapeo = { ...MAPEO_VACIO };
  const tomadas = new Set<string>();
  for (const campo of CAMPOS_LINEA) {
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

/**
 * Una hoja se puede importar si sabe decir de qué línea habla: con el número o,
 * en su defecto, con el ICCID (las SIM en empaque no tienen número todavía).
 */
export const hojaImportable = (m: MapeoLinea): boolean => !!(m.numero || m.iccid);

/**
 * Propuesta de mapeo para todas las hojas legibles del libro.
 *
 * Además del reparto por nombre de columna, hay un rescate: si una hoja tiene
 * una columna SIN encabezado con texto debajo y todavía no se ha asignado la
 * observación, se propone para ahí. Es el caso de la hoja de suspendidas, cuya
 * quinta columna no tiene título y guarda notas como "reactivada para 18 Julio"
 * o "ASIGNACION NUEVA" — el único sitio del libro donde está esa información.
 */
export function mapeosAutomaticos(libro: LibroLineas): Record<string, MapeoLinea> {
  const out: Record<string, MapeoLinea> = {};
  const prefijoSinNombre = i18n.t('linesImport.unnamedColumn');

  for (const h of libro.hojas) {
    if (h.problema) continue;
    const m = mapeoAutomatico(h.columnas);

    if (!m.observacion) {
      const asignadas = new Set(Object.values(m).filter(Boolean) as string[]);
      const candidata = h.columnas.find((c) => (
        c.startsWith(prefijoSinNombre)
        && !asignadas.has(c)
        // Con datos de verdad: una columna sin encabezado y sin contenido es
        // solo el borde de la tabla.
        && h.filas.some((f) => limpioODefecto(f[c]))
      ));
      if (candidata) m.observacion = candidata;
    }

    out[h.nombre] = m;
  }
  return out;
}

/**
 * Qué hojas se marcan de entrada: todas las legibles cuyo mapeo identifica la
 * línea. Las demás quedan visibles pero desmarcadas, con el motivo a la vista;
 * nunca se descartan en silencio.
 */
export function hojasSugeridas(libro: LibroLineas, mapeos: Record<string, MapeoLinea>): string[] {
  return libro.hojas
    .filter((h) => !h.problema && h.filas.length > 0 && hojaImportable(mapeos[h.nombre] ?? MAPEO_VACIO))
    .map((h) => h.nombre);
}

/**
 * Estado que se le pone a las filas de una hoja que no traen columna de estado.
 *
 * El nombre de la hoja ES un dato: "Lineas que fueron suspendidas" dice que
 * todo lo que hay dentro está suspendido, y "EMPAQUES NUEVOS" que son SIM sin
 * estrenar. Sin esto, media carga entraría sin estado y los gráficos dirían
 * "Otro" donde el libro decía algo muy concreto. Es solo la propuesta: en la
 * revisión se puede cambiar o dejar en blanco.
 */
export function estadoSugeridoDeHoja(nombreHoja: string): string | null {
  const n = normNombre(nombreHoja);
  if (n.includes('SUSPEND')) return 'SUSPENDIDA';
  if (n.includes('EMPAQUE')) return 'EMPAQUE NUEVO';
  if (n.includes('CANCELAD')) return 'CANCELADA';
  if (n.includes('STOCK') || n.includes('DISPONIBLE')) return 'STOCK';
  return null;
}

// --------------------------------------------------------------- análisis

export interface LineaLeida {
  /** Identidad: el número si lo hay, "SIM:<iccid>" si es una SIM sin activar. */
  clave: string;
  numero: string | null;
  iccid: string | null;
  imei: string | null;
  estado: string | null;
  categoria: CategoriaLinea;
  nombre: string | null;
  cr: string | null;
  proyecto: string | null;
  observacion: string | null;
  fecha_corte: string | null;
  solicitud_claro: string | null;
  /**
   * Titular enlazado con la planta. Solo se rellena si esa persona existe en
   * `colaboradores`: es lo que la base admite en `cedula_asignado` (tiene llave
   * foránea) y lo que permite abrir su ficha.
   */
  cedula: string | null;
  /**
   * La cédula tal como venía en el archivo, exista o no esa persona en la
   * planta. Las líneas suspendidas son de gente que ya se fue, y su cédula
   * sigue siendo el dato que dice de quién era la línea.
   */
  cedulaArchivo: string | null;
  /** true si `cedula` salió de una cédula escrita en el archivo, no de un nombre. */
  cedulaDelArchivo: boolean;
  /** Hoja de la que salió la línea la primera vez. */
  hoja: string;
  /** Todas las hojas que aportaron algo a esta línea. */
  hojas: string[];
  /** Filas de origen, para poder señalarlas en la revisión. */
  filas: { hoja: string; fila: number }[];
  /** true si ese número/ICCID todavía no existe en la base. */
  nueva: boolean;
  /** El ICCID llegó redondeado por Excel: el dato original ya se perdió. */
  iccidDanado: boolean;
  /** El "ICCID" del archivo era en realidad un IMEI y se movió a su sitio. */
  imeiRescatado: boolean;
}

export interface FilaDescartada { hoja: string; fila: number; motivo: string; detalle: string }
export interface Conteo { nombre: string; total: number }

export interface ResumenHoja {
  hoja: string;
  filas: number;
  /** Líneas que esta hoja aporta por primera vez. */
  aporta: number;
  /** Líneas que esta hoja completa (ya venían de otra hoja). */
  completa: number;
  descartadas: number;
  /** Campos que esta hoja es la única en traer, para explicar por qué importa. */
  camposPropios: CampoLinea[];
}

export interface AnalisisLineas {
  archivo: string;
  crudo: boolean;
  hojas: ResumenHoja[];
  filasLeidas: number;
  lineas: LineaLeida[];
  descartadas: FilaDescartada[];
  /** Claves que aparecían más de una vez; se fusionaron en una sola línea. */
  fusionadas: number;
  /** Un mismo ICCID en dos líneas distintas: casi siempre error de captura. */
  iccidRepetidos: { iccid: string; claves: string[] }[];
  estados: Conteo[];
  proyectos: Conteo[];
  centros: Conteo[];
  ciudadesStock: Conteo[];
  nuevas: number;
  existentes: number;
  activas: number;
  stock: number;
  canceladas: number;
  sinNumero: number;
  sinTitular: number;
  sinIccid: number;
  conImei: number;
  iccidDanados: number;
  /** ICCID sin el prefijo 89: sirven para distinguir la SIM, no para reclamar. */
  iccidIncompletos: number;
  imeisRescatados: number;
  /** Líneas enlazadas con una persona de la planta (por cédula o por nombre). */
  cruzadas: number;
  /** De esas, las que se enlazaron por la cédula escrita en el archivo. */
  cruzadasPorCedula: number;
  /** Líneas con cédula en el archivo, esté o no esa persona en la planta. */
  conCedulaArchivo: number;
  /** Cédulas del archivo que no corresponden a nadie de la planta actual. */
  cedulasFueraDePlanta: number;
}

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
 * Índice nombre → cédula de la planta.
 *
 * Solo entran los nombres que identifican a UNA persona: si dos colaboradores
 * se llaman igual, el nombre deja de ser una identificación y la línea se queda
 * sin cédula (mejor sin titular que con el titular equivocado).
 */
export function indicePorNombre(colaboradores: Colaborador[]): Map<string, string | null> {
  const m = new Map<string, string | null>();
  for (const c of colaboradores) {
    const k = normNombre(c.nombre);
    if (!k) continue;
    m.set(k, m.has(k) ? null : c.cedula);
  }
  return m;
}

/** Rellena el hueco sin pisar lo que ya había. */
const completar = <T>(actual: T | null, nuevo: T | null): T | null => actual ?? nuevo;

export interface OpcionesAnalisis {
  /** Hojas seleccionadas, en el orden en que se fusionan (la primera manda). */
  hojas: string[];
  mapeos: Record<string, MapeoLinea>;
  /** Estado por defecto para las filas de una hoja que no traen estado. */
  estadoPorHoja?: Record<string, string | null>;
}

/**
 * Revisa las hojas seleccionadas y devuelve el informe.
 * No escribe nada: es exactamente lo que el usuario ve antes de decidir.
 */
export function analizarLibro(
  libro: LibroLineas,
  opciones: OpcionesAnalisis,
  existentes: LineaMovil[],
  colaboradores: Colaborador[] = [],
): AnalisisLineas {
  const { hojas: seleccion, mapeos, estadoPorHoja = {} } = opciones;
  const porNombre = indicePorNombre(colaboradores);
  const cedulasReales = new Set(colaboradores.map((c) => c.cedula));

  // Lo que ya está en la base, indexado por la misma identidad que usa el RPC.
  const yaEnBase = new Set(existentes.map(
    (l) => (l.numero?.trim() ? l.numero.trim() : `SIM:${l.iccid ?? ''}`),
  ));

  const acumulado = new Map<string, LineaLeida>();
  const descartadas: FilaDescartada[] = [];
  const resumen: ResumenHoja[] = [];
  let filasLeidas = 0;
  let fusionadas = 0;

  // Qué campos aporta cada hoja, para poder decir cuáles son solo suyos.
  const camposDe = (h: string): Set<CampoLinea> => {
    const m = mapeos[h] ?? MAPEO_VACIO;
    return new Set(CAMPOS_LINEA.map((c) => c.id).filter((id) => !!m[id]));
  };

  for (const nombreHoja of seleccion) {
    const hoja = libro.hojas.find((h) => h.nombre === nombreHoja);
    const mapeo = mapeos[nombreHoja];
    if (!hoja || hoja.problema || !mapeo) continue;

    const estadoDeHoja = estadoPorHoja[nombreHoja] ?? null;
    const val = (fila: Record<string, unknown>, id: CampoLinea): unknown => {
      const col = mapeo[id];
      return col ? fila[col] : null;
    };

    let aporta = 0;
    let completa = 0;
    let descartadasAqui = 0;
    filasLeidas += hoja.filas.length;

    for (const fila of hoja.filas) {
      const nFila = Number(fila.__fila ?? 0);
      const crudoNumero = val(fila, 'numero');
      const crudoIccid = val(fila, 'iccid');
      const numero = normNumero(crudoNumero);

      // La columna ICCID del libro trae a veces un IMEI (15 dígitos que
      // empiezan por 35). Se coloca en su campo en vez de guardarlo como el
      // identificador de una SIM que no es.
      const iccidCrudoTexto = limpioODefecto(crudoIccid);
      const eraImei = pareceImei(iccidCrudoTexto);
      const iccid = eraImei ? null : normIccid(crudoIccid);
      const imei = normImei(val(fila, 'imei')) ?? (eraImei ? normImei(iccidCrudoTexto) : null);

      if (!numero && !iccid) {
        const detalle = limpioODefecto(val(fila, 'nombre'))
          ?? limpioODefecto(crudoNumero)
          ?? limpioODefecto(crudoIccid)
          ?? i18n.t('linesImport.discard.emptyRow');
        descartadas.push({
          hoja: nombreHoja,
          fila: nFila,
          motivo: limpioODefecto(crudoNumero) || limpioODefecto(crudoIccid)
            ? 'linesImport.discard.badId'
            : 'linesImport.discard.noId',
          detalle,
        });
        descartadasAqui++;
        continue;
      }

      const clave = numero ?? `SIM:${iccid}`;
      const estado = estadoCanonico(val(fila, 'estado')) ?? estadoDeHoja;
      const nombre = limpioODefecto(val(fila, 'nombre'));
      // La cédula del archivo manda sobre el cruce por nombre: es un dato, no
      // una deducción. Se guarda SIEMPRE (`cedulaArchivo`), y además se usa como
      // titular verificado si esa persona sigue en la planta. Si no está —el
      // caso de las líneas suspendidas, que son de gente que ya se fue— el dato
      // no se pierde: solo se queda sin el enlace, que es lo que la llave
      // foránea de la base rechazaría.
      const cedulaArchivo = normCedula(val(fila, 'cedula'));
      const cedulaValida = cedulaArchivo && cedulasReales.has(cedulaArchivo)
        ? cedulaArchivo
        : null;
      const cedulaNombre = nombre ? (porNombre.get(normNombre(nombre)) ?? null) : null;

      const leida: LineaLeida = {
        clave,
        numero,
        iccid,
        imei,
        estado,
        categoria: categoriaEstado(estado),
        nombre,
        cr: limpioODefecto(val(fila, 'cr')),
        proyecto: limpioODefecto(val(fila, 'proyecto')),
        observacion: limpioODefecto(val(fila, 'observacion')),
        fecha_corte: limpioODefecto(val(fila, 'fecha_corte')),
        solicitud_claro: limpioODefecto(val(fila, 'solicitud_claro')),
        cedula: cedulaValida ?? cedulaNombre,
        cedulaArchivo,
        cedulaDelArchivo: !!cedulaValida,
        hoja: nombreHoja,
        hojas: [nombreHoja],
        filas: [{ hoja: nombreHoja, fila: nFila }],
        nueva: !yaEnBase.has(clave),
        iccidDanado: iccidSospechoso(crudoIccid, iccid),
        imeiRescatado: eraImei,
      };

      const previa = acumulado.get(clave);
      if (!previa) {
        acumulado.set(clave, leida);
        aporta++;
        continue;
      }

      // Fusión: cada hoja completa lo que las anteriores no sabían, sin pisar
      // nada. El ICCID es la excepción —se queda el que tiene mejor pinta— y la
      // observación se acumula, porque son notas distintas de gente distinta.
      fusionadas++;
      completa++;
      previa.numero = completar(previa.numero, leida.numero);
      previa.iccid = mejorIccid(previa.iccid, leida.iccid);
      previa.imei = completar(previa.imei, leida.imei);
      previa.estado = completar(previa.estado, leida.estado);
      previa.categoria = categoriaEstado(previa.estado);
      previa.nombre = completar(previa.nombre, leida.nombre);
      previa.cr = completar(previa.cr, leida.cr);
      previa.proyecto = completar(previa.proyecto, leida.proyecto);
      previa.fecha_corte = completar(previa.fecha_corte, leida.fecha_corte);
      previa.solicitud_claro = completar(previa.solicitud_claro, leida.solicitud_claro);
      // Las notas se acumulan porque son de gente distinta, pero no se repiten:
      // dos hojas suelen traer la misma frase con una coletilla de más, y
      // encadenarlas dejaba observaciones que se leían dos veces.
      if (leida.observacion) {
        const ya = normNombre(previa.observacion);
        const nueva = normNombre(leida.observacion);
        if (!previa.observacion) previa.observacion = leida.observacion;
        else if (!ya.includes(nueva)) {
          previa.observacion = nueva.includes(ya)
            ? leida.observacion
            : `${previa.observacion} · ${leida.observacion}`;
        }
      }
      // Una cédula del archivo desplaza a la deducida por nombre.
      previa.cedulaArchivo = completar(previa.cedulaArchivo, leida.cedulaArchivo);
      if (leida.cedulaDelArchivo && !previa.cedulaDelArchivo) {
        previa.cedula = leida.cedula;
        previa.cedulaDelArchivo = true;
      } else {
        previa.cedula = completar(previa.cedula, leida.cedula);
      }
      previa.iccidDanado = previa.iccidDanado && leida.iccidDanado;
      previa.imeiRescatado = previa.imeiRescatado || leida.imeiRescatado;
      previa.hojas.push(nombreHoja);
      previa.filas.push({ hoja: nombreHoja, fila: nFila });
    }

    // Los campos propios de la hoja: los que ninguna otra hoja seleccionada
    // trae. Es lo que explica, en una línea, por qué vale la pena cargarla.
    const otras = seleccion.filter((h) => h !== nombreHoja).map(camposDe);
    const propios = [...camposDe(nombreHoja)]
      .filter((id) => !otras.some((s) => s.has(id)));

    resumen.push({
      hoja: nombreHoja,
      filas: hoja.filas.length,
      aporta,
      completa,
      descartadas: descartadasAqui,
      camposPropios: propios,
    });
  }

  // Segunda pasada sobre los titulares deducidos por nombre.
  //
  // Durante la fusión, la cédula puede venir de una hoja y el nombre final de
  // otra: en el libro real hay líneas que cambiaron de manos y cada hoja
  // registró a una persona distinta. Una ficha que dice un nombre y apunta a la
  // cédula de otro es peor que no tener cédula, así que la deducida solo se
  // conserva si sigue casando con el nombre que quedó. La que vino escrita en
  // el archivo no se toca: eso es un dato, no una deducción.
  for (const l of acumulado.values()) {
    if (l.cedulaDelArchivo) continue;
    l.cedula = l.nombre ? (porNombre.get(normNombre(l.nombre)) ?? null) : null;
  }

  const lineas = [...acumulado.values()]
    .sort((a, b) => (a.numero ?? 'ZZ').localeCompare(b.numero ?? 'ZZ') || a.clave.localeCompare(b.clave));

  const porIccid = new Map<string, string[]>();
  for (const l of lineas) {
    if (!l.iccid) continue;
    porIccid.set(l.iccid, [...(porIccid.get(l.iccid) ?? []), l.clave]);
  }
  const iccidRepetidos = [...porIccid.entries()]
    .filter(([, c]) => c.length > 1)
    .map(([iccid, claves]) => ({ iccid, claves }));

  const cuenta = (fn: (l: LineaLeida) => boolean) => lineas.filter(fn).length;

  return {
    archivo: libro.nombreArchivo,
    crudo: libro.crudo,
    hojas: resumen,
    filasLeidas,
    lineas,
    descartadas,
    fusionadas,
    iccidRepetidos,
    estados: conteo(lineas.map((l) => l.estado)),
    proyectos: conteo(lineas.map((l) => l.proyecto)),
    centros: conteo(lineas.map((l) => l.cr)),
    ciudadesStock: conteo(lineas.map((l) => ciudadDeStock(l.estado))),
    nuevas: cuenta((l) => l.nueva),
    existentes: cuenta((l) => !l.nueva),
    activas: cuenta((l) => l.categoria === 'ACTIVA'),
    stock: cuenta((l) => l.categoria === 'STOCK'),
    canceladas: cuenta((l) => l.categoria === 'CANCELADA'),
    sinNumero: cuenta((l) => !l.numero),
    sinTitular: cuenta((l) => !l.nombre && !l.cedula && !l.cedulaArchivo),
    sinIccid: cuenta((l) => !l.iccid),
    conImei: cuenta((l) => !!l.imei),
    iccidDanados: cuenta((l) => l.iccidDanado),
    iccidIncompletos: cuenta((l) => iccidIncompleto(l.iccid)),
    imeisRescatados: cuenta((l) => l.imeiRescatado),
    cruzadas: cuenta((l) => !!l.cedula),
    cruzadasPorCedula: cuenta((l) => l.cedulaDelArchivo),
    conCedulaArchivo: cuenta((l) => !!l.cedulaArchivo),
    cedulasFueraDePlanta: cuenta((l) => !!l.cedulaArchivo && !l.cedulaDelArchivo),
  };
}

// ------------------------------------------------- enlace posterior con la planta

export interface EnlacePropuesto {
  id: string;
  cedula: string;
  /** Cómo se encontró: por la cédula del archivo o por el nombre. */
  via: 'cedula' | 'nombre';
  /** Cómo se lee la línea, para poder enseñarla antes de aplicar. */
  etiqueta: string;
  nombrePersona: string;
}

/**
 * Qué líneas ya cargadas se pueden enlazar con la planta de hoy.
 *
 * El cruce se hace durante la importación, pero depende de que la planta esté
 * cargada en ese momento: si se importan las líneas antes que a las personas,
 * ninguna queda enlazada y el archivo ya no está para repetirlo. Esta función
 * permite rehacer el cruce cuando toque, sobre lo que ya está en la base.
 *
 * Mismas reglas que en la importación: manda la cédula del archivo, y el
 * nombre solo vale si identifica a una única persona.
 */
export function proponerEnlaces(
  lineas: LineaMovil[], colaboradores: Colaborador[],
): EnlacePropuesto[] {
  if (!colaboradores.length) return [];
  const porCedula = new Map(colaboradores.map((c) => [c.cedula, c]));
  const porNombre = indicePorNombre(colaboradores);

  const out: EnlacePropuesto[] = [];
  for (const l of lineas) {
    if (l.cedula_asignado) continue; // ya enlazada; no se toca
    const etiqueta = l.numero ?? `ICCID ${l.iccid ?? ''}`;

    const porArchivo = l.cedula_archivo && porCedula.has(l.cedula_archivo)
      ? l.cedula_archivo : null;
    if (porArchivo) {
      out.push({
        id: l.id, cedula: porArchivo, via: 'cedula', etiqueta,
        nombrePersona: porCedula.get(porArchivo)!.nombre,
      });
      continue;
    }

    const porTexto = l.nombre ? porNombre.get(normNombre(l.nombre)) ?? null : null;
    if (porTexto) {
      out.push({
        id: l.id, cedula: porTexto, via: 'nombre', etiqueta,
        nombrePersona: porCedula.get(porTexto)?.nombre ?? l.nombre!,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------- resolución

/**
 * Traduce el análisis a lo que espera el RPC `importar_lineas`.
 *
 * `sedePorCiudad` viene de la pantalla de revisión: las líneas en stock dicen
 * en qué ciudad están ("STOCK MEDELLIN") y esa es la única pista de ubicación
 * del libro. `sedePorDefecto` cubre al resto. Una línea sin ninguna de las dos
 * entra sin sede: se ve igual y se corrige después desde su ficha.
 */
export function filasParaCarga(
  lineas: LineaLeida[],
  opciones: {
    sedePorCiudad?: Record<string, string>;
    sedePorDefecto?: string | null;
    /** Poner como titular real la cédula del archivo o la cruzada por nombre. */
    cruzarConPlanta?: boolean;
  } = {},
): Record<string, unknown>[] {
  const { sedePorCiudad = {}, sedePorDefecto = null, cruzarConPlanta = true } = opciones;
  return lineas.map((l) => {
    const ciudad = ciudadDeStock(l.estado);
    const sede = (ciudad ? sedePorCiudad[ciudad] : null) || sedePorDefecto || null;
    return {
      numero: l.numero,
      iccid: l.iccid,
      imei: l.imei,
      estado: l.estado,
      nombre: l.nombre,
      cr: l.cr,
      proyecto: l.proyecto,
      observacion: l.observacion,
      fecha_corte: l.fecha_corte,
      solicitud_claro: l.solicitud_claro,
      cedula_asignado: cruzarConPlanta ? l.cedula : null,
      // La cédula del archivo va siempre: es un dato del libro, no una
      // deducción, y no depende de que se quiera enlazar con la planta.
      cedula_archivo: l.cedulaArchivo,
      sede_id: sede,
      hoja_origen: l.hoja,
    };
  });
}

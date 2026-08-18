import * as XLSX from 'xlsx';
import { listColaboradores } from '@/lib/api';
import {
  esVacio, limpio, limpioODefecto, norm, normCedula, normNombre, normSerial, nombrePropio, parseFecha,
} from './normalizar';
import {
  BODEGA, CONDICIONES, ESTADOS, MARCAS_CONOCIDAS, MARCAS_QUE_SON_MODELO, TIPOS, modeloEsDudoso,
} from './catalogos';
import { HOJA_POR_ID, mapeoDeColumnas, tipoDeHoja } from './campos';
import type { HojaId } from './campos';
import { filaVacia, leerHoja } from './hoja';
import type { Fila } from './hoja';
import type {
  ColaboradorImport, ConflictoSerial, EquipoImport, Incidencia, Mapeo, MapeoHoja, ModoExtra,
  MovimientoImport, PendienteCedula, ResultadoAnalisis, ResumenHoja, Severidad,
} from './tipos';

/**
 * Identifica una fila concreta del libro. La fila sola no basta: con varias hojas
 * del mismo tipo, la fila 10 existe en todas.
 */
export const claveFila = (hoja: string, fila: number) => `${hoja}#${fila}`;

/** Lee una celda por el *campo del sistema*, resolviendo la columna a través del mapeo. */
type Lector = (fila: Fila, campoId: string) => unknown;

function hacerLector(m: MapeoHoja): Lector {
  return (fila, campoId) => {
    const columna = m.campos[campoId];
    return columna ? fila[columna] ?? null : null;
  };
}

/** Las columnas que el usuario marcó "a observaciones", ya formateadas «Columna: valor». */
function extrasDe(fila: Fila, m: MapeoHoja): string[] {
  const out: string[] = [];
  for (const [columna, modo] of Object.entries(m.extras)) {
    if (modo !== 'OBSERVACIONES') continue;
    const v = limpioODefecto(fila[columna]);
    if (v) out.push(`${columna.trim()}: ${v}`);
  }
  return out;
}

/** Las hojas del libro que el mapeo marcó como de una clase dada, en orden. */
const hojasDe = (mapeo: Mapeo, tipo: HojaId) => mapeo.filter((m) => m.tipo === tipo);

/** Lo que aportó cada hoja, para el resumen que se muestra al final. */
interface ConteoHoja {
  utiles: number;
  nota?: string;
}

/** Acumula incidencias con id incremental para poder listarlas y resaltarlas en la UI. */
class Registro {
  private n = 0;
  readonly items: Incidencia[] = [];

  add(i: Omit<Incidencia, 'id'>) {
    this.items.push({ ...i, id: `inc-${++this.n}` });
  }

  cuenta(sev: Severidad) {
    return this.items.filter((x) => x.severidad === sev).length;
  }
}

// -------------------------------------------------------------- detección de hojas

/**
 * Primera pasada: recorre **todas** las hojas del libro y propone, para cada una,
 * qué clase de hoja es y qué columna alimenta cada campo. Es solo la sugerencia de
 * arranque; el usuario la ajusta en el paso de mapeo, incluida la clase de hoja.
 */
export async function detectarHojas(file: File): Promise<Mapeo> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });

  return wb.SheetNames.map((hoja): MapeoHoja => {
    const hl = leerHoja(wb, hoja);
    const tipo = tipoDeHoja(hoja);
    const { campos, extras } = tipo
      ? mapeoDeColumnas(HOJA_POR_ID[tipo], hl.columnas)
      : { campos: {} as Record<string, string | null>, extras: {} as Record<string, ModoExtra> };

    return {
      hoja,
      tipo,
      tipoPor: 'DETECTADO',
      columnas: hl.columnas,
      muestras: hl.muestras,
      filas: hl.conDatos,
      campos,
      extras,
    };
  });
}

/** Rehace la propuesta de columnas cuando el usuario cambia la clase de una hoja. */
export function reasignarTipo(m: MapeoHoja, tipo: HojaId | null): MapeoHoja {
  if (tipo === m.tipo) return m;
  const { campos, extras } = tipo
    ? mapeoDeColumnas(HOJA_POR_ID[tipo], m.columnas)
    : { campos: {} as Record<string, string | null>, extras: {} as Record<string, ModoExtra> };
  return { ...m, tipo, tipoPor: 'USUARIO', campos, extras };
}

// ---------------------------------------------------------------- equipos (BD + CLARO)

interface FilaEquipo extends EquipoImport {
  /** Firma de los campos que importan, para detectar si dos filas se contradicen. */
  firma: string;
}

function firmaDe(e: EquipoImport): string {
  return [
    e.marca, e.linea_modelo, e.tipo, e.estado_fisico,
    e.estado_asignacion, e.propiedad, normNombre(e.usuarioNombre ?? ''),
  ].join('|');
}

/** Hoja de inventario: la principal, con toda la validación fila a fila. */
function leerBdEquipos(
  wb: XLSX.WorkBook, m: MapeoHoja, reg: Registro, leidas: FilaEquipo[],
): ConteoHoja {
  const hl = leerHoja(wb, m.hoja);
  const lee = hacerLector(m);
  let plantilla = 0;
  let utiles = 0;

  hl.filas.forEach((f, i) => {
    if (filaVacia(f)) return;

    const serial = normSerial(lee(f, 'serial'));
    if (!serial) {
      // Las filas sin serial son el resto de la plantilla: traen ESTADO=DISPONIBLE
      // y USUARIO=BODEGA/0 arrastrados hacia abajo, pero no describen ningún equipo.
      plantilla++;
      return;
    }

    const fila = hl.filaExcel(i);
    const marcaCruda = norm(lee(f, 'marca'));
    const modeloCrudo = norm(lee(f, 'modelo'));
    const tipoCrudo = norm(lee(f, 'tipo'));
    const estadoCrudo = norm(lee(f, 'estado'));
    const condCruda = norm(lee(f, 'condicion'));
    const usuarioCrudo = lee(f, 'usuario');

    // --- marca
    let marca = marcaCruda || 'SIN MARCA';
    if (MARCAS_QUE_SON_MODELO[marcaCruda]) {
      const real = MARCAS_QUE_SON_MODELO[marcaCruda];
      reg.add({
        tipo: 'MARCA_SOSPECHOSA', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'MARCA', valor: marcaCruda,
        mensaje: `«${marcaCruda}» es una línea de producto, no un fabricante.`,
        sugerencia: `Se importa como ${real}. Verifica que sea correcto.`,
      });
      marca = real;
    } else if (marcaCruda && !MARCAS_CONOCIDAS.has(marcaCruda)) {
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'MARCA', valor: marcaCruda,
        mensaje: `La marca «${marcaCruda}» no está en el catálogo de la hoja CONFIGURACIÓN.`,
        sugerencia: 'Se importa igual y se agrega al catálogo de marcas.',
      });
    } else if (!marcaCruda) {
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'MARCA', valor: '',
        mensaje: 'El equipo no tiene marca.',
        sugerencia: 'Se importa como «SIN MARCA»; complétala luego en Inventario.',
      });
    }

    // --- modelo
    let linea_modelo = modeloCrudo;
    if (!modeloCrudo) {
      linea_modelo = 'SIN MODELO';
      reg.add({
        tipo: 'MODELO_AUSENTE', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'MODELO', valor: '',
        mensaje: 'El equipo no tiene modelo.',
        sugerencia: 'Se importa como «SIN MODELO»; complétalo luego en Inventario.',
      });
    } else if (modeloEsDudoso(modeloCrudo)) {
      reg.add({
        tipo: 'MODELO_SOSPECHOSO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'MODELO', valor: modeloCrudo,
        mensaje: `«${modeloCrudo}» no parece el modelo del equipo, sino su tarjeta de red o su serial.`,
        sugerencia: 'Se importa tal cual. Revísalo contra el equipo físico.',
      });
    }

    // --- tipo
    let tipo = TIPOS[tipoCrudo];
    if (!tipo) {
      tipo = 'OTRO';
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'TIPO DE DISPOSITIVO', valor: tipoCrudo,
        mensaje: `Tipo de dispositivo no reconocido: «${tipoCrudo || 'vacío'}».`,
        sugerencia: 'Se importa como «Otro».',
      });
    }

    // --- estado de asignación
    let estado_asignacion = ESTADOS[estadoCrudo];
    if (!estado_asignacion) {
      estado_asignacion = 'DISPONIBLE';
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'ESTADO ACTUAL', valor: estadoCrudo,
        mensaje: `Estado no reconocido: «${estadoCrudo || 'vacío'}».`,
        sugerencia: 'Se importa como «Disponible».',
      });
    }

    // --- condición
    let estado_fisico = CONDICIONES[condCruda];
    if (!estado_fisico) {
      estado_fisico = 'BUENO';
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'CONDICIÓN', valor: condCruda,
        mensaje: `Condición no reconocida: «${condCruda || 'vacío'}».`,
        sugerencia: 'Se importa como «Bueno».',
      });
    }

    // --- usuario actual
    const usuarioNombre = norm(usuarioCrudo) === BODEGA || esVacio(usuarioCrudo)
      ? null
      : limpio(usuarioCrudo);

    // Un equipo entregado sin dueño, o en bodega con dueño, es una contradicción
    // de la propia hoja: el estado y la columna de usuario dicen cosas distintas.
    if (estado_asignacion === 'ASIGNADO' && !usuarioNombre) {
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'USUARIO ACTUAL', valor: norm(usuarioCrudo),
        mensaje: 'El equipo figura como ENTREGADO pero no dice a quién.',
        sugerencia: 'Se importa como «Disponible».',
      });
      estado_asignacion = 'DISPONIBLE';
    }
    if (estado_asignacion !== 'ASIGNADO' && usuarioNombre) {
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
        columna: 'USUARIO ACTUAL', valor: usuarioNombre,
        mensaje: `El equipo está «${estadoCrudo}» pero aparece a cargo de ${usuarioNombre}.`,
        sugerencia: 'Se importa como «Asignado» para no perder al responsable.',
      });
      estado_asignacion = 'ASIGNADO';
    }

    const comentario = limpioODefecto(lee(f, 'comentarios'));
    const observaciones = [comentario, ...extrasDe(f, m)].filter(Boolean).join('. ') || null;

    const equipo: FilaEquipo = {
      fila, hoja: m.hoja, serial, marca, linea_modelo, tipo, estado_fisico, estado_asignacion,
      observaciones, usuarioNombre, ubicacion: limpioODefecto(lee(f, 'ubicacion')),
      propiedad: 'EMPRESA', proveedor_propietario: null, origen: 'BD_EQUIPOS', firma: '',
    };
    equipo.firma = firmaDe(equipo);
    leidas.push(equipo);
    utiles++;
  });

  if (plantilla > 0) {
    reg.add({
      tipo: 'FILAS_PLANTILLA', severidad: 'INFO', hoja: m.hoja,
      mensaje: `${plantilla} filas sin serial se omitieron.`,
      sugerencia: 'Son filas de plantilla: arrastran «DISPONIBLE / BODEGA» pero no describen ningún equipo.',
    });
  }

  return { utiles, nota: plantilla ? `${plantilla} filas de plantilla omitidas` : undefined };
}

/** La ubicación de los equipos CLARO sale del nombre de la hoja ("… CLARO BOGOTA"). */
function ubicacionDeHojaClaro(nombre: string): string | null {
  const resto = norm(nombre)
    .split(' ')
    .filter((t) => t && t !== 'EQUIPOS' && t !== 'CLARO' && t !== 'DE')
    .join(' ');
  return resto || null;
}

/** Hoja de comodato del operador: celulares que no son de la empresa. Validación ligera. */
function leerClaro(
  wb: XLSX.WorkBook, m: MapeoHoja, reg: Registro, leidas: FilaEquipo[],
): ConteoHoja {
  const hl = leerHoja(wb, m.hoja);
  const lee = hacerLector(m);
  const ubicacion = ubicacionDeHojaClaro(m.hoja);
  let utiles = 0;

  hl.filas.forEach((f, i) => {
    if (filaVacia(f)) return;
    const serial = normSerial(lee(f, 'serial'));
    if (!serial) return;

    const fila = hl.filaExcel(i);
    const marca = norm(lee(f, 'marca')) || 'SIN MARCA';
    const estadoCrudo = norm(lee(f, 'estado'));
    // CLARO no trae responsable, así que un "ENTREGADO" no se puede sostener: queda disponible.
    let estado_asignacion = ESTADOS[estadoCrudo] ?? 'DISPONIBLE';
    if (estado_asignacion === 'ASIGNADO') estado_asignacion = 'DISPONIBLE';

    const linea = limpioODefecto(lee(f, 'linea'));
    const operacion = limpioODefecto(lee(f, 'operacion'));
    const observ = limpioODefecto(lee(f, 'observacion'));
    const observaciones = [
      linea && `Línea: ${linea}`,
      operacion && `Operación: ${operacion}`,
      observ,
      ...extrasDe(f, m),
    ].filter(Boolean).join('. ') || null;

    const equipo: FilaEquipo = {
      fila, hoja: m.hoja, serial, marca, linea_modelo: 'SIN MODELO', tipo: 'CELULAR',
      estado_fisico: 'BUENO', estado_asignacion, observaciones, usuarioNombre: null,
      ubicacion, propiedad: 'COMODATO', proveedor_propietario: 'CLARO', origen: 'CLARO', firma: '',
    };
    equipo.firma = firmaDe(equipo);
    leidas.push(equipo);
    utiles++;
  });

  if (utiles > 0) {
    reg.add({
      tipo: 'HOJA_IGNORADA', severidad: 'INFO', hoja: m.hoja,
      mensaje: `${utiles} equipos de «${m.hoja.trim()}» se importan en comodato.`,
      sugerencia: 'Quedan con propiedad COMODATO y proveedor CLARO; la línea va en observaciones.',
    });
  }

  return { utiles };
}

function analizarEquipos(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro) {
  const leidas: FilaEquipo[] = [];
  const conteos = new Map<string, ConteoHoja>();

  for (const m of hojasDe(mapeo, 'BD_EQUIPOS')) conteos.set(m.hoja, leerBdEquipos(wb, m, reg, leidas));
  for (const m of hojasDe(mapeo, 'CLARO')) conteos.set(m.hoja, leerClaro(wb, m, reg, leidas));

  // --- seriales repetidos (mira todas las hojas de equipos juntas, por si un
  // serial cae en dos: es justo el caso que hay que resolver a mano)
  const porSerial = new Map<string, FilaEquipo[]>();
  for (const e of leidas) {
    const g = porSerial.get(e.serial);
    if (g) g.push(e);
    else porSerial.set(e.serial, [e]);
  }

  const equipos: EquipoImport[] = [];
  const conflictos: ConflictoSerial[] = [];
  /** Cómo se nombra una fila en los mensajes: con hoja solo si hay más de una. */
  const variasHojas = new Set(leidas.map((e) => e.hoja)).size > 1;
  const donde = (e: FilaEquipo) => (variasHojas ? `${e.hoja.trim()} fila ${e.fila}` : `fila ${e.fila}`);

  for (const [serial, grupo] of porSerial) {
    if (grupo.length === 1) {
      equipos.push(grupo[0]);
      continue;
    }

    const distintas = new Set(grupo.map((g) => g.firma));
    if (distintas.size === 1) {
      reg.add({
        tipo: 'SERIAL_CONFLICTO', severidad: 'INFO', hoja: grupo[0].hoja, fila: grupo[0].fila,
        columna: 'SERIAL', valor: serial,
        mensaje: `El serial ${serial} está ${grupo.length} veces con los mismos datos (${grupo.map(donde).join(', ')}).`,
        sugerencia: 'Se importa una sola vez.',
      });
      equipos.push(grupo[0]);
      continue;
    }

    reg.add({
      tipo: 'SERIAL_CONFLICTO', severidad: 'BLOQUEANTE', hoja: grupo[0].hoja, fila: grupo[0].fila,
      columna: 'SERIAL', valor: serial,
      mensaje: `El serial ${serial} aparece en ${grupo.map(donde).join(' y ')} con datos que no coinciden.`,
      sugerencia: 'Elige cuál refleja la realidad; la otra se descarta.',
    });
    conflictos.push({
      serial,
      opciones: grupo.map((g) => ({
        clave: claveFila(g.hoja, g.fila),
        hoja: g.hoja,
        fila: g.fila,
        estado_asignacion: g.estado_asignacion,
        estado_fisico: g.estado_fisico,
        usuario: g.usuarioNombre,
        resumen: `${g.marca} ${g.linea_modelo}`,
      })),
    });
    equipos.push(...grupo);
  }

  return { equipos, conflictos, conteos };
}

// ------------------------------------------------------------------ ENTRADAS

/** nombre normalizado -> cédula: ENTRADAS es la única fuente de cédulas del archivo. */
type Cedulas = Map<string, { cedula: string; nombre: string }>;

function analizarEntradas(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro) {
  const movimientos: MovimientoImport[] = [];
  const cedulas: Cedulas = new Map();
  const conteos = new Map<string, ConteoHoja>();

  for (const m of hojasDe(mapeo, 'ENTRADAS')) {
    const hl = leerHoja(wb, m.hoja);
    const lee = hacerLector(m);
    let utiles = 0;
    let personas = 0;

    hl.filas.forEach((f, i) => {
      if (filaVacia(f)) return;
      const serial = normSerial(lee(f, 'serial'));
      if (!serial) return;

      const fila = hl.filaExcel(i);
      const nombre = limpioODefecto(lee(f, 'quienEntrega'));
      const cedulaCruda = lee(f, 'cedula');
      const cedula = normCedula(cedulaCruda);

      if (nombre && cedula) {
        const clave = normNombre(nombre);
        const previo = cedulas.get(clave);
        if (previo && previo.cedula !== cedula) {
          reg.add({
            tipo: 'CEDULA_INVALIDA', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
            columna: 'CEDULA', valor: String(cedulaCruda ?? ''),
            mensaje: `${nombre} aparece con dos cédulas distintas: ${previo.cedula} y ${cedula}.`,
            sugerencia: `Se usa la primera (${previo.cedula}). Verifica cuál es la correcta.`,
          });
        } else if (!previo) {
          cedulas.set(clave, { cedula, nombre: nombrePropio(nombre) });
          personas++;
        }
      } else if (nombre && !cedula && !esVacio(cedulaCruda)) {
        reg.add({
          tipo: 'CEDULA_INVALIDA', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
          columna: 'CEDULA', valor: String(cedulaCruda ?? ''),
          mensaje: `La cédula de ${nombre} («${String(cedulaCruda).trim()}») no es un número válido.`,
          sugerencia: 'El movimiento se importa sin asociar a la persona.',
        });
      }

      const { iso, invalida } = parseFecha(lee(f, 'fecha'));
      if (invalida) {
        reg.add({
          tipo: 'FECHA_INVALIDA', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
          columna: 'FECHA', valor: String(lee(f, 'fecha') ?? ''),
          mensaje: `No se pudo leer la fecha «${String(lee(f, 'fecha')).trim()}».`,
          sugerencia: 'El movimiento se registra sin fecha.',
        });
      }

      const motivo = limpioODefecto(lee(f, 'motivo'));
      const perifericos = limpioODefecto(lee(f, 'perifericos'));
      const estadoRecibir = limpioODefecto(lee(f, 'estadoRecibir'));
      const acta = limpioODefecto(lee(f, 'acta'));
      const notas = [
        motivo && `Motivo: ${motivo}`,
        perifericos && `Periféricos: ${perifericos}`,
        estadoRecibir && `Estado al recibir: ${estadoRecibir}`,
        acta && `Acta: ${acta}`,
        ...extrasDe(f, m),
      ].filter(Boolean).join('. ');

      movimientos.push({
        fila,
        hoja: m.hoja,
        tipoHoja: 'ENTRADAS',
        serial,
        tipo_movimiento: 'DEVOLUCION_COLABORADOR',
        fecha: iso,
        personaNombre: nombre,
        personaCedula: cedula,
        registrado_por: limpioODefecto(lee(f, 'recibidoPor')),
        observaciones: notas || null,
      });
      utiles++;
    });

    conteos.set(m.hoja, {
      utiles,
      nota: `${personas} ${personas === 1 ? 'persona' : 'personas'} con cédula`,
    });
  }

  return { movimientos, cedulas, conteos };
}

// ------------------------------------------------------------------- SALIDAS

function analizarSalidas(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro) {
  const movimientos: MovimientoImport[] = [];
  const conteos = new Map<string, ConteoHoja>();

  for (const m of hojasDe(mapeo, 'SALIDAS')) {
    const hl = leerHoja(wb, m.hoja);
    const lee = hacerLector(m);
    let utiles = 0;

    hl.filas.forEach((f, i) => {
      if (filaVacia(f)) return;
      const serial = normSerial(lee(f, 'serial'));
      // Las filas de relleno solo traen MODELO = "ID NO REGISTRADO" y nada más.
      if (!serial) return;

      const fila = hl.filaExcel(i);
      const { iso, invalida } = parseFecha(lee(f, 'fecha'));
      if (invalida) {
        reg.add({
          tipo: 'FECHA_INVALIDA', severidad: 'ADVERTENCIA', hoja: m.hoja, fila,
          columna: 'FECHA SALIDA', valor: String(lee(f, 'fecha') ?? ''),
          mensaje: `No se pudo leer la fecha «${String(lee(f, 'fecha')).trim()}».`,
          sugerencia: 'El movimiento se registra sin fecha.',
        });
      }

      const ticket = limpioODefecto(lee(f, 'ticket'));
      const perifericos = limpioODefecto(lee(f, 'perifericos'));
      const anotaciones = limpioODefecto(lee(f, 'anotaciones'));
      const notas = [
        ticket && `Ticket: ${ticket}`,
        perifericos && `Periféricos: ${perifericos}`,
        anotaciones,
        ...extrasDe(f, m),
      ].filter(Boolean).join('. ');

      movimientos.push({
        fila,
        hoja: m.hoja,
        tipoHoja: 'SALIDAS',
        serial,
        tipo_movimiento: 'ASIGNACION',
        fecha: iso,
        personaNombre: limpioODefecto(lee(f, 'responsable')),
        personaCedula: null, // la hoja no la trae; se resuelve por nombre
        registrado_por: null,
        observaciones: notas || null,
      });
      utiles++;
    });

    conteos.set(m.hoja, { utiles });
  }

  return { movimientos, conteos };
}

// -------------------------------------------------------------------- público

/**
 * Qué decir de una hoja que no se va a importar. La distinción importa: una hoja
 * de catálogos no aporta registros *por diseño*, pero una hoja con datos que
 * nadie reconoció es dato que se está perdiendo, y eso hay que avisarlo.
 */
function hojaSinTipo(m: MapeoHoja): { nota: string; severidad: Severidad } {
  const n = normNombre(m.hoja);
  if (n === 'CONFIGURACION') {
    return {
      nota: 'Catálogos de la hoja; se usan para validar, no se importan como registros',
      severidad: 'INFO',
    };
  }
  if (n === 'DASHBOARD') {
    return { nota: 'Solo gráficos y fórmulas, sin datos propios', severidad: 'INFO' };
  }
  if (m.filas === 0) {
    return { nota: 'Sin filas con datos para importar', severidad: 'INFO' };
  }
  if (m.tipoPor === 'USUARIO') {
    return { nota: `${m.filas} filas: la marcaste como «no importar»`, severidad: 'INFO' };
  }
  return {
    nota: `${m.filas} filas con datos que NO se importan: no se reconoció qué tipo de hoja es`,
    severidad: 'ADVERTENCIA',
  };
}

export async function analizarLibro(file: File, mapeo: Mapeo): Promise<ResultadoAnalisis> {
  const t0 = performance.now();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const reg = new Registro();

  const eq = analizarEquipos(wb, mapeo, reg);
  const ent = analizarEntradas(wb, mapeo, reg);
  const sal = analizarSalidas(wb, mapeo, reg);

  // --- colaboradores: solo salen de ENTRADAS, que es donde hay cédula
  const colaboradores: ColaboradorImport[] = [...ent.cedulas.values()].map((c) => ({
    cedula: c.cedula,
    nombre: c.nombre,
    origen: 'ENTRADAS',
  }));

  // --- movimientos huérfanos: apuntan a un serial que no está en el inventario
  const serialesConocidos = new Set(eq.equipos.map((e) => e.serial));
  const movimientos = [...ent.movimientos, ...sal.movimientos];
  const huerfanosVistos = new Set<string>();
  for (const mv of movimientos) {
    if (serialesConocidos.has(mv.serial) || huerfanosVistos.has(mv.serial)) continue;
    huerfanosVistos.add(mv.serial);
    reg.add({
      tipo: 'SERIAL_HUERFANO', severidad: 'ADVERTENCIA', hoja: mv.hoja, fila: mv.fila,
      columna: mv.tipoHoja === 'SALIDAS' ? 'ID DEL EQUIPO' : 'SERIAL', valor: mv.serial,
      mensaje: `El serial ${mv.serial} tiene movimientos pero no está en el inventario.`,
      sugerencia: 'El movimiento se omite. Registra el equipo en el inventario y vuelve a cargarlo.',
    });
  }

  // --- personas con equipo a cargo de las que no sabemos la cédula
  const pendientes = new Map<string, PendienteCedula>();
  const anotarPendiente = (nombre: string, serial: string, origen: string) => {
    const clave = normNombre(nombre);
    if (!clave || ent.cedulas.has(clave)) return;
    const p = pendientes.get(clave) ?? { nombre: nombrePropio(nombre), seriales: [], origen: [] };
    if (!p.seriales.includes(serial)) p.seriales.push(serial);
    if (!p.origen.includes(origen)) p.origen.push(origen);
    pendientes.set(clave, p);
  };

  for (const e of eq.equipos) {
    if (e.usuarioNombre) anotarPendiente(e.usuarioNombre, e.serial, e.hoja.trim());
  }
  for (const mv of sal.movimientos) {
    if (mv.personaNombre && serialesConocidos.has(mv.serial)) {
      anotarPendiente(mv.personaNombre, mv.serial, mv.hoja.trim());
    }
  }

  for (const p of pendientes.values()) {
    reg.add({
      tipo: 'CEDULA_FALTANTE', severidad: 'BLOQUEANTE', hoja: p.origen[0] ?? '',
      columna: 'USUARIO ACTUAL', valor: p.nombre,
      mensaje: `${p.nombre} tiene ${p.seriales.length} equipo(s) a cargo pero su cédula no está en el archivo.`,
      sugerencia: 'Escríbela en el panel de revisión: sin cédula no se puede crear el colaborador.',
    });
  }

  // --- ubicaciones mencionadas
  const ubicaciones = [...new Set(eq.equipos.map((e) => norm(e.ubicacion)).filter(Boolean))];

  // --- colaboradores que ya están en la base: para avisar que una cédula del
  // archivo ya es de otra persona (la importación no la sobrescribe). Si la
  // consulta falla, se sigue sin el aviso en vez de tumbar el análisis.
  const cedulasEnBase: Record<string, string> = {};
  try {
    for (const c of await listColaboradores()) {
      const n = normCedula(c.cedula);
      if (n) cedulasEnBase[n] = c.nombre;
    }
  } catch { /* sin conexión al catálogo: se omite el aviso */ }

  // --- colaboradores de ENTRADAS cuya cédula ya es de OTRA persona en la base.
  // No bloquea (la cédula viene del archivo y no hay dónde corregirla en la
  // revisión), pero se avisa: la importación conserva el registro actual, así que
  // el equipo quedaría a nombre de quien ya tiene esa cédula. Sirve para cazar
  // errores de digitación en el Excel antes de importar.
  for (const c of colaboradores) {
    const n = normCedula(c.cedula);
    const duenoEnBase = n ? cedulasEnBase[n] : undefined;
    if (duenoEnBase && normNombre(duenoEnBase) !== normNombre(c.nombre)) {
      reg.add({
        tipo: 'CEDULA_EXISTENTE', severidad: 'ADVERTENCIA', hoja: 'ENTRADAS',
        columna: 'CEDULA', valor: c.cedula,
        mensaje: `La cédula ${c.cedula} (${c.nombre} en el archivo) ya está en el sistema a nombre de ${duenoEnBase}.`,
        sugerencia: 'La importación no sobrescribe el registro actual. Verifica que la cédula del archivo sea la correcta.',
      });
    }
  }

  // --- resumen: una línea por hoja del libro, en el orden de las pestañas
  const conteos = new Map<string, ConteoHoja>([...eq.conteos, ...ent.conteos, ...sal.conteos]);
  const hojas: ResumenHoja[] = mapeo.map((m) => {
    if (!m.tipo) {
      const { nota, severidad } = hojaSinTipo(m);
      reg.add({
        tipo: 'HOJA_IGNORADA', severidad, hoja: m.hoja,
        mensaje: severidad === 'ADVERTENCIA'
          ? `La hoja «${m.hoja.trim()}» tiene ${m.filas} filas con datos y no se va a importar.`
          : `La hoja «${m.hoja.trim()}» no aporta registros al inventario.`,
        sugerencia: severidad === 'ADVERTENCIA'
          ? 'Vuelve al paso de mapeo y dile qué tipo de hoja es, o confirma que no debe importarse.'
          : nota,
      });
      return {
        nombre: m.hoja, filasLeidas: m.filas, filasUtiles: 0,
        destino: '—', ignorada: true, nota,
      };
    }

    const c = conteos.get(m.hoja);
    const utiles = c?.utiles ?? 0;
    return {
      nombre: m.hoja,
      filasLeidas: m.filas,
      filasUtiles: utiles,
      destino: HOJA_POR_ID[m.tipo].destino,
      ignorada: false,
      nota: utiles === 0 && m.filas > 0
        ? 'Ninguna fila trae serial: no aporta registros'
        : c?.nota,
    };
  });

  return {
    archivo: file.name,
    hojas,
    equipos: eq.equipos,
    colaboradores,
    movimientos,
    incidencias: reg.items,
    pendientesCedula: [...pendientes.values()],
    conflictos: eq.conflictos,
    ubicaciones,
    cedulasEnBase,
    duracionMs: Math.round(performance.now() - t0),
  };
}

/** ¿Esta fila de equipo gana, o es la versión descartada de un serial en conflicto? */
export function filaElegida(e: EquipoImport, conflictos: Record<string, string>): boolean {
  const elegida = conflictos[e.serial];
  return elegida === undefined || elegida === claveFila(e.hoja, e.fila);
}

/** Índice nombre normalizado -> cédula, mezclando el archivo y lo que escribió el usuario. */
export function indiceCedulas(
  r: ResultadoAnalisis,
  resueltas: Record<string, string>,
): Map<string, string> {
  const idx = new Map<string, string>();
  for (const c of r.colaboradores) idx.set(normNombre(c.nombre), c.cedula);
  for (const [nombre, cedula] of Object.entries(resueltas)) {
    const n = normCedula(cedula);
    if (n) idx.set(normNombre(nombre), n);
  }
  return idx;
}

/** Cómo quedó la cédula que el usuario escribió para una persona pendiente. */
export type EstadoCedula = 'vacia' | 'invalida' | 'duplicada' | 'existente' | 'ok';

/**
 * Valida las cédulas que el usuario escribió en la revisión.
 *
 * La cédula es la llave del colaborador: si dos personas comparten cédula, se colapsan
 * en un solo registro y los equipos terminan a nombre de quien no es. Por eso una cédula
 * repetida —entre las que se escribieron, o contra las que ya trae ENTRADAS— se marca
 * como `duplicada` y no deja continuar.
 *
 * Además, si la cédula ya pertenece a OTRA persona en la base (nombre distinto), se
 * marca como `existente` y tampoco deja continuar: la importación conservaría el
 * registro actual, así que escribir esa cédula aquí dejaría el equipo a nombre de
 * quien no es. Si coincide con el mismo nombre, es la misma persona y pasa como `ok`.
 */
export function estadoCedulas(
  r: ResultadoAnalisis,
  resueltas: Record<string, string>,
): { porNombre: Record<string, EstadoCedula>; listas: number } {
  // Cuántas veces se usa cada cédula: primero las que ya vienen del archivo (ENTRADAS).
  const uso = new Map<string, number>();
  for (const c of r.colaboradores) uso.set(c.cedula, (uso.get(c.cedula) ?? 0) + 1);

  const normadas = new Map<string, string | null>();
  for (const p of r.pendientesCedula) {
    const n = normCedula(resueltas[p.nombre] ?? '');
    normadas.set(p.nombre, n);
    if (n) uso.set(n, (uso.get(n) ?? 0) + 1);
  }

  const porNombre: Record<string, EstadoCedula> = {};
  let listas = 0;
  for (const p of r.pendientesCedula) {
    const escrito = (resueltas[p.nombre] ?? '').trim();
    const n = normadas.get(p.nombre) ?? null;
    const duenoEnBase = n ? r.cedulasEnBase[n] : undefined;
    if (!escrito) porNombre[p.nombre] = 'vacia';
    else if (!n) porNombre[p.nombre] = 'invalida';
    else if ((uso.get(n) ?? 0) > 1) porNombre[p.nombre] = 'duplicada';
    else if (duenoEnBase && normNombre(duenoEnBase) !== normNombre(p.nombre)) {
      porNombre[p.nombre] = 'existente';
    }
    else { porNombre[p.nombre] = 'ok'; listas++; }
  }
  return { porNombre, listas };
}

/** El nombre del colaborador que ya tiene esa cédula en la base, si lo hay. */
export function duenoDeCedula(r: ResultadoAnalisis, cedula: string): string | undefined {
  const n = normCedula(cedula);
  return n ? r.cedulasEnBase[n] : undefined;
}

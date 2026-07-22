import * as XLSX from 'xlsx';
import {
  esVacio, limpio, limpioODefecto, norm, normCedula, normNombre, normSerial, nombrePropio, parseFecha,
} from './normalizar';
import {
  BODEGA, CONDICIONES, ESTADOS, MARCAS_CONOCIDAS, MARCAS_QUE_SON_MODELO, TIPOS, modeloEsDudoso,
} from './catalogos';
import {
  HOJAS, campoParaColumna, nombreRealDeHoja,
} from './campos';
import type {
  ColaboradorImport, ConflictoSerial, EquipoImport, Incidencia, Mapeo, MapeoHoja, ModoExtra,
  MovimientoImport, PendienteCedula, ResultadoAnalisis, ResumenHoja, Severidad,
} from './tipos';

type Fila = Record<string, unknown>;

/** El encabezado ocupa la fila 1, así que el índice 0 del JSON es la fila 2 del Excel. */
const filaExcel = (i: number) => i + 2;

/** Lee una celda por el *campo del sistema*, resolviendo la columna a través del mapeo. */
type Lector = (fila: Fila, campoId: string) => unknown;

function hacerLector(m: MapeoHoja | undefined): Lector {
  return (fila, campoId) => {
    const columna = m?.campos[campoId];
    return columna ? fila[columna] ?? null : null;
  };
}

/** Las columnas que el usuario marcó "a observaciones", ya formateadas «Columna: valor». */
function extrasDe(fila: Fila, m: MapeoHoja | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  for (const [columna, modo] of Object.entries(m.extras)) {
    if (modo !== 'OBSERVACIONES') continue;
    const v = limpioODefecto(fila[columna]);
    if (v) out.push(`${columna.trim()}: ${v}`);
  }
  return out;
}

/** Filas de una hoja según el nombre real que guardó el mapeo. */
function filasDe(wb: XLSX.WorkBook, m: MapeoHoja | undefined): Fila[] {
  if (!m || !wb.Sheets[m.hoja]) return [];
  return XLSX.utils.sheet_to_json<Fila>(wb.Sheets[m.hoja], { defval: null, raw: false });
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
 * Primera pasada: mira el libro y propone, hoja por hoja, qué columna alimenta cada
 * campo. Es solo la sugerencia de arranque; el usuario la ajusta en el paso de mapeo.
 */
export async function detectarHojas(file: File): Promise<Mapeo> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const mapeo: Mapeo = {};

  for (const def of HOJAS) {
    const hoja = nombreRealDeHoja(def, wb.SheetNames);
    if (!hoja) continue;

    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], {
      header: 1, defval: null, raw: false,
    });
    const encab = (matriz[0] ?? []) as unknown[];

    // La columna se guarda *verbatim* (con sus espacios) porque ese es exactamente el
    // nombre con el que XLSX indexa las filas; se recorta solo al mostrarla.
    const colConIdx: { nombre: string; idx: number }[] = [];
    encab.forEach((c, idx) => {
      const nombre = c == null ? '' : String(c);
      if (nombre.trim() && !colConIdx.some((x) => x.nombre === nombre)) {
        colConIdx.push({ nombre, idx });
      }
    });
    const columnas = colConIdx.map((x) => x.nombre);

    const cuerpo = matriz.slice(1) as unknown[][];
    const filas = cuerpo.filter((r) => r.some((c) => c != null && String(c).trim() !== '')).length;

    const muestras: Record<string, string[]> = {};
    for (const { nombre, idx } of colConIdx) {
      const vals: string[] = [];
      for (const r of cuerpo) {
        const s = r[idx] == null ? '' : String(r[idx]).trim();
        if (s) { vals.push(s); if (vals.length >= 3) break; }
      }
      muestras[nombre] = vals;
    }

    const campos: Record<string, string | null> = {};
    for (const c of def.campos) campos[c.id] = null;
    const extras: Record<string, ModoExtra> = {};
    for (const col of columnas) {
      const campoId = campoParaColumna(def, col);
      if (campoId && campos[campoId] == null) campos[campoId] = col;
      else extras[col] = 'IGNORAR';
    }

    mapeo[def.id] = { hoja, columnas, muestras, filas, campos, extras };
  }

  return mapeo;
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

/** BD_EQUIPOS: la hoja principal, con toda la validación fila a fila. */
function leerBdEquipos(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro, leidas: FilaEquipo[]) {
  const m = mapeo.BD_EQUIPOS;
  const filas = filasDe(wb, m);
  const lee = hacerLector(m);
  let plantilla = 0;
  let utiles = 0;

  filas.forEach((f, i) => {
    const serial = normSerial(lee(f, 'serial'));
    if (!serial) {
      // Las filas sin serial son el resto de la plantilla: traen ESTADO=DISPONIBLE
      // y USUARIO=BODEGA/0 arrastrados hacia abajo, pero no describen ningún equipo.
      plantilla++;
      return;
    }

    const fila = filaExcel(i);
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
        tipo: 'MARCA_SOSPECHOSA', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
        columna: 'MARCA', valor: marcaCruda,
        mensaje: `«${marcaCruda}» es una línea de producto, no un fabricante.`,
        sugerencia: `Se importa como ${real}. Verifica que sea correcto.`,
      });
      marca = real;
    } else if (marcaCruda && !MARCAS_CONOCIDAS.has(marcaCruda)) {
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
        columna: 'MARCA', valor: marcaCruda,
        mensaje: `La marca «${marcaCruda}» no está en el catálogo de la hoja CONFIGURACIÓN.`,
        sugerencia: 'Se importa igual y se agrega al catálogo de marcas.',
      });
    } else if (!marcaCruda) {
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
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
        tipo: 'MODELO_AUSENTE', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
        columna: 'MODELO', valor: '',
        mensaje: 'El equipo no tiene modelo.',
        sugerencia: 'Se importa como «SIN MODELO»; complétalo luego en Inventario.',
      });
    } else if (modeloEsDudoso(modeloCrudo)) {
      reg.add({
        tipo: 'MODELO_SOSPECHOSO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
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
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
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
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
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
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
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
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
        columna: 'USUARIO ACTUAL', valor: norm(usuarioCrudo),
        mensaje: 'El equipo figura como ENTREGADO pero no dice a quién.',
        sugerencia: 'Se importa como «Disponible».',
      });
      estado_asignacion = 'DISPONIBLE';
    }
    if (estado_asignacion !== 'ASIGNADO' && usuarioNombre) {
      reg.add({
        tipo: 'VALOR_NO_CATALOGADO', severidad: 'ADVERTENCIA', hoja: 'BD_EQUIPOS', fila,
        columna: 'USUARIO ACTUAL', valor: usuarioNombre,
        mensaje: `El equipo está «${estadoCrudo}» pero aparece a cargo de ${usuarioNombre}.`,
        sugerencia: 'Se importa como «Asignado» para no perder al responsable.',
      });
      estado_asignacion = 'ASIGNADO';
    }

    const comentario = limpioODefecto(lee(f, 'comentarios'));
    const observaciones = [comentario, ...extrasDe(f, m)].filter(Boolean).join('. ') || null;

    const equipo: FilaEquipo = {
      fila, serial, marca, linea_modelo, tipo, estado_fisico, estado_asignacion,
      observaciones, usuarioNombre, ubicacion: limpioODefecto(lee(f, 'ubicacion')),
      propiedad: 'EMPRESA', proveedor_propietario: null, origen: 'BD_EQUIPOS', firma: '',
    };
    equipo.firma = firmaDe(equipo);
    leidas.push(equipo);
    utiles++;
  });

  if (plantilla > 0) {
    reg.add({
      tipo: 'FILAS_PLANTILLA', severidad: 'INFO', hoja: 'BD_EQUIPOS',
      mensaje: `${plantilla} filas sin serial se omitieron.`,
      sugerencia: 'Son filas de plantilla: arrastran «DISPONIBLE / BODEGA» pero no describen ningún equipo.',
    });
  }

  return { filasLeidas: filas.length, utiles, plantilla };
}

/** La ubicación de los equipos CLARO sale del nombre de la hoja ("… CLARO BOGOTA"). */
function ubicacionDeHojaClaro(nombre: string): string | null {
  const resto = norm(nombre)
    .split(' ')
    .filter((t) => t && t !== 'EQUIPOS' && t !== 'CLARO' && t !== 'DE')
    .join(' ');
  return resto || null;
}

/** EQUIPOS CLARO …: celulares en comodato del operador. Validación ligera. */
function leerClaro(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro, leidas: FilaEquipo[]) {
  const m = mapeo.CLARO;
  const filas = filasDe(wb, m);
  const lee = hacerLector(m);
  const ubicacion = m ? ubicacionDeHojaClaro(m.hoja) : null;
  let utiles = 0;

  filas.forEach((f, i) => {
    const serial = normSerial(lee(f, 'serial'));
    if (!serial) return;

    const fila = filaExcel(i);
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
      fila, serial, marca, linea_modelo: 'SIN MODELO', tipo: 'CELULAR',
      estado_fisico: 'BUENO', estado_asignacion, observaciones, usuarioNombre: null,
      ubicacion, propiedad: 'COMODATO', proveedor_propietario: 'CLARO', origen: 'CLARO', firma: '',
    };
    equipo.firma = firmaDe(equipo);
    leidas.push(equipo);
    utiles++;
  });

  if (utiles > 0) {
    reg.add({
      tipo: 'HOJA_IGNORADA', severidad: 'INFO', hoja: m?.hoja ?? 'CLARO',
      mensaje: `${utiles} equipos CLARO se importan en comodato.`,
      sugerencia: 'Quedan con propiedad COMODATO y proveedor CLARO; la línea va en observaciones.',
    });
  }

  return { filasLeidas: filas.length, utiles };
}

function analizarEquipos(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro) {
  const leidas: FilaEquipo[] = [];
  const bd = leerBdEquipos(wb, mapeo, reg, leidas);
  const claro = leerClaro(wb, mapeo, reg, leidas);

  // --- seriales repetidos (mira BD y CLARO juntos, por si un serial cae en ambos)
  const porSerial = new Map<string, FilaEquipo[]>();
  for (const e of leidas) {
    const g = porSerial.get(e.serial);
    if (g) g.push(e);
    else porSerial.set(e.serial, [e]);
  }

  const equipos: EquipoImport[] = [];
  const conflictos: ConflictoSerial[] = [];

  for (const [serial, grupo] of porSerial) {
    if (grupo.length === 1) {
      equipos.push(grupo[0]);
      continue;
    }

    const distintas = new Set(grupo.map((g) => g.firma));
    if (distintas.size === 1) {
      reg.add({
        tipo: 'SERIAL_CONFLICTO', severidad: 'INFO', hoja: 'BD_EQUIPOS', fila: grupo[0].fila,
        columna: 'SERIAL', valor: serial,
        mensaje: `El serial ${serial} está ${grupo.length} veces con los mismos datos (filas ${grupo.map((g) => g.fila).join(', ')}).`,
        sugerencia: 'Se importa una sola vez.',
      });
      equipos.push(grupo[0]);
      continue;
    }

    reg.add({
      tipo: 'SERIAL_CONFLICTO', severidad: 'BLOQUEANTE', hoja: 'BD_EQUIPOS', fila: grupo[0].fila,
      columna: 'SERIAL', valor: serial,
      mensaje: `El serial ${serial} aparece en las filas ${grupo.map((g) => g.fila).join(' y ')} con datos que no coinciden.`,
      sugerencia: 'Elige cuál refleja la realidad; la otra se descarta.',
    });
    conflictos.push({
      serial,
      opciones: grupo.map((g) => ({
        fila: g.fila,
        estado_asignacion: g.estado_asignacion,
        estado_fisico: g.estado_fisico,
        usuario: g.usuarioNombre,
        resumen: `${g.marca} ${g.linea_modelo}`,
      })),
    });
    equipos.push(...grupo);
  }

  return { equipos, conflictos, bd, claro };
}

// ------------------------------------------------------------------ ENTRADAS

function analizarEntradas(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro) {
  const m = mapeo.ENTRADAS;
  const filas = filasDe(wb, m);
  const lee = hacerLector(m);
  const movimientos: MovimientoImport[] = [];
  /** nombre normalizado -> cédula, la única fuente de cédulas del archivo. */
  const cedulas = new Map<string, { cedula: string; nombre: string }>();

  filas.forEach((f, i) => {
    const serial = normSerial(lee(f, 'serial'));
    if (!serial) return;

    const fila = filaExcel(i);
    const nombre = limpioODefecto(lee(f, 'quienEntrega'));
    const cedulaCruda = lee(f, 'cedula');
    const cedula = normCedula(cedulaCruda);

    if (nombre && cedula) {
      const clave = normNombre(nombre);
      const previo = cedulas.get(clave);
      if (previo && previo.cedula !== cedula) {
        reg.add({
          tipo: 'CEDULA_INVALIDA', severidad: 'ADVERTENCIA', hoja: 'ENTRADAS', fila,
          columna: 'CEDULA', valor: String(cedulaCruda ?? ''),
          mensaje: `${nombre} aparece con dos cédulas distintas: ${previo.cedula} y ${cedula}.`,
          sugerencia: `Se usa la primera (${previo.cedula}). Verifica cuál es la correcta.`,
        });
      } else if (!previo) {
        cedulas.set(clave, { cedula, nombre: nombrePropio(nombre) });
      }
    } else if (nombre && !cedula && !esVacio(cedulaCruda)) {
      reg.add({
        tipo: 'CEDULA_INVALIDA', severidad: 'ADVERTENCIA', hoja: 'ENTRADAS', fila,
        columna: 'CEDULA', valor: String(cedulaCruda ?? ''),
        mensaje: `La cédula de ${nombre} («${String(cedulaCruda).trim()}») no es un número válido.`,
        sugerencia: 'El movimiento se importa sin asociar a la persona.',
      });
    }

    const { iso, invalida } = parseFecha(lee(f, 'fecha'));
    if (invalida) {
      reg.add({
        tipo: 'FECHA_INVALIDA', severidad: 'ADVERTENCIA', hoja: 'ENTRADAS', fila,
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
      hoja: 'ENTRADAS',
      serial,
      tipo_movimiento: 'DEVOLUCION_COLABORADOR',
      fecha: iso,
      personaNombre: nombre,
      personaCedula: cedula,
      registrado_por: limpioODefecto(lee(f, 'recibidoPor')),
      observaciones: notas || null,
    });
  });

  return { movimientos, cedulas, filasLeidas: filas.length };
}

// ------------------------------------------------------------------- SALIDAS

function analizarSalidas(wb: XLSX.WorkBook, mapeo: Mapeo, reg: Registro) {
  const m = mapeo.SALIDAS;
  const filas = filasDe(wb, m);
  const lee = hacerLector(m);
  const movimientos: MovimientoImport[] = [];

  filas.forEach((f, i) => {
    const serial = normSerial(lee(f, 'serial'));
    // Las filas de relleno solo traen MODELO = "ID NO REGISTRADO" y nada más.
    if (!serial) return;

    const fila = filaExcel(i);
    const { iso, invalida } = parseFecha(lee(f, 'fecha'));
    if (invalida) {
      reg.add({
        tipo: 'FECHA_INVALIDA', severidad: 'ADVERTENCIA', hoja: 'SALIDAS', fila,
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
      hoja: 'SALIDAS',
      serial,
      tipo_movimiento: 'ASIGNACION',
      fecha: iso,
      personaNombre: limpioODefecto(lee(f, 'responsable')),
      personaCedula: null, // la hoja no la trae; se resuelve por nombre
      registrado_por: null,
      observaciones: notas || null,
    });
  });

  return { movimientos, filasLeidas: filas.length };
}

// -------------------------------------------------------------------- público

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
      columna: mv.hoja === 'SALIDAS' ? 'ID DEL EQUIPO' : 'SERIAL', valor: mv.serial,
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
    if (e.usuarioNombre) anotarPendiente(e.usuarioNombre, e.serial, 'BD_EQUIPOS');
  }
  for (const mv of sal.movimientos) {
    if (mv.personaNombre && serialesConocidos.has(mv.serial)) {
      anotarPendiente(mv.personaNombre, mv.serial, 'SALIDAS');
    }
  }

  for (const p of pendientes.values()) {
    reg.add({
      tipo: 'CEDULA_FALTANTE', severidad: 'BLOQUEANTE', hoja: 'BD_EQUIPOS',
      columna: 'USUARIO ACTUAL', valor: p.nombre,
      mensaje: `${p.nombre} tiene ${p.seriales.length} equipo(s) a cargo pero su cédula no está en el archivo.`,
      sugerencia: 'Escríbela en el panel de revisión: sin cédula no se puede crear el colaborador.',
    });
  }

  // --- ubicaciones mencionadas
  const ubicaciones = [...new Set(eq.equipos.map((e) => norm(e.ubicacion)).filter(Boolean))];

  // --- resumen de hojas: las conocidas con datos, y el resto marcadas como ignoradas
  const hojas: ResumenHoja[] = [];
  const nombresManejados = new Set<string>();
  const agregarResumen = (m: MapeoHoja | undefined, filasUtiles: number, destino: string, nota?: string) => {
    if (!m) return;
    nombresManejados.add(norm(m.hoja));
    hojas.push({ nombre: m.hoja, filasLeidas: m.filas, filasUtiles, destino, ignorada: false, nota });
  };

  agregarResumen(mapeo.BD_EQUIPOS, eq.bd.utiles, 'Inventario de equipos',
    eq.bd.plantilla ? `${eq.bd.plantilla} filas de plantilla omitidas` : undefined);
  agregarResumen(mapeo.ENTRADAS, ent.movimientos.length, 'Devoluciones + colaboradores',
    `${colaboradores.length} personas con cédula`);
  agregarResumen(mapeo.SALIDAS, sal.movimientos.length, 'Asignaciones');
  if (eq.claro.utiles > 0) {
    agregarResumen(mapeo.CLARO, eq.claro.utiles, 'Inventario · comodato CLARO');
  }

  for (const nombre of wb.SheetNames) {
    if (nombresManejados.has(norm(nombre))) continue;
    const filas = XLSX.utils.sheet_to_json<Fila>(wb.Sheets[nombre], { defval: null, raw: false });
    const nota = normNombre(nombre) === 'CONFIGURACION'
      ? 'Catálogos de la hoja; se usan para validar, no se importan como registros'
      : normNombre(nombre) === 'DASHBOARD'
        ? 'Solo gráficos y fórmulas, sin datos propios'
        : 'Sin filas con datos para importar';
    hojas.push({
      nombre, filasLeidas: filas.length, filasUtiles: 0,
      destino: '—', ignorada: true, nota,
    });
    reg.add({
      tipo: 'HOJA_IGNORADA', severidad: 'INFO', hoja: nombre,
      mensaje: `La hoja «${nombre}» no aporta registros al inventario.`,
      sugerencia: nota,
    });
  }

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
    duracionMs: Math.round(performance.now() - t0),
  };
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
export type EstadoCedula = 'vacia' | 'invalida' | 'duplicada' | 'ok';

/**
 * Valida las cédulas que el usuario escribió en la revisión.
 *
 * La cédula es la llave del colaborador: si dos personas comparten cédula, se colapsan
 * en un solo registro y los equipos terminan a nombre de quien no es. Por eso una cédula
 * repetida —entre las que se escribieron, o contra las que ya trae ENTRADAS— se marca
 * como `duplicada` y no deja continuar.
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
    if (!escrito) porNombre[p.nombre] = 'vacia';
    else if (!n) porNombre[p.nombre] = 'invalida';
    else if ((uso.get(n) ?? 0) > 1) porNombre[p.nombre] = 'duplicada';
    else { porNombre[p.nombre] = 'ok'; listas++; }
  }
  return { porNombre, listas };
}

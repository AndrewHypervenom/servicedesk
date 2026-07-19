import * as XLSX from 'xlsx';
import {
  esVacio, limpio, limpioODefecto, norm, normCedula, normNombre, normSerial, nombrePropio, parseFecha,
} from './normalizar';
import {
  BODEGA, CONDICIONES, ESTADOS, MARCAS_CONOCIDAS, MARCAS_QUE_SON_MODELO, TIPOS, modeloEsDudoso,
} from './catalogos';
import type {
  ColaboradorImport, ConflictoSerial, EquipoImport, Incidencia, MovimientoImport,
  PendienteCedula, ResultadoAnalisis, ResumenHoja, Severidad, TipoIncidencia,
} from './tipos';

type Fila = Record<string, unknown>;

/** El encabezado ocupa la fila 1, así que el índice 0 del JSON es la fila 2 del Excel. */
const filaExcel = (i: number) => i + 2;

/** Busca la hoja sin depender de tildes ni mayúsculas del nombre. */
function buscarHoja(wb: XLSX.WorkBook, nombre: string): string | null {
  const objetivo = normNombre(nombre);
  return wb.SheetNames.find((n) => normNombre(n) === objetivo) ?? null;
}

function leerHoja(wb: XLSX.WorkBook, nombre: string): Fila[] {
  const real = buscarHoja(wb, nombre);
  if (!real) return [];
  return XLSX.utils.sheet_to_json<Fila>(wb.Sheets[real], { defval: null, raw: false });
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

/** Toma la columna sin sufrir por espacios o tildes del encabezado. */
function col(fila: Fila, ...alias: string[]): unknown {
  for (const a of alias) {
    if (a in fila) return fila[a];
  }
  const objetivo = alias.map(normNombre);
  for (const k of Object.keys(fila)) {
    if (objetivo.includes(normNombre(k))) return fila[k];
  }
  return null;
}

// ---------------------------------------------------------------- BD_EQUIPOS

interface FilaEquipo extends EquipoImport {
  /** Firma de los campos que importan, para detectar si dos filas se contradicen. */
  firma: string;
}

function analizarEquipos(wb: XLSX.WorkBook, reg: Registro) {
  const filas = leerHoja(wb, 'BD_EQUIPOS');
  const leidas: FilaEquipo[] = [];
  let plantilla = 0;

  filas.forEach((f, i) => {
    const serial = normSerial(col(f, 'SERIAL'));
    if (!serial) {
      // Las filas sin serial son el resto de la plantilla: traen ESTADO=DISPONIBLE
      // y USUARIO=BODEGA/0 arrastrados hacia abajo, pero no describen ningún equipo.
      plantilla++;
      return;
    }

    const fila = filaExcel(i);
    const marcaCruda = norm(col(f, 'MARCA'));
    const modeloCrudo = norm(col(f, 'MODELO'));
    const tipoCrudo = norm(col(f, 'TIPO DE DISPOSITIVO'));
    const estadoCrudo = norm(col(f, 'ESTADO ACTUAL'));
    const condCruda = norm(col(f, 'CONDICIÓN', 'CONDICION'));
    const usuarioCrudo = col(f, 'USUARIO ACTUAL');

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

    const equipo: FilaEquipo = {
      fila,
      serial,
      marca,
      linea_modelo,
      tipo,
      estado_fisico,
      estado_asignacion,
      observaciones: limpioODefecto(col(f, 'COMENTARIOS TÉCNICOS', 'COMENTARIOS TECNICOS')),
      usuarioNombre,
      ubicacion: limpioODefecto(col(f, 'UBICACIÓN', 'UBICACION')),
      firma: '',
    };
    equipo.firma = [
      equipo.marca, equipo.linea_modelo, equipo.tipo, equipo.estado_fisico,
      equipo.estado_asignacion, normNombre(equipo.usuarioNombre ?? ''),
    ].join('|');

    leidas.push(equipo);
  });

  if (plantilla > 0) {
    reg.add({
      tipo: 'FILAS_PLANTILLA', severidad: 'INFO', hoja: 'BD_EQUIPOS',
      mensaje: `${plantilla} filas sin serial se omitieron.`,
      sugerencia: 'Son filas de plantilla: arrastran «DISPONIBLE / BODEGA» pero no describen ningún equipo.',
    });
  }

  // --- seriales repetidos
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
      // Misma información repetida: no hay nada que decidir.
      reg.add({
        tipo: 'SERIAL_CONFLICTO', severidad: 'INFO', hoja: 'BD_EQUIPOS', fila: grupo[0].fila,
        columna: 'SERIAL', valor: serial,
        mensaje: `El serial ${serial} está ${grupo.length} veces con los mismos datos (filas ${grupo.map((g) => g.fila).join(', ')}).`,
        sugerencia: 'Se importa una sola vez.',
      });
      equipos.push(grupo[0]);
      continue;
    }

    // Las filas se contradicen y el serial es único en la base: hay que elegir.
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
    // Se guardan todas; `aplicar` se queda con la fila que el usuario elija.
    equipos.push(...grupo);
  }

  return { equipos, conflictos, filasLeidas: filas.length, plantilla };
}

// ------------------------------------------------------------------ ENTRADAS

function analizarEntradas(wb: XLSX.WorkBook, reg: Registro) {
  const filas = leerHoja(wb, 'ENTRADAS');
  const movimientos: MovimientoImport[] = [];
  /** nombre normalizado -> cédula, la única fuente de cédulas del archivo. */
  const cedulas = new Map<string, { cedula: string; nombre: string }>();

  filas.forEach((f, i) => {
    const serial = normSerial(col(f, 'SERIAL'));
    if (!serial) return;

    const fila = filaExcel(i);
    const nombre = limpioODefecto(col(f, 'QUIÉN ENTREGA', 'QUIEN ENTREGA'));
    const cedulaCruda = col(f, 'CEDULA', 'CÉDULA');
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

    const { iso, invalida } = parseFecha(col(f, 'FECHA'));
    if (invalida) {
      reg.add({
        tipo: 'FECHA_INVALIDA', severidad: 'ADVERTENCIA', hoja: 'ENTRADAS', fila,
        columna: 'FECHA', valor: String(col(f, 'FECHA') ?? ''),
        mensaje: `No se pudo leer la fecha «${String(col(f, 'FECHA')).trim()}».`,
        sugerencia: 'El movimiento se registra sin fecha.',
      });
    }

    const motivo = limpioODefecto(col(f, 'MOTIVO DE ENTRADA'));
    const perifericos = limpioODefecto(col(f, 'PERIFÉRICOS RECIBIDOS', 'PERIFERICOS RECIBIDOS'));
    const notas = [
      motivo && `Motivo: ${motivo}`,
      perifericos && `Periféricos: ${perifericos}`,
    ].filter(Boolean).join('. ');

    movimientos.push({
      fila,
      hoja: 'ENTRADAS',
      serial,
      tipo_movimiento: 'DEVOLUCION_COLABORADOR',
      fecha: iso,
      personaNombre: nombre,
      personaCedula: cedula,
      registrado_por: limpioODefecto(col(f, 'RECIBIDO POR')),
      observaciones: notas || null,
    });
  });

  return { movimientos, cedulas, filasLeidas: filas.length };
}

// ------------------------------------------------------------------- SALIDAS

function analizarSalidas(wb: XLSX.WorkBook, reg: Registro) {
  const filas = leerHoja(wb, 'SALIDAS');
  const movimientos: MovimientoImport[] = [];

  filas.forEach((f, i) => {
    const serial = normSerial(col(f, 'ID DEL EQUIPO'));
    // Las filas de relleno solo traen MODELO = "ID NO REGISTRADO" y nada más.
    if (!serial) return;

    const fila = filaExcel(i);
    const { iso, invalida } = parseFecha(col(f, 'FECHA SALIDA'));
    if (invalida) {
      reg.add({
        tipo: 'FECHA_INVALIDA', severidad: 'ADVERTENCIA', hoja: 'SALIDAS', fila,
        columna: 'FECHA SALIDA', valor: String(col(f, 'FECHA SALIDA') ?? ''),
        mensaje: `No se pudo leer la fecha «${String(col(f, 'FECHA SALIDA')).trim()}».`,
        sugerencia: 'El movimiento se registra sin fecha.',
      });
    }

    const ticket = limpioODefecto(col(f, 'TICKET'));
    const perifericos = limpioODefecto(col(f, 'PERIFÉRICOS ENTREGADOS', 'PERIFERICOS ENTREGADOS'));
    const anotaciones = limpioODefecto(col(f, 'ANOTACIONES ESPECIALES'));
    const notas = [
      ticket && `Ticket: ${ticket}`,
      perifericos && `Periféricos: ${perifericos}`,
      anotaciones,
    ].filter(Boolean).join('. ');

    movimientos.push({
      fila,
      hoja: 'SALIDAS',
      serial,
      tipo_movimiento: 'ASIGNACION',
      fecha: iso,
      personaNombre: limpioODefecto(col(f, 'RESPONSABLE DEL EQUIPO')),
      personaCedula: null, // la hoja no la trae; se resuelve por nombre
      registrado_por: null,
      observaciones: notas || null,
    });
  });

  return { movimientos, filasLeidas: filas.length };
}

// -------------------------------------------------------------------- público

export async function analizarLibro(file: File): Promise<ResultadoAnalisis> {
  const t0 = performance.now();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const reg = new Registro();

  const eq = analizarEquipos(wb, reg);
  const ent = analizarEntradas(wb, reg);
  const sal = analizarSalidas(wb, reg);

  // --- colaboradores: solo salen de ENTRADAS, que es donde hay cédula
  const colaboradores: ColaboradorImport[] = [...ent.cedulas.values()].map((c) => ({
    cedula: c.cedula,
    nombre: c.nombre,
    origen: 'ENTRADAS',
  }));

  // --- movimientos huérfanos: apuntan a un serial que BD_EQUIPOS no tiene
  const serialesConocidos = new Set(eq.equipos.map((e) => e.serial));
  const movimientos = [...ent.movimientos, ...sal.movimientos];
  const huerfanosVistos = new Set<string>();
  for (const m of movimientos) {
    if (serialesConocidos.has(m.serial) || huerfanosVistos.has(m.serial)) continue;
    huerfanosVistos.add(m.serial);
    reg.add({
      tipo: 'SERIAL_HUERFANO', severidad: 'ADVERTENCIA', hoja: m.hoja, fila: m.fila,
      columna: m.hoja === 'SALIDAS' ? 'ID DEL EQUIPO' : 'SERIAL', valor: m.serial,
      mensaje: `El serial ${m.serial} tiene movimientos pero no está en BD_EQUIPOS.`,
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
  for (const m of sal.movimientos) {
    if (m.personaNombre && serialesConocidos.has(m.serial)) {
      anotarPendiente(m.personaNombre, m.serial, 'SALIDAS');
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

  // --- hojas que no aportan datos
  const hojas: ResumenHoja[] = [
    {
      nombre: 'BD_EQUIPOS', filasLeidas: eq.filasLeidas, filasUtiles: eq.equipos.length,
      destino: 'Inventario de equipos', ignorada: false,
      nota: eq.plantilla ? `${eq.plantilla} filas de plantilla omitidas` : undefined,
    },
    {
      nombre: 'ENTRADAS', filasLeidas: ent.filasLeidas, filasUtiles: ent.movimientos.length,
      destino: 'Devoluciones + colaboradores', ignorada: false,
      nota: `${colaboradores.length} personas con cédula`,
    },
    {
      nombre: 'SALIDAS', filasLeidas: sal.filasLeidas, filasUtiles: sal.movimientos.length,
      destino: 'Asignaciones', ignorada: false,
    },
  ];

  for (const nombre of wb.SheetNames) {
    if (['BD_EQUIPOS', 'ENTRADAS', 'SALIDAS'].includes(norm(nombre))) continue;
    const filas = leerHoja(wb, nombre);
    const nota = normNombre(nombre) === 'CONFIGURACION'
      ? 'Catálogos de la hoja; se usan para validar, no se importan como registros'
      : normNombre(nombre) === 'DASHBOARD'
        ? 'Solo gráficos y fórmulas, sin datos propios'
        : 'Sin filas con datos';
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

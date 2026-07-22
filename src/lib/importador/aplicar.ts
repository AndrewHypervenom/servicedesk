import { supabase } from '@/lib/supabase';
import { ensureMarca } from '@/lib/api';
import { normNombre } from './normalizar';
import { indiceCedulas } from './analizar';
import type {
  ProgresoAplicacion, ResultadoAnalisis, ResultadoAplicacion, Resoluciones,
} from './tipos';

/**
 * Escribe en la base lo que el análisis encontró y el usuario aprobó.
 *
 * Todo va en una sola llamada a `importar_base`, que hace las tres etapas dentro
 * de una transacción. No es una optimización: los movimientos son inmutables
 * (`trg_mov_no_update`), así que una carga a medias no se podría deshacer y el
 * reintento duplicaría el historial. O entra todo, o no entra nada.
 */
export async function aplicarImportacion(
  analisis: ResultadoAnalisis,
  res: Resoluciones,
  onProgreso?: (p: ProgresoAplicacion) => void,
): Promise<ResultadoAplicacion> {
  onProgreso?.({ etapa: 'preparando' });
  const cedulaDe = indiceCedulas(analisis, res.cedulas);

  // La sede de cada equipo sale del mapeo de su ubicación; lo que no trae ubicación
  // (o cae en una ubicación sin mapear) va a la sede por defecto.
  const sedeDe = (ubicacion: string | null): string | null =>
    (ubicacion ? res.sedes[normNombre(ubicacion)] : null) ?? res.sedeDefecto;

  // --- personas: las de ENTRADAS más las que el usuario completó en la revisión
  const porCedula = new Map<string, { cedula: string; nombre: string }>();
  for (const c of analisis.colaboradores) porCedula.set(c.cedula, { cedula: c.cedula, nombre: c.nombre });
  for (const p of analisis.pendientesCedula) {
    const cedula = cedulaDe.get(normNombre(p.nombre));
    if (cedula) porCedula.set(cedula, { cedula, nombre: p.nombre });
  }

  // --- equipos: de los seriales en conflicto solo va la fila que el usuario eligió
  const filaElegida = new Map(Object.entries(res.conflictos));
  const equipos = analisis.equipos
    .filter((e) => {
      const elegida = filaElegida.get(e.serial);
      return elegida === undefined || elegida === e.fila;
    })
    .map((e) => {
      const cedula = e.usuarioNombre ? cedulaDe.get(normNombre(e.usuarioNombre)) ?? null : null;
      // `cedula_asignado` es llave foránea: un equipo "asignado" sin cédula no se
      // puede guardar. La revisión ya obliga a completarlas, pero si alguna faltara
      // el equipo entra a bodega en vez de tumbar la importación entera.
      const quedaAsignado = e.estado_asignacion === 'ASIGNADO' && cedula !== null;
      return {
        serial: e.serial,
        marca: e.marca,
        linea_modelo: e.linea_modelo,
        tipo: e.tipo,
        estado_fisico: e.estado_fisico,
        estado_asignacion: quedaAsignado ? 'ASIGNADO'
          : e.estado_asignacion === 'ASIGNADO' ? 'DISPONIBLE'
            : e.estado_asignacion,
        cedula_asignado: quedaAsignado ? cedula : null,
        propiedad: e.propiedad,
        proveedor_propietario: e.proveedor_propietario,
        sede_id: sedeDe(e.ubicacion),
        observaciones: e.observaciones,
      };
    });

  // --- historial: el serial viaja tal cual; el equipo_id lo resuelve la función
  const movimientos = analisis.movimientos.map((m) => {
    const cedula = m.personaCedula
      ?? (m.personaNombre ? cedulaDe.get(normNombre(m.personaNombre)) ?? null : null);
    const esEntrada = m.tipo_movimiento === 'DEVOLUCION_COLABORADOR';
    return {
      serial: m.serial,
      tipo_movimiento: m.tipo_movimiento,
      cedula_origen: esEntrada ? cedula : null,
      cedula_destino: esEntrada ? null : cedula,
      estado_nuevo: esEntrada ? 'DISPONIBLE' : 'ASIGNADO',
      fecha: m.fecha, // si es null, la función pone CURRENT_DATE
      registrado_por: m.registrado_por,
      observaciones: [m.observaciones, `Importado de ${m.hoja} (fila ${m.fila})`]
        .filter(Boolean).join('. '),
    };
  });

  onProgreso?.({ etapa: 'escribiendo' });

  const { data, error } = await supabase.rpc('importar_base', {
    payload: {
      sede_defecto: res.sedeDefecto,
      colaboradores: [...porCedula.values()],
      equipos,
      movimientos,
    },
  });
  if (error) throw new Error(error.message);

  const r = data as {
    colaboradores_creados: number;
    equipos_creados: number;
    equipos_omitidos: number;
    movimientos_creados: number;
  };

  // El catálogo de marcas alimenta el formulario de alta. Va aparte porque no es
  // parte del inventario: si falla, la importación sigue siendo válida.
  onProgreso?.({ etapa: 'catalogos' });
  await Promise.all(
    [...new Set(equipos.map((e) => e.marca))].map((m) => ensureMarca(m).catch(() => undefined)),
  );

  onProgreso?.({ etapa: 'listo' });

  return {
    colaboradoresCreados: r.colaboradores_creados,
    equiposCreados: r.equipos_creados,
    equiposOmitidos: r.equipos_omitidos,
    movimientosCreados: r.movimientos_creados,
  };
}

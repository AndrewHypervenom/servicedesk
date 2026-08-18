/**
 * Lectura del libro "CONTROL TICKETS.xlsx".
 *
 * El archivo es una hoja por mes —"ABRIL Y MAYO", "JUNIO", "JULIO", "AGOSTO"—
 * más tres hojas que no son datos: "CONFIG" (instrucciones de uso), "DASHBOARD
 * PRUEBAS" (una tabla de resumen) y "Sheet1" (vacía). Por eso las hojas no se
 * eligen por nombre ni por posición: se reconoce la que TIENE los encabezados
 * del control. Así el mes que venga el año que viene entra solo, y una hoja de
 * notas que alguien añada no se carga como si fueran tickets.
 *
 * Dentro de cada hoja, cada fila se lee, se normaliza y se revisa. Lo que se
 * revisa no es capricho: son los defectos que trae el archivo real.
 *
 *   · Fechas en dos formatos a la vez (serial de Excel y texto "8/4/26").
 *   · Seis filas sin fecha de fin, que la columna "Días" deja en blanco.
 *   · Cinco filas cuya columna "Días" ya no cuadra con sus propias fechas,
 *     porque alguien pisó la fórmula con un número a mano.
 *   · Fin anterior al inicio.
 *   · 63 números de ticket repetidos: 47 son la misma fila copiada dos veces y
 *     16 son el mismo ticket con dos tareas distintas. Los primeros se
 *     descartan; los segundos son datos buenos y se cargan los dos.
 *   · El analista escrito de varias formas ("juan David Castro", "Juan Castro").
 *
 * Nada de esto toca la red: el análisis se hace entero en el navegador y lo que
 * se ve en pantalla es lo que se va a guardar.
 */

import * as XLSX from 'xlsx';
import type { AnalistaMesa, EstadoTicket, PrioridadTicket, Sede } from '@/types';
import { normNombre } from '@/lib/importador/normalizar';
import {
  cumplimientoCanonico, descripcionCanonica, diasEntre, estadoCanonico, fechaISO,
  mesDeHoja, prioridadCanonica, ticketCanonico,
} from './modelo';

/** Motivo por el que una fila necesita que alguien la mire. */
export type TipoAviso =
  | 'SIN_TICKET' | 'SIN_INICIO' | 'SIN_FIN' | 'FIN_ANTES_DE_INICIO'
  | 'FECHA_ILEGIBLE' | 'DIAS_NO_CUADRAN' | 'DUPLICADA' | 'SIN_ANALISTA';

export interface Aviso {
  tipo: TipoAviso;
  /** Lo que hay que hacer con la fila. BLOQUEA descarta; AVISO carga igual. */
  gravedad: 'BLOQUEA' | 'AVISO';
  detalle?: string;
}

/** Una fila de una hoja, ya normalizada y revisada. */
export interface FilaTicket {
  /** Número de fila en la hoja, contando el encabezado. Para poder ir a verla. */
  fila: number;
  hoja: string;
  ticket: string | null;
  descripcion: string | null;
  estado: EstadoTicket;
  prioridad: PrioridadTicket | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** Los días que calculan las fechas. Es lo que se va a guardar. */
  dias: number | null;
  /** Los días que DECÍA el archivo. Solo sirve para avisar si no coinciden. */
  dias_archivo: number | null;
  analista_texto: string | null;
  ciudad_texto: string | null;
  cumplimiento: number | null;
  notas: string | null;
  periodo: string | null;
  avisos: Aviso[];
}

export interface HojaTicket {
  nombre: string;
  filas: FilaTicket[];
  /** Meses que aparecen en la hoja, 'AAAA-MM'. Una hoja puede traer varios. */
  periodos: string[];
  /** Filas idénticas a otra de la misma hoja: se descartan al leer. */
  duplicadas: number;
  /** Filas sin número de ticket: se enseñan, pero no se pueden cargar. */
  sinTicket: number;
}

export interface AnalisisLibro {
  hojas: HojaTicket[];
  /** Hojas del libro que no son de tickets, con el motivo. Se informa, no se oculta. */
  ignoradas: { nombre: string; motivo: string }[];
  /** Nombres de analista distintos que trae el archivo. */
  analistas: string[];
  ciudades: string[];
}

// ─────────────────────────────────────────────────────── encabezados

/** Cada columna del control y las formas en que aparece escrita. */
const COLUMNAS: Record<string, string[]> = {
  ticket: ['TICKET', 'NUMERO', 'NUMERO TICKET', 'N TICKET', 'CASO'],
  descripcion: ['DESCRIPCION', 'DETALLE', 'ASUNTO', 'SOLICITUD'],
  estado: ['ESTADO', 'STATUS'],
  inicio: ['INICIO', 'FECHA INICIO', 'FECHA DE INICIO', 'APERTURA'],
  fin: ['FIN', 'FECHA FIN', 'FECHA DE FIN', 'CIERRE', 'FINAL'],
  dias: ['DIAS', 'DIAS HABILES', 'DURACION'],
  analista: ['ANALISTA', 'RESPONSABLE', 'TECNICO', 'AGENTE'],
  ciudad: ['CIUDAD', 'SEDE', 'UBICACION'],
  prioridad: ['PRIORIDAD', 'CRITICIDAD'],
  cumplimiento: ['CUMPL', 'CUMPLIMIENTO', 'PORCENTAJE', 'AVANCE'],
  notas: ['NOTAS', 'NOTA', 'OBSERVACION', 'OBSERVACIONES', 'COMENTARIOS'],
};

const canonEncabezado = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD').replace(/[\p{Diacritic}]/gu, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Índice de cada columna del control en una fila de encabezados. */
function mapearColumnas(encabezados: unknown[]): Record<string, number> {
  const mapa: Record<string, number> = {};
  encabezados.forEach((h, i) => {
    const c = canonEncabezado(h);
    if (!c) return;
    for (const [campo, alias] of Object.entries(COLUMNAS)) {
      if (campo in mapa) continue;
      // Coincidencia exacta o por prefijo: "%CUMPL" llega como "CUMPL" y
      // "FECHA INICIO" tiene que ganarle a "FIN" aunque las dos empiecen por F.
      if (alias.some((a) => c === a || c.startsWith(`${a} `) || a.startsWith(c))) mapa[campo] = i;
    }
  });
  return mapa;
}

/** Una hoja es del control si sus encabezados traen al menos ticket y estado. */
const esHojaDeControl = (m: Record<string, number>) =>
  'ticket' in m && 'estado' in m && ('inicio' in m || 'fin' in m);

/**
 * Dónde está la fila de encabezados.
 *
 * En este libro es la primera, pero se buscan las diez primeras: basta con que
 * alguien añada un título arriba —que es exactamente lo que tiene la hoja
 * "DASHBOARD PRUEBAS"— para que la primera fila deje de ser el encabezado.
 */
function buscarEncabezado(filas: unknown[][]): { indice: number; mapa: Record<string, number> } | null {
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const mapa = mapearColumnas(filas[i] ?? []);
    if (esHojaDeControl(mapa)) return { indice: i, mapa };
  }
  return null;
}

// ─────────────────────────────────────────────────────── análisis

const texto = (v: unknown): string | null => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
};

/** Igual que `texto`, pero conservando los saltos de línea: es para las notas. */
const textoLargo = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  return s === '' ? null : s;
};

export function analizarLibro(buffer: ArrayBuffer): AnalisisLibro {
  // `cellDates: false` a propósito: las fechas se resuelven en `fechaISO`, que
  // sabe leer tanto el serial como el texto en formato mes/día/año. Dejar que
  // la librería las convierta metería la zona horaria del navegador por medio y
  // correría medio archivo un día hacia atrás.
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });

  const hojas: HojaTicket[] = [];
  const ignoradas: { nombre: string; motivo: string }[] = [];
  const analistas = new Map<string, string>();
  const ciudades = new Map<string, string>();

  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
    if (!filas.length) { ignoradas.push({ nombre, motivo: 'La hoja está vacía' }); continue; }

    const enc = buscarEncabezado(filas);
    if (!enc) {
      ignoradas.push({ nombre, motivo: 'No tiene las columnas del control de tickets' });
      continue;
    }

    const { indice, mapa } = enc;
    const mesHoja = mesDeHoja(nombre);
    const vistas = new Set<string>();
    const leidas: FilaTicket[] = [];
    let duplicadas = 0;
    let sinTicket = 0;

    const col = (r: unknown[], campo: string): unknown =>
      (campo in mapa ? r[mapa[campo]] : undefined);

    for (let i = indice + 1; i < filas.length; i++) {
      const r = filas[i] ?? [];
      // Una fila sin ticket y sin descripción es una fila de relleno: el
      // archivo trae cientos al final de cada hoja por el formato de la tabla.
      if (!texto(col(r, 'ticket')) && !texto(col(r, 'descripcion'))) continue;

      const avisos: Aviso[] = [];
      const ticket = ticketCanonico(col(r, 'ticket'));
      const descripcion = descripcionCanonica(col(r, 'descripcion'));

      const crudoInicio = col(r, 'inicio');
      const crudoFin = col(r, 'fin');
      const inicio = fechaISO(crudoInicio);
      const fin = fechaISO(crudoFin);

      if (!ticket) avisos.push({ tipo: 'SIN_TICKET', gravedad: 'BLOQUEA' });
      if (!inicio) {
        avisos.push(texto(crudoInicio)
          ? { tipo: 'FECHA_ILEGIBLE', gravedad: 'AVISO', detalle: String(crudoInicio) }
          : { tipo: 'SIN_INICIO', gravedad: 'AVISO' });
      }
      if (!fin) {
        avisos.push(texto(crudoFin)
          ? { tipo: 'FECHA_ILEGIBLE', gravedad: 'AVISO', detalle: String(crudoFin) }
          : { tipo: 'SIN_FIN', gravedad: 'AVISO' });
      }

      const dias = diasEntre(inicio, fin);
      if (dias != null && dias < 0) {
        avisos.push({ tipo: 'FIN_ANTES_DE_INICIO', gravedad: 'AVISO', detalle: `${inicio} → ${fin}` });
      }

      const crudoDias = col(r, 'dias');
      const diasArchivo = crudoDias === '' || crudoDias == null ? null : Number(crudoDias);
      const diasArchivoOk = Number.isFinite(diasArchivo) ? (diasArchivo as number) : null;
      if (dias != null && diasArchivoOk != null && dias !== diasArchivoOk) {
        avisos.push({
          tipo: 'DIAS_NO_CUADRAN', gravedad: 'AVISO',
          detalle: `el archivo dice ${diasArchivoOk} y las fechas dan ${dias}`,
        });
      }

      const analista = texto(col(r, 'analista'));
      if (!analista) avisos.push({ tipo: 'SIN_ANALISTA', gravedad: 'AVISO' });
      else analistas.set(normNombre(analista), analista);

      const ciudad = texto(col(r, 'ciudad'));
      if (ciudad) ciudades.set(normNombre(ciudad), ciudad);

      // El mes sale de la fecha de inicio. El nombre de la hoja solo entra si
      // la fila no tiene fecha, y "ABRIL Y MAYO" nombra dos meses: en ese caso
      // se queda con el primero, que es lo único que se puede afirmar.
      const periodo = inicio ? inicio.slice(0, 7)
        : mesHoja ? `${anioProbable(filas, mapa, indice)}-${String(mesHoja).padStart(2, '0')}`
          : null;

      // La identidad dentro del propio archivo. Las filas repetidas enteras se
      // descartan aquí para que el recuento que se enseña sea el de verdad.
      const clave = `${ticket ?? ''}|${descripcion ?? ''}|${inicio ?? ''}`;
      if (ticket && vistas.has(clave)) {
        duplicadas++;
        continue;
      }
      if (ticket) vistas.add(clave);
      else sinTicket++;

      leidas.push({
        fila: i + 1,
        hoja: nombre,
        ticket,
        descripcion,
        estado: estadoCanonico(col(r, 'estado')),
        prioridad: prioridadCanonica(col(r, 'prioridad')),
        fecha_inicio: inicio,
        fecha_fin: fin,
        dias,
        dias_archivo: diasArchivoOk,
        analista_texto: analista,
        ciudad_texto: ciudad,
        cumplimiento: cumplimientoCanonico(col(r, 'cumplimiento')),
        notas: textoLargo(col(r, 'notas')),
        periodo,
        avisos,
      });
    }

    if (!leidas.length) {
      ignoradas.push({ nombre, motivo: 'Tiene los encabezados pero ninguna fila con datos' });
      continue;
    }

    const periodos = [...new Set(leidas.map((f) => f.periodo).filter(Boolean) as string[])].sort();
    hojas.push({ nombre, filas: leidas, periodos, duplicadas, sinTicket });
  }

  return {
    hojas,
    ignoradas,
    analistas: [...analistas.values()].sort((a, b) => a.localeCompare(b)),
    ciudades: [...ciudades.values()].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * El año que se le supone a una hoja cuando una fila no trae fecha.
 *
 * Se toma de la primera fecha legible de la propia hoja: si la hoja "JUNIO"
 * habla de junio de 2026, la fila sin fecha es de junio de 2026 y no del año
 * en que se abrió el navegador, que es lo que pasaría al usar la fecha de hoy.
 */
function anioProbable(filas: unknown[][], mapa: Record<string, number>, encabezado: number): number {
  for (let i = encabezado + 1; i < filas.length; i++) {
    const f = fechaISO(filas[i]?.[mapa.inicio]) ?? fechaISO(filas[i]?.[mapa.fin]);
    if (f) return Number(f.slice(0, 4));
  }
  return new Date().getFullYear();
}

// ─────────────────────────────────────────────────────── enlaces

/** Qué tan segura es una correspondencia propuesta. */
export type Confianza = 'EXACTA' | 'PROBABLE' | 'NINGUNA';

export interface EnlaceAnalista {
  /** El nombre tal como viene en el archivo. */
  texto: string;
  perfilId: string | null;
  confianza: Confianza;
  /** Los perfiles que encajaban. Si hay más de uno, no se elige por su cuenta. */
  candidatos: { id: string; nombre: string }[];
  /** Cuántas filas del archivo traen este nombre. Ordena la revisión. */
  filas: number;
}

const tokens = (s: string) => normNombre(s).split(' ').filter((p) => p.length > 1);

/**
 * A quién de la planta corresponde cada nombre de analista del archivo.
 *
 * El archivo escribe a la misma persona de varias formas —"Juan David Castro",
 * "juan David Castro", "Juan Castro"— y ninguna de ellas tiene por qué ser
 * idéntica al nombre del usuario en el sitio. La correspondencia se propone en
 * dos niveles y NUNCA se decide sola cuando hay dudas:
 *
 *   · EXACTA: el nombre normalizado es el mismo. Se enlaza.
 *   · PROBABLE: todos los apellidos y nombres de uno están en el otro
 *     ("Juan Castro" ⊂ "Juan David Castro") y solo hay un perfil que encaje.
 *     Se propone marcado, para que alguien lo confirme de un vistazo.
 *   · NINGUNA: no encaja nadie, o encaja más de uno. Se deja sin enlazar y la
 *     fila se carga igual con su texto: perder el ticket sería peor que
 *     quedarse sin saber quién lo atendió, y el enlace se arregla después
 *     desde la ficha.
 */
export function proponerAnalistas(
  nombres: { texto: string; filas: number }[], candidatos: AnalistaMesa[],
): EnlaceAnalista[] {
  // Ya llegan depurados por la base (`analistas_de_mesa`): aquí no se vuelve a
  // decidir quién puede ser analista, solo a quién se parece cada nombre.
  const porNombre = candidatos.map(
    (p) => ({ id: p.id, nombre: p.nombre, norm: normNombre(p.nombre), tk: tokens(p.nombre) }),
  );

  return nombres.map(({ texto: t, filas }) => {
    const n = normNombre(t);
    const tk = tokens(t);

    const exacto = porNombre.filter((p) => p.norm === n);
    if (exacto.length === 1) {
      return {
        texto: t, perfilId: exacto[0].id, confianza: 'EXACTA' as const,
        candidatos: [{ id: exacto[0].id, nombre: exacto[0].nombre }], filas,
      };
    }

    // Uno contiene al otro: hace falta que compartan al menos dos partes, para
    // que "Juan Correa" y "Juan Usuga" no se confundan por llamarse los dos Juan.
    const probables = porNombre.filter((p) => {
      const comunes = tk.filter((x) => p.tk.includes(x));
      if (comunes.length < 2) return false;
      return comunes.length === tk.length || comunes.length === p.tk.length;
    });

    const candidatos = (exacto.length ? exacto : probables)
      .map((p) => ({ id: p.id, nombre: p.nombre }));

    return {
      texto: t,
      perfilId: probables.length === 1 ? probables[0].id : null,
      confianza: probables.length === 1 ? 'PROBABLE' : 'NINGUNA',
      candidatos,
      filas,
    };
  });
}

export interface EnlaceCiudad {
  texto: string;
  sedeId: string | null;
  confianza: Confianza;
  candidatos: { id: string; nombre: string }[];
  filas: number;
}

/**
 * Qué sede es cada ciudad del archivo.
 *
 * Más fácil que los nombres: el archivo solo dice "Medellín" y "Bogotá", y las
 * sedes se llaman igual. Se compara sin acentos porque el archivo escribe
 * "Medellin" tanto como "Medellín", y si hay dos sedes con el mismo nombre en
 * países distintos no se elige ninguna: eso lo tiene que decidir una persona.
 */
export function proponerCiudades(
  ciudades: { texto: string; filas: number }[], sedes: Sede[],
): EnlaceCiudad[] {
  return ciudades.map(({ texto: t, filas }) => {
    const n = normNombre(t);
    const exactas = sedes.filter((s) => normNombre(s.nombre) === n);
    if (exactas.length === 1) {
      return {
        texto: t, sedeId: exactas[0].id, confianza: 'EXACTA' as const,
        candidatos: [{ id: exactas[0].id, nombre: exactas[0].nombre }], filas,
      };
    }
    const parciales = sedes.filter(
      (s) => normNombre(s.nombre).includes(n) || n.includes(normNombre(s.nombre)),
    );
    const lista = (exactas.length ? exactas : parciales).map((s) => ({
      id: s.id, nombre: s.pais_nombre ? `${s.nombre} · ${s.pais_nombre}` : s.nombre,
    }));
    return {
      texto: t,
      sedeId: parciales.length === 1 ? parciales[0].id : null,
      confianza: parciales.length === 1 ? 'PROBABLE' : 'NINGUNA',
      candidatos: lista,
      filas,
    };
  });
}

/** Cuenta cuántas filas usan cada nombre, para ordenar la revisión por impacto. */
export function contarPorTexto(
  hojas: HojaTicket[], campo: 'analista_texto' | 'ciudad_texto',
): { texto: string; filas: number }[] {
  const m = new Map<string, { texto: string; filas: number }>();
  for (const h of hojas) {
    for (const f of h.filas) {
      const v = f[campo];
      if (!v) continue;
      const k = normNombre(v);
      const prev = m.get(k);
      if (prev) prev.filas++;
      else m.set(k, { texto: v, filas: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.filas - a.filas || a.texto.localeCompare(b.texto));
}

/** La fila lista para el RPC, con los enlaces ya resueltos. */
export function filaParaCarga(
  f: FilaTicket, analistas: Map<string, string | null>, ciudades: Map<string, string | null>,
): Record<string, unknown> {
  return {
    ticket: f.ticket,
    descripcion: f.descripcion,
    estado: f.estado,
    prioridad: f.prioridad,
    fecha_inicio: f.fecha_inicio,
    fecha_fin: f.fecha_fin,
    periodo: f.periodo,
    hoja_origen: f.hoja,
    analista_id: f.analista_texto ? analistas.get(normNombre(f.analista_texto)) ?? null : null,
    analista_texto: f.analista_texto,
    sede_id: f.ciudad_texto ? ciudades.get(normNombre(f.ciudad_texto)) ?? null : null,
    ciudad_texto: f.ciudad_texto,
    cumplimiento: f.cumplimiento,
    notas: f.notas,
  };
}

/** Las filas que sí se pueden cargar: las que tienen número de ticket. */
export const cargables = (filas: FilaTicket[]): FilaTicket[] =>
  filas.filter((f) => !!f.ticket);

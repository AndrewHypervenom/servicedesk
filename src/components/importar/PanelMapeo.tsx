import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Check, Columns3, EyeOff, FileSpreadsheet, MessageSquareText,
} from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { reasignarTipo } from '@/lib/importador/analizar';
import { HOJAS, HOJA_POR_ID } from '@/lib/importador/campos';
import type { HojaId } from '@/lib/importador/campos';
import type { Mapeo, MapeoHoja, ModoExtra } from '@/lib/importador/tipos';

interface Props {
  mapeo: Mapeo;
  onMapeo: (m: Mapeo) => void;
}

const SIN_ASIGNAR = '';
/** Valor del selector de clase de hoja cuando la hoja no se importa. */
const NO_IMPORTAR = '__no__';

const OPCIONES_TIPO = [
  { value: NO_IMPORTAR, label: 'No importar esta hoja' },
  ...HOJAS.map((h) => ({ value: h.id, label: h.etiqueta })),
];

/** Recalcula qué columnas quedan libres tras cambiar las asignaciones de campos. */
function recomputarExtras(m: MapeoHoja): Record<string, ModoExtra> {
  const usadas = new Set(Object.values(m.campos).filter(Boolean) as string[]);
  const extras: Record<string, ModoExtra> = {};
  for (const col of m.columnas) {
    if (usadas.has(col)) continue;
    extras[col] = m.extras[col] ?? 'IGNORAR';
  }
  return extras;
}

/** Check verde con "pop" cuando un campo queda asignado. */
function CheckPop() {
  return (
    <motion.span
      initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', damping: 14, stiffness: 400 }}
      className="grid place-items-center"
    >
      <Check size={15} className="text-brand-500" />
    </motion.span>
  );
}

function TarjetaHoja({ m, onCambio }: {
  m: MapeoHoja; onCambio: (m: MapeoHoja) => void;
}) {
  const def = m.tipo ? HOJA_POR_ID[m.tipo] : null;
  // En hojas de equipos el texto va a las observaciones del equipo; en las de
  // movimientos (entradas/salidas) va a la nota de ese movimiento.
  const esHojaEquipo = m.tipo === 'BD_EQUIPOS' || m.tipo === 'CLARO';
  const dondeObs = esHojaEquipo ? 'las observaciones del equipo' : 'la nota de cada movimiento';
  // Una hoja con datos que nadie reconoció es dato que se perdería en silencio:
  // es el único caso en el que la tarjeta pide una decisión explícita.
  const sinReconocer = !m.tipo && m.tipoPor === 'DETECTADO' && m.filas > 0;

  // Una columna asignada a dos campos a la vez es casi siempre un error de mapeo.
  const duplicadas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const col of Object.values(m.campos)) {
      if (col) cuenta.set(col, (cuenta.get(col) ?? 0) + 1);
    }
    return new Set([...cuenta].filter(([, n]) => n > 1).map(([c]) => c));
  }, [m.campos]);

  const opciones = [
    { value: SIN_ASIGNAR, label: '— sin asignar —' },
    ...m.columnas.map((c) => ({ value: c, label: c.trim() || '(columna sin nombre)' })),
  ];

  const setCampo = (campoId: string, col: string) => {
    const campos = { ...m.campos, [campoId]: col || null };
    onCambio({ ...m, campos, extras: recomputarExtras({ ...m, campos }) });
  };

  const setExtra = (col: string, modo: ModoExtra) => {
    onCambio({ ...m, extras: { ...m.extras, [col]: modo } });
  };

  const extras = Object.keys(m.extras);

  return (
    <div className={`card overflow-hidden ${sinReconocer ? 'border-warning/40' : ''}`}>
      <div className="px-4 py-3 border-b border-ink-100 dark:border-white/5 flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${
          def ? 'bg-brand-500/12 text-brand-600 dark:text-brand-400'
            : 'bg-ink-100 dark:bg-white/10 text-ink-400'
        }`}
        >
          <FileSpreadsheet size={15} />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold truncate">{m.hoja.trim()}</h4>
          <p className="text-xs text-ink-400 truncate">
            {m.filas} filas con datos · {m.columnas.length} columnas
          </p>
        </div>
        <div className="ml-auto shrink-0 w-52">
          {/* La clase de hoja la decide el usuario: la detección por nombre es
              solo una propuesta y no siempre acierta. */}
          <Select
            value={m.tipo ?? NO_IMPORTAR}
            onChange={(v) => onCambio(reasignarTipo(m, v === NO_IMPORTAR ? null : (v as HojaId)))}
            options={OPCIONES_TIPO}
            className={sinReconocer ? '!border-warning' : ''}
          />
        </div>
      </div>

      {sinReconocer && (
        <div className="px-4 py-2.5 flex items-start gap-2 bg-warning/[0.08] text-xs text-amber-700 dark:text-warning">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <p>
            No reconocimos qué es esta hoja por su nombre, así que sus {m.filas} filas
            no se importarían. Elige arriba qué tipo de hoja es, o déjala en
            «No importar» si de verdad no debe entrar.
          </p>
        </div>
      )}

      {!def ? (
        <p className="px-4 py-3 text-xs text-ink-400">
          Esta hoja se deja fuera de la importación.
        </p>
      ) : (
      <>
      <p className="px-4 pt-3 text-xs text-ink-400">
        Se importa a <span className="text-ink-600 dark:text-ink-200">{def.destino}</span>.
      </p>
      <div className="p-4 grid sm:grid-cols-2 gap-x-5 gap-y-3">
        {def.campos.map((campo) => {
          const col = m.campos[campo.id];
          const asignado = !!col;
          const dup = !!col && duplicadas.has(col);
          const faltaObligatorio = campo.obligatorio && !asignado && m.filas > 0;
          const muestra = col ? m.muestras[col]?.[0] : undefined;
          return (
            <div key={campo.id}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                  {campo.etiqueta}
                </span>
                {campo.obligatorio && <span className="text-danger text-xs">*</span>}
                <span className="ml-auto w-4 h-4 grid place-items-center">
                  {asignado && !dup && <CheckPop />}
                </span>
              </div>
              <Select
                value={col ?? SIN_ASIGNAR}
                onChange={(v) => setCampo(campo.id, v)}
                options={opciones}
                placeholder="— sin asignar —"
                className={
                  faltaObligatorio ? '!border-danger focus:!ring-danger/40'
                    : dup ? '!border-warning' : ''
                }
              />
              <div className="mt-1 min-h-[1rem] text-[11px] leading-tight">
                {faltaObligatorio ? (
                  <span className="text-danger">Obligatorio: elige la columna del serial.</span>
                ) : dup ? (
                  <span className="text-amber-600 dark:text-warning">Esta columna ya alimenta otro campo.</span>
                ) : muestra ? (
                  <span className="text-ink-400 truncate block">ej. {muestra}</span>
                ) : campo.ayuda ? (
                  <span className="text-ink-400">{campo.ayuda}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {extras.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-ink-500 dark:text-ink-300 mb-1">
            <Columns3 size={13} /> Otras columnas de esta hoja
          </div>
          <p className="text-[11px] text-ink-400 mb-2.5 leading-snug">
            Estas columnas están en tu Excel pero no corresponden a ningún dato del sistema.
            Elige qué hacer con cada una: no traerla, o guardar su texto en {dondeObs}.
          </p>
          <div className="space-y-1.5">
            {extras.map((col) => {
              const modo = m.extras[col];
              const muestra = m.muestras[col]?.[0];
              return (
                <div key={col} className="rounded-xl border border-ink-100 dark:border-white/5 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium truncate block">{col.trim() || '(columna sin nombre)'}</span>
                      {muestra && <span className="text-[11px] text-ink-400 truncate block">ejemplo: {muestra}</span>}
                    </div>
                    <div className="flex rounded-lg border border-ink-200 dark:border-white/10 overflow-hidden shrink-0">
                      <button
                        onClick={() => setExtra(col, 'IGNORAR')}
                        className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${
                          modo === 'IGNORAR'
                            ? 'bg-ink-100 dark:bg-white/10 text-ink-700 dark:text-ink-100 font-medium'
                            : 'text-ink-400 hover:bg-ink-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <EyeOff size={12} /> No traerla
                      </button>
                      <button
                        onClick={() => setExtra(col, 'OBSERVACIONES')}
                        className={`px-2.5 py-1 text-xs flex items-center gap-1 border-l border-ink-200 dark:border-white/10 transition-colors ${
                          modo === 'OBSERVACIONES'
                            ? 'bg-brand-500/12 text-brand-600 dark:text-brand-400 font-medium'
                            : 'text-ink-400 hover:bg-ink-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <MessageSquareText size={12} /> Guardar en observaciones
                      </button>
                    </div>
                  </div>
                  {/* Explica en palabras qué pasará con la elección actual. */}
                  <p className="text-[11px] mt-1.5 text-ink-400">
                    {modo === 'OBSERVACIONES'
                      ? <>Su contenido se guardará en <span className="text-brand-600 dark:text-brand-400 font-medium">{dondeObs}</span>.</>
                      : 'No se importará: esta columna se deja fuera.'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

export function PanelMapeo({ mapeo, onMapeo }: Props) {
  // Una tarjeta por hoja del archivo, en el orden de las pestañas del Excel:
  // así ninguna hoja desaparece sin que el usuario la vea.
  const sinReconocer = mapeo.filter((m) => !m.tipo && m.tipoPor === 'DETECTADO' && m.filas > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        Estas son todas las hojas de tu Excel. Para cada una adivinamos qué es y a qué dato del
        sistema corresponde cada columna (la ✓ verde marca las que ya quedaron listas). Revisa
        que esté bien: puedes cambiar el tipo de una hoja, la columna de cualquier campo y qué
        hacer con las columnas que sobran. Así nada se importa mal ni se pierde sin que te enteres.
      </p>

      {sinReconocer.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.08] p-4 text-sm">
          <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-warning" />
          <div>
            <p className="font-medium text-amber-700 dark:text-warning">
              {sinReconocer.length === 1 ? 'Una hoja con datos sin reconocer' : `${sinReconocer.length} hojas con datos sin reconocer`}
            </p>
            <p className="mt-0.5 text-ink-500 dark:text-ink-300">
              {sinReconocer.map((m) => `«${m.hoja.trim()}»`).join(', ')} trae{sinReconocer.length === 1 ? '' : 'n'} filas
              con datos pero su nombre no coincide con ninguna hoja conocida. Dinos qué son o quedarán fuera.
            </p>
          </div>
        </div>
      )}

      {mapeo.map((m, i) => (
        <TarjetaHoja
          key={m.hoja}
          m={m}
          onCambio={(nm) => onMapeo(mapeo.map((x, j) => (j === i ? nm : x)))}
        />
      ))}
    </div>
  );
}

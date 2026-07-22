import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Columns3, EyeOff, FileSpreadsheet, MessageSquareText } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { HOJAS } from '@/lib/importador/campos';
import type { Mapeo, MapeoHoja, ModoExtra } from '@/lib/importador/tipos';

interface Props {
  mapeo: Mapeo;
  onMapeo: (m: Mapeo) => void;
}

const SIN_ASIGNAR = '';

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

function TarjetaHoja({ hojaId, m, onCambio }: {
  hojaId: string; m: MapeoHoja; onCambio: (m: MapeoHoja) => void;
}) {
  const def = HOJAS.find((h) => h.id === hojaId)!;
  // En hojas de equipos el texto va a las observaciones del equipo; en las de
  // movimientos (entradas/salidas) va a la nota de ese movimiento.
  const esHojaEquipo = hojaId === 'BD_EQUIPOS' || hojaId === 'CLARO';
  const dondeObs = esHojaEquipo ? 'las observaciones del equipo' : 'la nota de cada movimiento';

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
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-ink-100 dark:border-white/5 flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-lg grid place-items-center bg-brand-500/12 text-brand-600 dark:text-brand-400 shrink-0">
          <FileSpreadsheet size={15} />
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold truncate">{def.etiqueta}</h4>
          <p className="text-xs text-ink-400 truncate">
            Hoja «{m.hoja.trim()}» · {m.filas} filas · {m.columnas.length} columnas
          </p>
        </div>
        <span className="ml-auto text-xs text-ink-400 shrink-0">→ {def.destino}</span>
      </div>

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
    </div>
  );
}

export function PanelMapeo({ mapeo, onMapeo }: Props) {
  // Se muestran en el orden canónico de HOJAS, solo las que el archivo trae.
  const hojas = HOJAS.filter((h) => mapeo[h.id]).map((h) => h.id);

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-400">
        Leímos las columnas de tu Excel y adivinamos a qué dato del sistema corresponde cada una
        (la ✓ verde marca las que ya quedaron listas). Revisa que estén bien: puedes cambiar la
        columna de cualquier campo, y decidir qué hacer con las columnas que sobran. Así nada se
        importa mal ni se pierde sin que te enteres.
      </p>
      {hojas.map((id) => (
        <TarjetaHoja
          key={id}
          hojaId={id}
          m={mapeo[id]!}
          onCambio={(nm) => onMapeo({ ...mapeo, [id]: nm })}
        />
      ))}
    </div>
  );
}

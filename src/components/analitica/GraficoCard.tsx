import { useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Download, Copy, Check, Table2 } from 'lucide-react';
import { exportarPng, copiarPng } from '@/lib/exportarGrafico';
import { toast } from '@/components/ui/Toast';

export interface GraficoHandle {
  contenedor: () => HTMLElement | null;
}

interface Props {
  titulo: string;
  /** Qué decisión ayuda a tomar. Sin esto un gráfico es decoración. */
  lectura?: string;
  /** Datos crudos, para la vista de tabla: la identidad nunca queda solo en el color. */
  tabla?: { filas: Record<string, string | number>[]; columnas: { key: string; label: string }[] };
  fondoExport: string;
  children: React.ReactNode;
  className?: string;
}

export const GraficoCard = forwardRef<GraficoHandle, Props>(function GraficoCard(
  { titulo, lectura, tabla, fondoExport, children, className }, ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [verTabla, setVerTabla] = useState(false);

  useImperativeHandle(ref, () => ({ contenedor: () => box.current }), []);

  const png = async () => {
    try {
      await exportarPng(box.current!, titulo.toLowerCase().replace(/\s+/g, '-'), fondoExport);
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo exportar'); }
  };

  const copiar = async () => {
    try {
      await copiarPng(box.current!, fondoExport);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // El portapapeles de imágenes no existe en Firefox ni fuera de HTTPS.
      // Se degrada a descarga en vez de dejar al usuario sin salida.
      toast.error('Tu navegador no permite copiar imágenes; se descargará en su lugar');
      png();
    }
  };

  return (
    <div className={`card p-5 flex flex-col ${className ?? ''}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{titulo}</h3>
          {lectura && <p className="text-xs text-ink-400 mt-1 leading-snug">{lectura}</p>}
        </div>
        {/* Los controles aparecen al pasar el puntero, pero siguen siendo
            enfocables con teclado: `opacity` no saca del orden de tabulación,
            y `focus-within` los revela para quien navega sin ratón. */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 focus-within:opacity-100
                        group-hover/card:opacity-100 transition-opacity duration-200">
          {tabla && (
            <button onClick={() => setVerTabla((v) => !v)} title="Ver como tabla"
              aria-pressed={verTabla}
              className="btn-ghost !p-1.5 !rounded-lg"><Table2 size={15} /></button>
          )}
          <button onClick={copiar} title="Copiar imagen"
            className="btn-ghost !p-1.5 !rounded-lg">
            {copiado ? <Check size={15} className="text-brand-500" /> : <Copy size={15} />}
          </button>
          <button onClick={png} title="Descargar PNG"
            className="btn-ghost !p-1.5 !rounded-lg"><Download size={15} /></button>
        </div>
      </div>

      <div ref={box} className="flex-1 mt-3">
        {verTabla && tabla ? (
          <div className="overflow-auto max-h-72">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-400">
                <tr>{tabla.columnas.map((c) => (
                  <th key={c.key} className="text-left font-semibold py-2 px-2">{c.label}</th>
                ))}</tr>
              </thead>
              <tbody>
                {tabla.filas.map((f, i) => (
                  <tr key={i} className="border-t border-ink-50 dark:border-white/5">
                    {tabla.columnas.map((c) => (
                      <td key={c.key} className="py-1.5 px-2 tabular-nums">{f[c.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : children}
      </div>
    </div>
  );
});

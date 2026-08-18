/**
 * Ficha de una línea: todo lo que se sabe de ella en una sola pantalla.
 *
 * Existe porque la tabla no puede mostrarlo todo sin volverse ilegible, y
 * porque hay datos que solo importan cuando ya se está mirando una línea
 * concreta (la observación completa, la solicitud a Claro, quién la cargó).
 * El ICCID se muestra agrupado de cuatro en cuatro: son veinte dígitos y así se
 * puede leer en voz alta por teléfono sin perder la cuenta.
 */

import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2, Copy, CreditCard, Layers, MapPin, Pencil, Phone, Signal, Smartphone, User, Check,
} from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { fmtDateTime } from '@/lib/format';
import {
  COLOR_CATEGORIA, ETIQUETA_CATEGORIA, categoriaEstado, fmtNumero,
} from '@/lib/lineas/estado';
import type { Colaborador, LineaMovil } from '@/types';

/** "89571016024090074820" → "8957 1016 0240 9007 4820". */
const agrupar = (iccid: string) => iccid.replace(/(.{4})/g, '$1 ').trim();

function Dato({ etiqueta, valor, icono: Icono, copiable }: {
  etiqueta: string; valor?: string | null; icono?: React.ElementType; copiable?: boolean;
}) {
  const { t } = useTranslation();
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    if (!valor) return;
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      toast.error(t('lines.copyFailed'));
    }
  };

  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1 flex items-center gap-1.5">
        {Icono && <Icono size={11} />} {etiqueta}
      </div>
      <div className="flex items-start gap-2 min-w-0">
        <span className="text-sm text-ink-700 dark:text-ink-100 break-words min-w-0">
          {valor || <span className="text-ink-400">—</span>}
        </span>
        {copiable && valor && (
          <button
            onClick={copiar} title={t('common.copy')}
            className="shrink-0 p-1 -mt-0.5 rounded-md text-ink-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-ink-100 dark:hover:bg-white/10 transition"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copiado
                ? <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                  <Check size={13} className="text-brand-500" />
                </motion.span>
                : <motion.span key="copy" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                  <Copy size={13} />
                </motion.span>}
            </AnimatePresence>
          </button>
        )}
      </div>
    </div>
  );
}

interface Props {
  linea: LineaMovil | null;
  sede?: string | null;
  titular?: Colaborador | null;
  onClose: () => void;
  onEditar?: (l: LineaMovil) => void;
}

export function FichaLinea({ linea, sede, titular, onClose, onEditar }: Props) {
  const { t, i18n } = useTranslation();
  if (!linea) return null;

  const cat = categoriaEstado(linea.estado);

  return (
    <Modal
      open={!!linea} onClose={onClose} size="md"
      title={linea.numero ? fmtNumero(linea.numero) : t('lines.notActivated')}
      subtitle={linea.proyecto ?? (linea.numero ? undefined : t('lines.notActivatedHint'))}
    >
      <div className="space-y-5">
        {/* Cabecera: estado y operador, que es lo que se mira primero. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2"
        >
          <span className={`badge ${COLOR_CATEGORIA[cat]}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {linea.estado || t(ETIQUETA_CATEGORIA[cat])}
          </span>
          <span className="badge bg-ink-100 dark:bg-white/10 text-ink-600 dark:text-ink-200">
            <Signal size={11} /> {linea.operador ?? 'CLARO'}
          </span>
          {cat !== 'OTRO' && linea.estado && (
            <span className="text-[11px] text-ink-400">{t(ETIQUETA_CATEGORIA[cat])}</span>
          )}
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Dato etiqueta={t('lines.fNumero')} icono={Phone} copiable
            valor={linea.numero ? fmtNumero(linea.numero) : null} />
          <Dato
            etiqueta={t('lines.fIccid')} icono={CreditCard} copiable
            valor={linea.iccid ? agrupar(linea.iccid) : null}
          />
          <Dato etiqueta={t('lines.fImei')} valor={linea.imei} icono={Smartphone} copiable />
          <Dato etiqueta={t('lines.fSheet')} valor={linea.hoja_origen} icono={Layers} />
          <Dato etiqueta={t('lines.fNombre')} valor={linea.nombre} icono={User} />
          {/* Titular: primero el enlazado con la planta; si no lo hay, la
              cédula que traía el archivo, diciendo que esa persona ya no está
              en la planta —que es justo lo que explica que no haya enlace. */}
          <Dato etiqueta={t('lines.owner')} icono={User}
            valor={titular
              ? `${titular.nombre} · C.C. ${titular.cedula}`
              : linea.cedula_asignado
              ?? (linea.cedula_archivo
                ? `C.C. ${linea.cedula_archivo} · ${t('lines.notInStaff')}`
                : null)} />
          <Dato etiqueta={t('lines.fCr')} valor={linea.cr} icono={Building2} />
          <Dato etiqueta={t('lines.fProyecto')} valor={linea.proyecto} icono={Building2} />
          <Dato etiqueta={t('users.sede')} valor={sede} icono={MapPin} />
          <Dato etiqueta={t('lines.fSolicitud')} valor={linea.solicitud_claro} copiable />
        </div>

        {(linea.observacion || linea.fecha_corte) && (
          <div className="space-y-4 rounded-2xl border border-ink-100 dark:border-white/10 p-4">
            <Dato etiqueta={t('lines.fObservacion')} valor={linea.observacion} />
            <Dato etiqueta={t('lines.fFechaCorte')} valor={linea.fecha_corte} />
          </div>
        )}

        <p className="text-[11px] text-ink-400">
          {t('lines.updatedAt', { fecha: fmtDateTime(linea.actualizado_en ?? linea.creado_en, i18n.language) })}
        </p>

        {onEditar && (
          <div className="flex justify-end">
            <Button variant="primary" icon={Pencil} onClick={() => onEditar(linea)}>
              {t('common.edit')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

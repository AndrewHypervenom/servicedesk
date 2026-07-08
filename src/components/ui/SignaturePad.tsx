import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import SignaturePadLib from 'signature_pad';
import { useTranslation } from 'react-i18next';
import { Eraser } from 'lucide-react';

export interface SignatureHandle {
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

function recortarFirma(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = 0, maxY = 0, encontrado = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) { // alpha > umbral
        encontrado = true;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (!encontrado) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d')!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}

export const SignaturePad = forwardRef<SignatureHandle>((_props, ref) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return; // aún sin layout (p. ej. dentro de un modal animándose)
      const trazos = padRef.current?.toData() ?? [];
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      canvas.getContext('2d')!.scale(ratio, ratio);
      padRef.current?.clear();
      if (trazos.length) padRef.current?.fromData(trazos); // conservar la firma al redimensionar
    };
    padRef.current = new SignaturePadLib(canvas, { penColor: '#0a3f75', minWidth: 1, maxWidth: 2.5 });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      observer.disconnect();
      padRef.current?.off();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      const pad = padRef.current, canvas = canvasRef.current;
      if (!pad || !canvas || pad.isEmpty()) return null;
      return recortarFirma(canvas) ?? pad.toDataURL('image/png');
    },
    clear: () => padRef.current?.clear(),
    isEmpty: () => padRef.current?.isEmpty() ?? true,
  }));

  return (
    <div className="relative">
      <div className="rounded-2xl border-2 border-dashed border-ink-200 dark:border-white/15 bg-white overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-44 touch-none cursor-crosshair" />
      </div>
      <span className="absolute top-2 left-3 text-xs text-ink-400 pointer-events-none">{t('common.signHere')}</span>
      <button
        type="button"
        onClick={() => padRef.current?.clear()}
        className="btn-ghost !py-1.5 !px-2.5 text-xs absolute top-1.5 right-1.5"
      >
        <Eraser size={14} /> {t('common.clear')}
      </button>
    </div>
  );
});
SignaturePad.displayName = 'SignaturePad';

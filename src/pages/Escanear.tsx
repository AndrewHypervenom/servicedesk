import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { ScanLine, Camera, CameraOff, Search, Cpu } from 'lucide-react';
import { findByCode } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { toast } from '@/components/ui/Toast';

export function Escanear() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState('');
  const [last, setLast] = useState('');

  const handleCode = async (code: string) => {
    if (!code || code === last) return;
    setLast(code);
    const eq = await findByCode(code);
    if (eq) { stop(); navigate(`/equipo/${eq.id}`); }
    else toast.error(t('scan.notFound', { code }));
  };

  const start = async () => {
    try {
      const reader = new BrowserMultiFormatReader();
      setScanning(true);
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
        if (result) handleCode(result.getText());
      });
      controlsRef.current = controls;
    } catch (e) {
      setScanning(false);
      toast.error(t('scan.permission'));
    }
  };

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} icon={ScanLine} />

      <div className="card p-6">
        <div className="relative aspect-square rounded-3xl overflow-hidden bg-ink-900 mb-4">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {!scanning && (
            <div className="absolute inset-0 grid place-items-center text-white/60">
              <div className="text-center">
                <Camera size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">{t('scan.point')}</p>
              </div>
            </div>
          )}
          {scanning && (
            <>
              <div className="absolute inset-8 border-2 border-white/60 rounded-2xl" />
              <motion.div className="absolute left-8 right-8 h-0.5 bg-brand-400 shadow-[0_0_12px_rgba(10,132,255,0.8)]"
                initial={{ top: '10%' }} animate={{ top: ['10%', '90%', '10%'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />
            </>
          )}
        </div>

        <div className="flex gap-2">
          {!scanning ? (
            <button onClick={start} className="btn-primary flex-1"><Camera size={18} /> {t('scan.start')}</button>
          ) : (
            <button onClick={stop} className="btn-danger flex-1"><CameraOff size={18} /> {t('scan.stop')}</button>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-ink-100 dark:border-white/10">
          <label className="label">{t('scan.manual')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Cpu size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input className="input pl-9" placeholder="EQ-XXXX / Serial" value={manual}
                onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCode(manual)} />
            </div>
            <button onClick={() => handleCode(manual)} className="btn-secondary shrink-0"><Search size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

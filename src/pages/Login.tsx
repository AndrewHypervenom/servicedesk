import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Boxes, Mail, Lock, ScanLine, FileSignature, Globe } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { toast } from '@/components/ui/Toast';

export function Login() {
  const { t } = useTranslation();
  const { signIn } = useApp();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email, pass);
    } catch (err: any) {
      toast.error(err.message ?? t('common.error'));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex bg-ink-50 dark:bg-ink-900">
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur grid place-items-center"><Boxes size={24} /></div>
          <div>
            <div className="font-semibold">{t('app.name')}</div>
            <div className="text-xs text-white/70">Positivo S+ · IT Solutions</div>
          </div>
        </motion.div>

        <div className="relative z-10 space-y-6">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-4xl font-bold leading-tight">
            {t('auth.welcomeSub')}
          </motion.h1>
          <div className="space-y-3">
            {[
              { icon: ScanLine, txt: 'QR imprimible + lectura con cámara' },
              { icon: FileSignature, txt: 'Actas con firma digital y correo' },
              { icon: Globe, txt: 'Español · Português · API abierta' },
            ].map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-center gap-3 text-white/90">
                <div className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center"><f.icon size={18} /></div>
                <span className="text-sm">{f.txt}</span>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-white/50">© 2026 Positivo S+ IT Solutions S.A.S</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white"><Boxes size={20} /></div>
            <div className="font-semibold">{t('app.name')}</div>
          </div>

          <h2 className="text-2xl font-bold">{t('auth.welcome')}</h2>
          <p className="text-sm text-ink-400 mt-1 mb-6">{t('app.subtitle')}</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">{t('auth.email')}</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input type="email" className="input pl-9" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="label">{t('auth.password')}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input type="password" className="input pl-9" value={pass} onChange={(e) => setPass(e.target.value)} required />
              </div>
            </div>

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? t('common.loading') : t('auth.signIn')}
            </button>
          </form>

          <p className="text-xs text-ink-400 mt-4">{t('auth.contactAdmin')}</p>
        </motion.div>
      </div>
    </div>
  );
}

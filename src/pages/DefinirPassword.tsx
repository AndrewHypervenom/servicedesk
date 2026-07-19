import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Boxes, Lock, KeyRound, LogOut } from 'lucide-react';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';

export function DefinirPassword() {
  const { t } = useTranslation();
  const { perfil, updatePerfil, signOut } = useApp();
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass1.length < 6) { toast.error(t('settings.passwordMin')); return; }
    if (pass1 !== pass2) { toast.error(t('settings.passwordMismatch')); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;
      await updatePerfil({ debe_cambiar_password: false });
      toast.success(t('settings.passwordUpdated'));
    } catch (err: any) {
      toast.error(err.message ?? t('common.error'));
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-ink-50 dark:bg-ink-900 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white"><Boxes size={20} /></div>
          <div className="leading-tight">
            <div className="font-semibold">{t('app.name')}</div>
            <div className="text-[11px] text-ink-400">{perfil?.correo}</div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-2 text-brand-600 font-semibold mb-1"><KeyRound size={18} /> {t('firstLogin.title')}</div>
          <p className="text-sm text-ink-400 mb-5">{t('firstLogin.hint')}</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">{t('settings.newPassword')}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input type="password" className="input pl-9" value={pass1} onChange={(e) => setPass1(e.target.value)} placeholder="mín. 6 caracteres" required />
              </div>
            </div>
            <div>
              <label className="label">{t('settings.confirmPassword')}</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
                <input type="password" className="input pl-9" value={pass2} onChange={(e) => setPass2(e.target.value)} required />
              </div>
            </div>
            <Button type="submit" variant="primary" className="w-full" loading={busy} icon={KeyRound}>
              {busy ? t('common.saving') : t('firstLogin.action')}
            </Button>
          </form>
        </div>

        <button onClick={() => signOut()} className="text-xs text-ink-400 mt-4 hover:underline inline-flex items-center gap-1">
          <LogOut size={13} /> {t('auth.logout')}
        </button>
      </motion.div>
    </div>
  );
}

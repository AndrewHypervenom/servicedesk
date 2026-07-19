import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Sun, Moon, Monitor, Languages, Database, Server, IdCard, FileSignature, Check, KeyRound, Upload } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SignaturePad, type SignatureHandle } from '@/components/ui/SignaturePad';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { useApp } from '@/store/useApp';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';

export function Ajustes() {
  const { t } = useTranslation();
  const { theme, setTheme, idioma, setIdioma, perfil, updatePerfil } = useApp();

  const [nombre, setNombre] = useState(perfil?.nombre ?? '');
  const [cedula, setCedula] = useState(perfil?.cedula ?? '');
  const [cargo, setCargo] = useState(perfil?.cargo ?? '');
  const [savingData, setSavingData] = useState(false);
  const [savingSig, setSavingSig] = useState(false);
  const sigRef = useRef<SignatureHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [firmaSubida, setFirmaSubida] = useState<string | null>(null);

  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const cambiarPass = async () => {
    if (pass1.length < 6) { toast.error(t('settings.passwordMin')); return; }
    if (pass1 !== pass2) { toast.error(t('settings.passwordMismatch')); return; }
    setSavingPass(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass1 });
      if (error) throw error;
      toast.success(t('settings.passwordUpdated'));
      setPass1(''); setPass2('');
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setSavingPass(false); }
  };

  const guardarDatos = async () => {
    setSavingData(true);
    try {
      await updatePerfil({ nombre: nombre.trim() || perfil?.nombre || '', cedula: cedula.trim() || null, cargo: cargo.trim() || null });
      toast.success(t('settings.profileSaved'));
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setSavingData(false); }
  };

  const cargarFirmaArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'image/png') { toast.error(t('settings.invalidImage')); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error(t('settings.imageTooLarge')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setFirmaSubida(reader.result as string);
      toast.success(t('settings.signatureUploaded'));
    };
    reader.onerror = () => toast.error(t('common.error'));
    reader.readAsDataURL(file);
  };

  const guardarFirma = async () => {
    const firma = firmaSubida ?? sigRef.current?.toDataURL();
    if (!firma) { toast.error(t('common.signHere')); return; }
    setSavingSig(true);
    try {
      await updatePerfil({ firma_data: firma });
      toast.success(t('settings.signatureUpdated'));
      sigRef.current?.clear();
      setFirmaSubida(null);
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setSavingSig(false); }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader title={t('settings.title')} icon={Settings} />

      <div className="space-y-5">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1 font-semibold"><IdCard size={18} className="text-brand-500" /> {t('settings.profile')}</div>
          <p className="text-xs text-ink-400 mb-4">{t('settings.profileHint')}</p>

          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="label">{t('auth.name')}</label>
              <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="label">Cédula</label>
              <input className="input" value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="1.234.567.890" />
            </div>
            <div>
              <label className="label">Cargo</label>
              <input className="input" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Técnico Service Desk" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button loading={savingData} icon={Check} onClick={guardarDatos}>
              {savingData ? t('common.saving') : t('settings.saveProfile')}
            </Button>
          </div>

          <div className="pt-5 mt-1 border-t border-ink-100 dark:border-white/5">
            <div className="flex items-center gap-2 text-sm font-semibold"><FileSignature size={16} className="text-brand-500" /> {t('settings.mySignature')}</div>
            <p className="text-xs text-ink-400 mt-1 mb-4">{t('settings.signatureHint')}</p>

            {perfil?.firma_data && !firmaSubida && (
              <div className="mb-4 flex items-center gap-3 p-3 rounded-xl bg-ink-50 dark:bg-ink-900/40 border border-ink-100 dark:border-white/10">
                <div className="shrink-0 rounded-lg bg-white p-1.5 border border-ink-100">
                  <img src={perfil.firma_data} alt="firma" className="h-11 max-w-[160px] object-contain" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t('settings.signatureCurrent')}</div>
                  <span className="badge bg-success/15 text-emerald-700 dark:text-success mt-1"><Check size={11} /> {t('settings.signatureSaved')}</span>
                </div>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/png" className="hidden" onChange={cargarFirmaArchivo} />

            {firmaSubida ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-brand-500/40 bg-brand-500/5">
                <div className="shrink-0 rounded-lg bg-white p-1.5 border border-ink-100">
                  <img src={firmaSubida} alt="firma cargada" className="h-11 max-w-[160px] object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5"><Upload size={13} className="text-brand-500" /> {t('settings.signaturePending')}</div>
                  <div className="text-xs text-ink-400 mt-0.5">{t('settings.signaturePendingHint')}</div>
                </div>
                <button type="button" className="btn-ghost !py-1.5 !px-2.5 text-xs shrink-0" onClick={() => setFirmaSubida(null)}>{t('common.clear')}</button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full flex flex-col items-center gap-1 py-5 px-3 rounded-xl border-2 border-dashed border-ink-200 dark:border-white/15 text-center transition-all hover:border-brand-400 hover:bg-brand-500/5 active:scale-[0.99]">
                <Upload size={20} className="text-brand-500" />
                <span className="text-sm font-medium">{t('settings.uploadSignature')}</span>
                <span className="text-xs text-ink-400">{t('settings.uploadHint')}</span>
              </button>
            )}

            <div className="flex items-center gap-3 my-4 text-xs font-medium text-ink-400 uppercase tracking-wide">
              <div className="h-px flex-1 bg-ink-100 dark:bg-white/10" />
              {t('settings.orDraw')}
              <div className="h-px flex-1 bg-ink-100 dark:bg-white/10" />
            </div>

            <p className="text-xs text-ink-400 mb-2">{t('settings.drawHint')}</p>
            <SignaturePad ref={sigRef} />

            <div className="flex justify-end mt-4">
              <Button variant="primary" loading={savingSig} icon={FileSignature} onClick={guardarFirma}>
                {savingSig ? t('common.saving') : t('settings.saveSignature')}
              </Button>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1 font-semibold"><KeyRound size={18} className="text-brand-500" /> {t('settings.security')}</div>
          <p className="text-xs text-ink-400 mb-4">{t('settings.securityHint')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('settings.newPassword')}</label>
              <input type="password" className="input" value={pass1} onChange={(e) => setPass1(e.target.value)} placeholder="mín. 6 caracteres" />
            </div>
            <div>
              <label className="label">{t('settings.confirmPassword')}</label>
              <input type="password" className="input" value={pass2} onChange={(e) => setPass2(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button loading={savingPass} icon={KeyRound} onClick={cambiarPass}>
              {savingPass ? t('common.saving') : t('settings.changePassword')}
            </Button>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3 font-semibold"><Languages size={18} className="text-brand-500" /> {t('settings.language')}</div>
          <div className="grid grid-cols-2 gap-3">
            {[['es', t('settings.spanish'), '🇪🇸'], ['pt', t('settings.portuguese'), '🇧🇷']].map(([l, label, flag]) => (
              <button key={l} onClick={() => setIdioma(l)}
                className={clsx('p-4 rounded-2xl border-2 flex items-center gap-3 transition-all',
                  idioma === l ? 'border-brand-500 bg-brand-500/5' : 'border-ink-100 dark:border-white/10')}>
                <span className="text-2xl">{flag}</span><span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3 font-semibold"><Monitor size={18} className="text-brand-500" /> {t('settings.theme')}</div>
          <div className="grid grid-cols-3 gap-3">
            {([['light', Sun, t('settings.light')], ['dark', Moon, t('settings.dark')], ['system', Monitor, t('settings.system')]] as const).map(([val, Icon, label]) => (
              <button key={val} onClick={() => setTheme(val)}
                className={clsx('p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all',
                  theme === val ? 'border-brand-500 bg-brand-500/5' : 'border-ink-100 dark:border-white/10')}>
                <Icon size={20} className={theme === val ? 'text-brand-500' : 'text-ink-400'} /><span className="text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3 font-semibold"><Database size={18} className="text-brand-500" /> Backend</div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-success/8">
            <Server size={20} className="text-success" />
            <div>
              <div className="text-sm font-medium">Supabase conectado</div>
              <div className="text-xs text-ink-400">Datos persistentes con Postgres + RLS</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

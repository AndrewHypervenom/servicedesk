import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Globe, Trash2, Building2, SearchX, Pencil, Check, X } from 'lucide-react';
import { listPaises, createPais, updatePais, deletePais, listSedes, createSede, updateSede, deleteSede } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';

export function Sedes() {
  const { t } = useTranslation();
  const { data: paises = [], refetch: refetchP, isLoading: loadingP } = useQuery({ queryKey: ['paises'], queryFn: listPaises });
  const { data: sedes = [], refetch: refetchS, isLoading: loadingS } = useQuery({ queryKey: ['sedes'], queryFn: listSedes });

  const [nuevoPais, setNuevoPais] = useState('');
  const [codigoPais, setCodigoPais] = useState('');
  const [nuevaSede, setNuevaSede] = useState('');
  const [paisSede, setPaisSede] = useState('');
  const [qPais, setQPais] = useState('');
  const [qSede, setQSede] = useState('');
  const [editPais, setEditPais] = useState<{ id: string; nombre: string; codigo: string } | null>(null);
  const [editSede, setEditSede] = useState<{ id: string; nombre: string; pais_id: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const savePais = async () => {
    if (!editPais || !editPais.nombre.trim()) return;
    setGuardando(true);
    try {
      await updatePais(editPais.id, { nombre: editPais.nombre.trim(), codigo: editPais.codigo.trim() || null });
      toast.success(t('common.success')); setEditPais(null); refetchP(); refetchS();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setGuardando(false); }
  };
  const saveSede = async () => {
    if (!editSede || !editSede.nombre.trim() || !editSede.pais_id) return;
    setGuardando(true);
    try {
      await updateSede(editSede.id, { nombre: editSede.nombre.trim(), pais_id: editSede.pais_id });
      toast.success(t('common.success')); setEditSede(null); refetchS();
    } catch (e: any) { toast.error(e.message ?? t('common.error')); }
    finally { setGuardando(false); }
  };

  const paisesFiltrados = useMemo(() => {
    const term = qPais.trim().toLowerCase();
    if (!term) return paises;
    return paises.filter((p) => [p.nombre, p.codigo].some((v) => v?.toLowerCase().includes(term)));
  }, [paises, qPais]);

  const sedesFiltradas = useMemo(() => {
    const term = qSede.trim().toLowerCase();
    if (!term) return sedes;
    return sedes.filter((s) => [s.nombre, s.pais_nombre].some((v) => v?.toLowerCase().includes(term)));
  }, [sedes, qSede]);

  const addPais = async () => {
    if (!nuevoPais.trim()) return;
    try { await createPais(nuevoPais.trim(), codigoPais.trim() || undefined); setNuevoPais(''); setCodigoPais(''); toast.success(t('common.success')); refetchP(); }
    catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };
  const delPais = async (id: string) => {
    try { await deletePais(id); toast.success(t('common.success')); refetchP(); refetchS(); }
    catch { toast.error(t('sedes.paisEnUso')); }
  };
  const addSede = async () => {
    if (!nuevaSede.trim() || !paisSede) { toast.error(t('sedes.sedeIncompleta')); return; }
    try { await createSede(nuevaSede.trim(), paisSede); setNuevaSede(''); toast.success(t('common.success')); refetchS(); }
    catch (e: any) { toast.error(e.message ?? t('common.error')); }
  };
  const delSede = async (id: string) => {
    try { await deleteSede(id); toast.success(t('common.success')); refetchS(); }
    catch { toast.error(t('common.error')); }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title={t('sedes.title')} subtitle={t('sedes.subtitle')} icon={MapPin} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4 font-semibold"><Globe size={18} className="text-brand-500" /> {t('sedes.countries')}</div>
          <div className="flex gap-2 mb-4">
            <input className="input flex-1" placeholder={t('sedes.countryName')} value={nuevoPais}
              onChange={(e) => setNuevoPais(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPais()} />
            <input className="input !w-20" placeholder={t('sedes.code')} value={codigoPais}
              onChange={(e) => setCodigoPais(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPais()} />
            <button onClick={addPais} className="btn-primary !px-3"><Plus size={16} /></button>
          </div>
          {!loadingP && paises.length > 6 && (
            <div className="mb-3">
              <SearchInput value={qPais} onChange={setQPais} placeholder={t('sedes.searchCountry')} atajo={false} />
            </div>
          )}
          {loadingP && <SkeletonList count={3} />}
          {!loadingP && paises.length === 0 && (
            <EmptyState icon={Globe} title={t('sedes.noCountries')} description={t('sedes.noCountriesDesc')} className="!py-6" />
          )}
          {!loadingP && paises.length > 0 && paisesFiltrados.length === 0 && (
            <EmptyState icon={SearchX} title={t('common.noResultsTitle')} className="!py-6" />
          )}
          <div className="space-y-2">
            {!loadingP && paisesFiltrados.map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-ink-50 dark:bg-white/5">
                <Globe size={15} className="text-ink-400 shrink-0" />
                {editPais?.id === p.id ? (
                  <>
                    <input autoFocus className="input !py-1.5 flex-1 text-sm" value={editPais.nombre}
                      onChange={(e) => setEditPais({ ...editPais, nombre: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') savePais(); if (e.key === 'Escape') setEditPais(null); }} />
                    <input className="input !py-1.5 !w-16 text-sm" placeholder={t('sedes.code')} value={editPais.codigo}
                      onChange={(e) => setEditPais({ ...editPais, codigo: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') savePais(); if (e.key === 'Escape') setEditPais(null); }} />
                    <button onClick={savePais} disabled={guardando} className="btn-ghost !p-1.5 text-success" title={t('common.save')}><Check size={15} /></button>
                    <button onClick={() => setEditPais(null)} className="btn-ghost !p-1.5" title={t('common.cancel')}><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{p.nombre}{p.codigo && <span className="text-ink-400 font-normal"> · {p.codigo}</span>}</span>
                    <button onClick={() => setEditPais({ id: p.id, nombre: p.nombre, codigo: p.codigo ?? '' })} className="btn-ghost !p-1.5" title={t('common.edit')}><Pencil size={14} /></button>
                    <button onClick={() => delPais(p.id)} className="btn-ghost !p-1.5 text-danger" title={t('common.delete')}><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4 font-semibold"><Building2 size={18} className="text-brand-500" /> {t('sedes.cities')}</div>
          <div className="space-y-2 mb-4">
            <input className="input" placeholder={t('sedes.cityName')} value={nuevaSede}
              onChange={(e) => setNuevaSede(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSede()} />
            <div className="flex gap-2">
              <Select value={paisSede} onChange={setPaisSede} placeholder={t('sedes.selectCountry')}
                options={paises.map((p) => ({ value: p.id, label: p.nombre }))} />
              <button onClick={addSede} className="btn-primary !px-3 shrink-0"><Plus size={16} /></button>
            </div>
          </div>
          {!loadingS && sedes.length > 6 && (
            <div className="mb-3">
              <SearchInput value={qSede} onChange={setQSede} placeholder={t('sedes.searchCity')} atajo={false} />
            </div>
          )}
          {loadingS && <SkeletonList count={3} />}
          {!loadingS && sedes.length === 0 && (
            <EmptyState icon={Building2} title={t('sedes.noCities')} description={t('sedes.noCitiesDesc')} className="!py-6" />
          )}
          {!loadingS && sedes.length > 0 && sedesFiltradas.length === 0 && (
            <EmptyState icon={SearchX} title={t('common.noResultsTitle')} className="!py-6" />
          )}
          <div className="space-y-2">
            {!loadingS && sedesFiltradas.map((s) => (
              <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-ink-50 dark:bg-white/5">
                <MapPin size={15} className="text-ink-400 shrink-0" />
                {editSede?.id === s.id ? (
                  <>
                    <input autoFocus className="input !py-1.5 flex-1 text-sm min-w-0" value={editSede.nombre}
                      onChange={(e) => setEditSede({ ...editSede, nombre: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveSede(); if (e.key === 'Escape') setEditSede(null); }} />
                    <Select className="!w-auto !py-1.5 text-sm shrink-0" value={editSede.pais_id}
                      onChange={(v) => setEditSede({ ...editSede, pais_id: v })}
                      options={paises.map((p) => ({ value: p.id, label: p.nombre }))} />
                    <button onClick={saveSede} disabled={guardando} className="btn-ghost !p-1.5 text-success" title={t('common.save')}><Check size={15} /></button>
                    <button onClick={() => setEditSede(null)} className="btn-ghost !p-1.5" title={t('common.cancel')}><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium">{s.nombre}
                      {s.pais_nombre && <span className="text-ink-400 font-normal"> · {s.pais_nombre}</span>}</span>
                    <button onClick={() => setEditSede({ id: s.id, nombre: s.nombre, pais_id: s.pais_id })} className="btn-ghost !p-1.5" title={t('common.edit')}><Pencil size={14} /></button>
                    <button onClick={() => delSede(s.id)} className="btn-ghost !p-1.5 text-danger" title={t('common.delete')}><Trash2 size={15} /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

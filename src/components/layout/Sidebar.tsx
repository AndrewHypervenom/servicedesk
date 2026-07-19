import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Boxes, UserPlus, Undo2, ScanLine, Users, FileSignature,
  Truck, PackageOpen, Plug, ShieldCheck, Settings, MapPin, X, ChartPie, ShieldQuestion,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { contarSolicitudesPendientes } from '@/lib/api';
import { useApp } from '@/store/useApp';
import { RUTA_ROLES } from '@/lib/roles';
import clsx from 'clsx';
import type { RolUsuario } from '@/types';

interface Item {
  to: string; icon: React.ElementType; label: string;
  roles?: RolUsuario[];
  /** Contador que se pinta a la derecha; se omite si es 0. */
  distintivo?: number;
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { perfil } = useApp();

  // Solo el ADMIN resuelve solicitudes, así que solo él paga la consulta.
  const { data: pendientes = 0 } = useQuery({
    queryKey: ['solicitudesPendientes'],
    queryFn: contarSolicitudesPendientes,
    enabled: perfil?.rol === 'ADMIN',
    refetchInterval: 60_000,
  });

  const items: Item[] = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/analitica', icon: ChartPie, label: t('nav.analytics'), roles: RUTA_ROLES['/analitica'] },
    { to: '/inventario', icon: Boxes, label: t('nav.inventory') },
    { to: '/asignar', icon: UserPlus, label: t('nav.assign'), roles: RUTA_ROLES['/asignar'] },
    { to: '/devolucion', icon: Undo2, label: t('nav.return'), roles: RUTA_ROLES['/devolucion'] },
    { to: '/escanear', icon: ScanLine, label: t('nav.scan'), roles: RUTA_ROLES['/escanear'] },
    { to: '/colaboradores', icon: Users, label: t('nav.collaborators'), roles: RUTA_ROLES['/colaboradores'] },
    { to: '/actas', icon: FileSignature, label: t('nav.actas') },
    { to: '/proveedores', icon: Truck, label: t('nav.suppliers'), roles: RUTA_ROLES['/proveedores'] },
    { to: '/reporte-proveedor', icon: PackageOpen, label: t('nav.supplierReport'), roles: RUTA_ROLES['/reporte-proveedor'] },
    { to: '/sedes', icon: MapPin, label: t('nav.sedes'), roles: RUTA_ROLES['/sedes'] },
    { to: '/integraciones', icon: Plug, label: t('nav.integrations'), roles: RUTA_ROLES['/integraciones'] },
    { to: '/usuarios', icon: ShieldCheck, label: t('nav.users'), roles: RUTA_ROLES['/usuarios'] },
    { to: '/solicitudes', icon: ShieldQuestion, label: 'Solicitudes', roles: RUTA_ROLES['/solicitudes'], distintivo: pendientes },
    { to: '/ajustes', icon: Settings, label: t('nav.settings') },
  ];

  const visible = items.filter((i) => !i.roles || (perfil && i.roles.includes(perfil.rol)));

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden" onClick={onClose} />}

      <aside className={clsx(
        'fixed lg:sticky top-0 z-40 h-screen w-[260px] shrink-0 flex flex-col',
        'glass border-r border-white/30 dark:border-white/10 transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/20 dark:border-white/10">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 grid place-items-center text-white shadow-sm">
            <Boxes size={18} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">{t('app.name')}</div>
            <div className="text-[11px] text-ink-400">{t('app.subtitle')}</div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-2 ml-auto lg:hidden"><X size={18} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visible.map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              onClick={onClose}
              className={({ isActive }) => clsx(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium',
                'transition-colors duration-200',
                isActive
                  ? 'text-brand-600 dark:text-brand-300'
                  : 'text-ink-600 dark:text-ink-300 hover:text-ink-800 dark:hover:text-white hover:bg-ink-100/70 dark:hover:bg-white/5',
              )}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div layoutId="nav-active"
                      className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500/20 to-brand-500/[0.06]
                                 ring-1 ring-inset ring-brand-500/20"
                      transition={{ type: 'spring', damping: 26, stiffness: 320 }}>
                      {/* Riel izquierdo: ancla la vista en el ítem activo cuando
                          la lista es larga y el fondo tenue solo no basta. */}
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-brand-500" />
                    </motion.div>
                  )}
                  <i.icon
                    size={18}
                    className={clsx(
                      'relative z-10 transition-transform duration-200',
                      isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:-rotate-3',
                    )}
                  />
                  <span className="relative z-10">{i.label}</span>
                  {!!i.distintivo && (
                    <span className="relative z-10 ml-auto min-w-[1.25rem] h-5 px-1.5 grid place-items-center
                                     rounded-full bg-danger text-white text-[11px] font-bold tabular-nums">
                      {i.distintivo > 99 ? '99+' : i.distintivo}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-3 text-[11px] text-ink-400 border-t border-white/20 dark:border-white/10">
          Positivo S+ · IT Solutions
        </div>
      </aside>
    </>
  );
}

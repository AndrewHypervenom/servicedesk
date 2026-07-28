import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, Boxes, UserPlus, Undo2, ScanLine, Users, FileSignature,
  Truck, PackageOpen, Plug, ShieldCheck, Settings, MapPin, X, ChartPie, ShieldQuestion, History,
  ChevronLeft,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { contarSolicitudesPendientes } from '@/lib/api';
import { useApp } from '@/store/useApp';
import { RUTA_ROLES } from '@/lib/roles';
import { Tooltip } from '@/components/ui/Tooltip';
import clsx from 'clsx';
import type { RolUsuario } from '@/types';

interface Item {
  to: string; icon: React.ElementType; label: string;
  roles?: RolUsuario[];
  /** Contador que se pinta a la derecha; se omite si es 0. */
  distintivo?: number;
}

interface Props {
  /** Cajón abierto en móvil. */
  open: boolean;
  onClose: () => void;
  /** Riel reducido a iconos. Solo tiene efecto de `lg` hacia arriba. */
  colapsado: boolean;
  onToggle: () => void;
}

/**
 * Transición del ancho y de todo lo que se pliega con ella.
 *
 * La curva es la misma que usa la entrada de página (`page-enter`): sale rápido
 * y frena largo, que es lo que hace que el riel se lea como una pieza física y
 * no como un `display: none` con retardo.
 */
const PLEGADO = 'transition-[width,max-width,opacity,padding,margin,transform] duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)]';

export function Sidebar({ open, onClose, colapsado, onToggle }: Props) {
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
    { to: '/colaboradores', icon: Users, label: t('nav.collaborators'), roles: RUTA_ROLES['/colaboradores'] },
    { to: '/inventario', icon: Boxes, label: t('nav.inventory') },
    { to: '/asignar', icon: UserPlus, label: t('nav.assign'), roles: RUTA_ROLES['/asignar'] },
    { to: '/devolucion', icon: Undo2, label: t('nav.return'), roles: RUTA_ROLES['/devolucion'] },
    { to: '/escanear', icon: ScanLine, label: t('nav.scan'), roles: RUTA_ROLES['/escanear'] },
    { to: '/actas', icon: FileSignature, label: t('nav.actas') },
    { to: '/proveedores', icon: Truck, label: t('nav.suppliers'), roles: RUTA_ROLES['/proveedores'] },
    { to: '/reporte-proveedor', icon: PackageOpen, label: t('nav.supplierReport'), roles: RUTA_ROLES['/reporte-proveedor'] },
    { to: '/sedes', icon: MapPin, label: t('nav.sedes'), roles: RUTA_ROLES['/sedes'] },
    { to: '/integraciones', icon: Plug, label: t('nav.integrations'), roles: RUTA_ROLES['/integraciones'] },
    { to: '/usuarios', icon: ShieldCheck, label: t('nav.users'), roles: RUTA_ROLES['/usuarios'] },
    { to: '/solicitudes', icon: ShieldQuestion, label: 'Solicitudes', roles: RUTA_ROLES['/solicitudes'], distintivo: pendientes },
    { to: '/auditoria', icon: History, label: t('nav.audit'), roles: RUTA_ROLES['/auditoria'] },
    { to: '/ajustes', icon: Settings, label: t('nav.settings') },
  ];

  const visible = items.filter((i) => !i.roles || (perfil && i.roles.includes(perfil.rol)));

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-30 lg:hidden" onClick={onClose} />}

      <aside className={clsx(
        'fixed lg:sticky top-0 z-40 h-screen w-[260px] shrink-0 flex flex-col',
        'glass border-r border-white/30 dark:border-white/10',
        PLEGADO,
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        // El cajón móvil se abre siempre completo: colapsar solo tiene sentido
        // cuando el riel convive con el contenido.
        colapsado ? 'lg:w-[78px]' : 'lg:w-[260px]',
      )}>
        {/* Tirador del borde. Vive fuera del flujo, pegado a la costura entre el
            riel y el contenido, que es donde la mano lo busca. */}
        <Tooltip
          label={colapsado ? t('nav.expand') : t('nav.collapse')}
          hint={t('nav.toggleHint')}
          className="hidden lg:block absolute -right-3.5 top-[4.4rem] z-50"
        >
          <button
            onClick={onToggle}
            aria-label={colapsado ? t('nav.expand') : t('nav.collapse')}
            aria-expanded={!colapsado}
            className="group grid place-items-center w-7 h-7 rounded-full
                       bg-white dark:bg-ink-800 text-ink-500 dark:text-ink-300
                       ring-1 ring-ink-200/80 dark:ring-white/10 shadow-card
                       transition-[transform,box-shadow,color] duration-300 ease-out
                       hover:scale-110 hover:text-brand-600 dark:hover:text-brand-300
                       hover:ring-brand-500/40 hover:shadow-[0_0_0_4px_rgba(16,212,81,0.12)]
                       active:scale-90 active:duration-75
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <ChevronLeft
              size={15}
              className={clsx(
                'transition-transform duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
                colapsado && 'rotate-180',
              )}
            />
          </button>
        </Tooltip>

        <div className={clsx(
          'flex items-center h-16 border-b border-white/20 dark:border-white/10',
          PLEGADO,
          colapsado ? 'gap-3 px-5 lg:gap-0 lg:px-[1.55rem]' : 'gap-3 px-5',
        )}>
          <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700
                          grid place-items-center text-white shadow-sm">
            <Boxes size={18} />
          </div>
          <div className={clsx(
            'leading-tight overflow-hidden whitespace-nowrap', PLEGADO,
            colapsado ? 'max-w-[10rem] opacity-100 lg:max-w-0 lg:opacity-0' : 'max-w-[10rem] opacity-100',
          )}>
            <div className="font-semibold text-sm">{t('app.name')}</div>
            <div className="text-[11px] text-ink-400">{t('app.subtitle')}</div>
          </div>
          <button onClick={onClose} className="btn-ghost !p-2 ml-auto lg:hidden"><X size={18} /></button>
        </div>

        <nav className={clsx('flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-0.5', PLEGADO,
          colapsado ? 'px-3 lg:px-[0.9rem]' : 'px-3')}>
          {visible.map((i) => {
            const enlace = (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.to === '/'}
                onClick={onClose}
                className={({ isActive }) => clsx(
                  'group relative flex w-full items-center py-2.5 rounded-xl text-sm font-medium',
                  'transition-colors duration-200', PLEGADO,
                  colapsado ? 'gap-3 px-3 lg:gap-0 lg:px-0 lg:justify-center' : 'gap-3 px-3',
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
                    <span className="relative z-10 shrink-0">
                      <i.icon
                        size={18}
                        className={clsx(
                          'transition-transform duration-200',
                          isActive ? 'scale-110' : 'group-hover:scale-110 group-hover:-rotate-3',
                        )}
                      />
                      {/* Plegado no cabe el número, pero sí la noticia de que hay
                          algo pendiente: el contador se reduce a un punto. */}
                      {!!i.distintivo && (
                        <span className={clsx(
                          'hidden absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-danger',
                          'ring-2 ring-white dark:ring-ink-800',
                          colapsado && 'lg:block',
                        )} />
                      )}
                    </span>
                    <span className={clsx(
                      'relative z-10 overflow-hidden whitespace-nowrap', PLEGADO,
                      colapsado ? 'max-w-[12rem] opacity-100 lg:max-w-0 lg:opacity-0' : 'max-w-[12rem] opacity-100',
                    )}>
                      {i.label}
                    </span>
                    {!!i.distintivo && (
                      <span className={clsx(
                        'relative z-10 ml-auto h-5 px-1.5 grid place-items-center overflow-hidden',
                        'rounded-full bg-danger text-white text-[11px] font-bold tabular-nums', PLEGADO,
                        colapsado
                          ? 'min-w-[1.25rem] opacity-100 lg:min-w-0 lg:px-0 lg:max-w-0 lg:opacity-0 lg:ml-0'
                          : 'min-w-[1.25rem] opacity-100',
                      )}>
                        {i.distintivo > 99 ? '99+' : i.distintivo}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            );

            // Plegado, el icono solo no basta para saber a dónde lleva: el nombre
            // vuelve como tooltip. El componente solo se abre con ratón, así que
            // en el cajón táctil no estorba.
            return colapsado
              ? <Tooltip key={i.to} label={i.label} className="!flex w-full">{enlace}</Tooltip>
              : enlace;
          })}
        </nav>

        <div className={clsx(
          'py-3 text-[11px] text-ink-400 border-t border-white/20 dark:border-white/10',
          'overflow-hidden whitespace-nowrap', PLEGADO,
          colapsado ? 'px-5 lg:px-0 lg:text-center' : 'px-5',
        )}>
          <span className={clsx(colapsado && 'lg:hidden')}>Positivo S+ · IT Solutions</span>
          {colapsado && <span className="hidden lg:inline font-semibold">S+</span>}
        </div>
      </aside>
    </>
  );
}

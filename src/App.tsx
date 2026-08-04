import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from '@/store/useApp';
import { puedeVerRuta } from '@/lib/roles';
import { AppLayout } from '@/components/layout/AppLayout';
import { ToastHost } from '@/components/ui/Toast';
import { ActualizacionDisponible } from '@/components/ActualizacionDisponible';
import { MascotaCalisto } from '@/components/marca/Calisto';
import { useDetectorDeVersion } from '@/lib/actualizacion';
import { Login } from '@/pages/Login';
import { DefinirPassword } from '@/pages/DefinirPassword';
import { RestablecerPassword } from '@/pages/RestablecerPassword';
import { Dashboard } from '@/pages/Dashboard';
import { Analitica } from '@/pages/Analitica';
import { Solicitudes } from '@/pages/Solicitudes';
import { Auditoria } from '@/pages/Auditoria';
import { Inventario } from '@/pages/Inventario';
import { EquipoDetalle } from '@/pages/EquipoDetalle';
import { Asignar } from '@/pages/Asignar';
import { Devolucion } from '@/pages/Devolucion';
import { Escanear } from '@/pages/Escanear';
import { Colaboradores } from '@/pages/Colaboradores';
import { Actas } from '@/pages/Actas';
import { Proveedores } from '@/pages/Proveedores';
import { ReporteProveedor } from '@/pages/ReporteProveedor';
import { Integraciones } from '@/pages/Integraciones';
import { Usuarios } from '@/pages/Usuarios';
import { Sedes } from '@/pages/Sedes';
import { Ajustes } from '@/pages/Ajustes';

function Guard({ children }: { children: ReactElement }) {
  const { perfil } = useApp();
  const { pathname } = useLocation();
  if (!puedeVerRuta(perfil?.rol, pathname)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { perfil, loading, init, recuperando } = useApp();

  useEffect(() => { init(); }, [init]);

  // Vigila si el servidor ya publicó una versión más nueva que esta pestaña.
  useDetectorDeVersion();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-ink-50 dark:bg-ink-900 overflow-hidden">
        <div className="aurora opacity-70" aria-hidden><span /><span /></div>
        <div className="relative z-10 flex flex-col items-center gap-6">
          <MascotaCalisto className="w-[8.5rem]" paralaje={0} />
          <div className="text-center">
            <div className="text-xl font-bold tracking-tight wordmark">Calisto</div>
            {/* Barra indeterminada en vez de un aro: ocupa el mismo ancho que
                el nombre y no compite con el flote de la mascota. */}
            <div className="mt-3 h-1 w-32 mx-auto rounded-full bg-ink-200/70 dark:bg-white/10 overflow-hidden">
              <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-brand-500 to-magenta-500 animate-carga" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ToastHost />
      <ActualizacionDisponible />
      {/* Va antes que todo lo demás, incluso antes de comprobar la sesión: el
          enlace del correo SÍ crea sesión, así que sin esta rama el usuario
          aterrizaría en el Dashboard y nunca vería el formulario que vino a
          usar. Y si el enlace caducó no hay sesión, pero hay que explicarlo en
          esta pantalla en vez de soltarlo en el login sin contexto. */}
      {recuperando ? (
        <Routes>
          <Route path="*" element={<RestablecerPassword />} />
        </Routes>
      ) : !perfil ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : perfil.debe_cambiar_password ? (
        <Routes>
          <Route path="*" element={<DefinirPassword />} />
        </Routes>
      ) : (
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analitica" element={<Guard><Analitica /></Guard>} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/equipo/:id" element={<EquipoDetalle />} />
            <Route path="/asignar" element={<Guard><Asignar /></Guard>} />
            <Route path="/devolucion" element={<Guard><Devolucion /></Guard>} />
            <Route path="/escanear" element={<Guard><Escanear /></Guard>} />
            <Route path="/colaboradores" element={<Guard><Colaboradores /></Guard>} />
            <Route path="/actas" element={<Actas />} />
            <Route path="/proveedores" element={<Guard><Proveedores /></Guard>} />
            <Route path="/reporte-proveedor" element={<Guard><ReporteProveedor /></Guard>} />
            <Route path="/sedes" element={<Guard><Sedes /></Guard>} />
            <Route path="/integraciones" element={<Guard><Integraciones /></Guard>} />
            <Route path="/usuarios" element={<Guard><Usuarios /></Guard>} />
            <Route path="/solicitudes" element={<Guard><Solicitudes /></Guard>} />
            <Route path="/auditoria" element={<Guard><Auditoria /></Guard>} />
            <Route path="/ajustes" element={<Ajustes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}

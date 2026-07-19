import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useApp } from '@/store/useApp';
import { puedeVerRuta } from '@/lib/roles';
import { AppLayout } from '@/components/layout/AppLayout';
import { ToastHost } from '@/components/ui/Toast';
import { Login } from '@/pages/Login';
import { DefinirPassword } from '@/pages/DefinirPassword';
import { Dashboard } from '@/pages/Dashboard';
import { Analitica } from '@/pages/Analitica';
import { Solicitudes } from '@/pages/Solicitudes';
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
  const { perfil, loading, init } = useApp();

  useEffect(() => { init(); }, [init]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-ink-50 dark:bg-ink-900">
        <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ToastHost />
      {!perfil ? (
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
            <Route path="/ajustes" element={<Ajustes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </BrowserRouter>
  );
}

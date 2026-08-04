/**
 * Detección del enlace de "restablecer contraseña" que llega por correo.
 *
 * Se evalúa una sola vez al importar el módulo, y por eso este archivo se
 * importa antes que nada en `main.tsx`: supabase-js consume la URL durante su
 * arranque (canjea el código y limpia el hash), así que si esperáramos al
 * evento `PASSWORD_RECOVERY` llegaríamos tarde. El listener de `init()` se
 * registra después de que el cliente ya procesó la URL, y con el flujo PKCE —el
 * que usan los proyectos nuevos de Supabase— el enlace ni siquiera trae
 * `type=recovery`: solo un `?code=…` indistinguible de cualquier otro acceso.
 *
 * Por eso la señal fuerte es la RUTA: el correo apunta a `/restablecer`, que no
 * existe para ningún otro flujo. El resto de comprobaciones cubren el flujo
 * implícito y los proyectos con la URL de redirección todavía sin configurar.
 */

/** Ruta a la que apunta el enlace del correo. */
export const RUTA_RECUPERACION = '/restablecer';

function leerUrl() {
  const { pathname, hash, search } = window.location;
  const enHash = new URLSearchParams(hash.replace(/^#/, ''));
  const enQuery = new URLSearchParams(search);
  const dato = (k: string) => enHash.get(k) ?? enQuery.get(k);

  const activo = pathname.startsWith(RUTA_RECUPERACION) || dato('type') === 'recovery';

  // Cuando el enlace ya caducó o se usó, Supabase no crea sesión: redirige con
  // el motivo en la URL. Sin leerlo aquí, la pantalla mostraría un formulario
  // que iba a fallar al guardar en vez de decir "pide otro enlace".
  const error = dato('error_description') ?? dato('error');

  return { activo, error: activo ? error : null };
}

export const enlaceRecuperacion = leerUrl();

/**
 * Deja la barra de direcciones limpia. El token de recuperación viaja en la URL
 * y ésta acaba en el historial, en la lista de "pestañas recientes" y en
 * cualquier captura de pantalla: se borra en cuanto la sesión ya está en
 * memoria y no hace falta volver a leerlo.
 */
export function limpiarUrlRecuperacion() {
  window.history.replaceState({}, '', RUTA_RECUPERACION);
}

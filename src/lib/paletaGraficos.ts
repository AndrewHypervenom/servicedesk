/**
 * Paleta categórica para gráficos.
 *
 * Los dos juegos pasan las seis comprobaciones del validador de paletas
 * (banda de luminosidad, croma mínima, separación bajo daltonismo, umbral de
 * visión normal y contraste contra la superficie). No cambiar un color sin
 * volver a pasar el validador: la anterior fallaba tres de las seis, y lo más
 * grave era que el rojo #ff453a y el verde #0a9038 daban ΔE 6,2 en protanopía,
 * o sea indistinguibles para quien tiene ese tipo de daltonismo.
 *
 * El modo oscuro NO es el claro aclarado: son pasos elegidos y validados
 * aparte contra la superficie oscura.
 */
export const PALETA_CLARO = [
  '#0a9038', // verde corporativo (paso oscuro, para que contraste sobre blanco)
  '#B33D9E', // magenta corporativo
  '#1d6fd4',
  '#b46a00',
  '#6b4bc4',
  '#00918a',
] as const;

export const PALETA_OSCURO = [
  '#17a94f',
  '#b8579f',
  '#3d84d6',
  '#c2841f',
  '#8a6fd0',
  '#25a398',
] as const;

/**
 * Colores de estado, reservados. No se reutilizan como "serie 4": si un color
 * significa "crítico" en un gráfico y "portátiles" en el de al lado, deja de
 * significar nada. Van siempre acompañados de etiqueta, nunca color a solas.
 */
export const ESTADO = {
  bien: '#0a9038',
  aviso: '#b46a00',
  serio: '#c2410c',
  critico: '#b3261e',
} as const;

export function paletaPara(oscuro: boolean): readonly string[] {
  return oscuro ? PALETA_OSCURO : PALETA_CLARO;
}

/**
 * Asigna color por identidad de la categoría, no por su posición en el array
 * ya ordenado. Si se indexara por rank, al filtrar y cambiar el orden los
 * colores saltarían de una categoría a otra y el gráfico mentiría entre dos
 * lecturas consecutivas.
 */
export function colorPorClave(clave: string, claves: readonly string[], oscuro: boolean): string {
  const paleta = paletaPara(oscuro);
  const i = claves.indexOf(clave);
  return paleta[(i < 0 ? 0 : i) % paleta.length];
}

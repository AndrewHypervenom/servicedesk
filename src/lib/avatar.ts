/**
 * Foto de perfil: del archivo que elige la persona al cuadrado pequeño que se
 * guarda.
 *
 * El recorte y el reescalado se hacen aquí, en el navegador, y no en el
 * servidor: la foto se pinta a 32 px en la barra superior y a 24 px en la de
 * presencia, así que subir los 4 MB que salen de un celular sería pagar por
 * mover un archivo que nadie va a ver a ese tamaño. Además el avatar viaja en
 * cada latido de presencia por realtime, y ahí el peso sí se nota.
 *
 * Se recorta al centro en cuadrado porque el avatar SIEMPRE se pinta redondo:
 * si se guardara la foto entera, un retrato vertical llegaría aplastado.
 */

/** Lado del cuadrado que se guarda. Suficiente para pantallas de alta densidad. */
const LADO = 256;

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function esImagenValida(file: File): boolean {
  return /^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type);
}

/** Recorta al centro, reescala a 256×256 y devuelve un JPEG. */
export async function prepararAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const lado = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - lado) / 2;
    const sy = (bitmap.height - lado) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = LADO;
    canvas.height = LADO;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    // El fondo blanco importa: un PNG con transparencia sobre JPEG saldría
    // negro, y una foto de perfil en negativo no se parece a nadie.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, LADO, LADO);
    ctx.drawImage(bitmap, sx, sy, lado, lado, 0, 0, LADO, LADO);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85);
    });
  } finally {
    bitmap.close();
  }
}

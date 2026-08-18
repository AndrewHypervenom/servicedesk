/**
 * Envoltorio del worker: lee el archivo a un ArrayBuffer y transfiere el buffer
 * (sin copiarlo) al worker. Si el entorno no soporta workers, parsea en el hilo
 * principal como último recurso: bloquea, pero funciona.
 */

import { parseArchivoDesdeBuffer, type LibroLineas } from './base';

export async function leerArchivoEnWorker(file: File): Promise<LibroLineas> {
  const buf = await file.arrayBuffer();

  let worker: Worker;
  try {
    worker = new Worker(new URL('./leerArchivo.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return parseArchivoDesdeBuffer(buf, file.name);
  }

  return new Promise<LibroLineas>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ ok: true; libro: LibroLineas } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.libro);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'No se pudo leer el archivo'));
    };
    worker.postMessage({ buf, nombre: file.name }, [buf]);
  });
}

/**
 * Envoltorio del worker de lectura del Excel.
 *
 * Lee el archivo a un ArrayBuffer (rápido y asíncrono) y delega el parseo
 * pesado al Web Worker, transfiriendo el buffer para no copiarlo. Si el entorno
 * no soporta workers, cae al parseo en el hilo principal como último recurso.
 */

import { parseLibroDesdeBuffer, type LibroBase } from './base';

export async function leerLibroEnWorker(file: File, hoja?: string): Promise<LibroBase> {
  const buf = await file.arrayBuffer();

  let worker: Worker;
  try {
    worker = new Worker(new URL('./leerLibro.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    // Sin soporte de workers: parseo en el hilo principal (bloquea, pero funciona).
    return parseLibroDesdeBuffer(buf, file.name, hoja);
  }

  return new Promise<LibroBase>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ ok: true; libro: LibroBase } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.libro);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'No se pudo leer el archivo'));
    };
    worker.postMessage({ buf, nombre: file.name, hoja }, [buf]);
  });
}

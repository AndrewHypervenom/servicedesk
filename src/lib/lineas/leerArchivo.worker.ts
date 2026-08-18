/**
 * Worker que parsea el archivo de líneas fuera del hilo principal.
 *
 * Mismo motivo que en la carga de la planta: `XLSX.read` es síncrono y con un
 * libro grande congela la interfaz varios segundos, justo mientras la pantalla
 * está animando el "estamos leyendo tu archivo".
 */

import { parseArchivoDesdeBuffer } from './base';

interface Peticion { buf: ArrayBuffer; nombre: string }

self.onmessage = (e: MessageEvent<Peticion>) => {
  const { buf, nombre } = e.data;
  try {
    const libro = parseArchivoDesdeBuffer(buf, nombre);
    (self as unknown as Worker).postMessage({ ok: true, libro });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message });
  }
};

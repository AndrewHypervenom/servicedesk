/**
 * Worker que parsea el Excel fuera del hilo principal.
 *
 * `XLSX.read` es una operación síncrona y pesada: con la base real (miles de
 * filas) bloquea el hilo de la interfaz varios segundos, y durante ese rato las
 * animaciones de framer-motion se congelan. Moviéndolo aquí, el hilo principal
 * queda libre para animar mientras el archivo se lee en segundo plano.
 */

import { parseLibroDesdeBuffer } from './base';

interface Peticion { buf: ArrayBuffer; nombre: string; hoja?: string }

self.onmessage = (e: MessageEvent<Peticion>) => {
  const { buf, nombre, hoja } = e.data;
  try {
    const libro = parseLibroDesdeBuffer(buf, nombre, hoja);
    (self as unknown as Worker).postMessage({ ok: true, libro });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message });
  }
};

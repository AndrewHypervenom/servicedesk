import QRCode from 'qrcode';
import type { Equipo } from '@/types';

export async function equipoQrDataUrl(codigo: string, size = 320): Promise<string> {
  return QRCode.toDataURL(codigo, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

export async function imprimirEtiquetaQr(equipo: Equipo) {
  const url = await equipoQrDataUrl(equipo.codigo_qr, 260);
  const w = window.open('', '_blank', 'width=420,height=560');
  if (!w) return;
  w.document.write(`
    <html><head><title>${equipo.codigo_qr}</title>
    <style>
      *{font-family:-apple-system,Segoe UI,sans-serif;box-sizing:border-box}
      body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff}
      .label{width:300px;border:2px solid #111;border-radius:16px;padding:18px;text-align:center}
      .brand{font-size:11px;letter-spacing:1px;color:#10D451;font-weight:700}
      img{width:220px;height:220px}
      .code{font-size:20px;font-weight:800;margin-top:6px;letter-spacing:1px}
      .row{font-size:12px;color:#333;margin-top:2px}
      .muted{color:#888;font-size:10px;margin-top:8px}
      @media print{ @page{ margin:8mm } }
    </style></head>
    <body onload="window.print()">
      <div class="label">
        <div class="brand">POSITIVO S+ · SERVICE DESK</div>
        <img src="${url}"/>
        <div class="code">${equipo.codigo_qr}</div>
        <div class="row"><b>${equipo.marca} ${equipo.linea_modelo}</b></div>
        <div class="row">S/N: ${equipo.serial}</div>
        <div class="muted">Escanee para ver la trazabilidad del equipo</div>
      </div>
    </body></html>`);
  w.document.close();
}

export async function descargarQr(equipo: Equipo) {
  const url = await equipoQrDataUrl(equipo.codigo_qr, 640);
  const a = document.createElement('a');
  a.href = url; a.download = `QR_${equipo.codigo_qr}.png`; a.click();
}

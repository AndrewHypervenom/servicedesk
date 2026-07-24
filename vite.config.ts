import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Sello de esta compilación. El mismo valor viaja en dos sitios: incrustado en
// el bundle (`__BUILD_ID__`, lo que la pestaña está ejecutando) y en el archivo
// estático `version.json` (lo que el servidor tiene publicado ahora mismo). El
// detector compara uno con otro; si difieren, hay despliegue nuevo.
const buildId = new Date().toISOString();

function selloDeVersion(): Plugin {
  return {
    name: 'sello-de-version',
    apply: 'build',
    generateBundle() {
      // Sale a la raíz del sitio (junto a index.html) sin hash en el nombre:
      // tiene que ser una URL fija que el navegador pueda pedir siempre.
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), selloDeVersion()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          pdf: ['jspdf', 'jspdf-autotable'],
          xlsx: ['xlsx'],
          qr: ['qrcode', '@zxing/browser', '@zxing/library'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});

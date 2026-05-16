import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ],
  resolve: {
    alias: {
      // Sub-fase 14.4.6: silenciar warning Vite "Module 'stream' externalized
      // for browser compat" que xlsx-js-style dispara em dev. Stub vazio
      // (src/lib/stream-stub.ts) — o code path real nunca executa no browser.
      stream: path.resolve(__dirname, 'src/lib/stream-stub.ts'),
    },
  },
  server: {
    host: true,
    https: false,
    headers: {
      'Permissions-Policy': 'camera=*, microphone=*',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['lucide-react', 'react-hot-toast'],
          'chart-vendor': ['recharts'],
          'file-vendor': ['xlsx'],
          'date-vendor': ['date-fns'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
    // Sub-fase 14.21: bump 600→1000kB pra silenciar warning informativo.
    // 2 chunks excedem 600kB (index ~880kB, xlsx ~870kB) — não bloqueia
    // funcionalidade nem perf prod (gzip reduz ~70%). Code splitting real
    // via React.lazy() fica pra refator maior (não é quick win).
    chunkSizeWarningLimit: 1000,
  },
});

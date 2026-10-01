import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'node:path';

/**
 * ETIQUETA DA VERSÃO (01/10/2026). Cada build ganha uma etiqueta única, gravada no bundle
 * (`__VERSAO_DO_APP__`) e publicada em `/version.json`. As telas do funcionário comparam as duas e
 * se recarregam sozinhas quando sai versão nova (ver useAtualizacaoAutomatica).
 *
 * Por quê: o Safari do iPhone guarda a aba aberta e não busca a página de novo. Em 01/10 o
 * Washington bateu ponto às 02:08 numa tela de ANTES de 30/09 — o servidor já exigia o PIN pro
 * rosto, a tela velha não mandava, e ela disse "Não foi possível acessar a câmera".
 */
const VERSAO_DO_APP = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 12)}-${Date.now()}`;

function etiquetaDaVersao(): Plugin {
  const corpo = JSON.stringify({ versao: VERSAO_DO_APP });
  return {
    name: 'etiqueta-da-versao',
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(corpo);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: corpo });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __VERSAO_DO_APP__: JSON.stringify(VERSAO_DO_APP),
  },
  plugins: [
    react(),
    etiquetaDaVersao(),
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
    /**
     * WSL + projeto no disco do Windows (/mnt/c): o watcher NÃO recebe os avisos de
     * alteração do arquivo, porque o inotify do Linux não atravessa o 9p do /mnt.
     * Resultado: você salva, o Vite não recompila, e o navegador continua servindo o
     * PACOTE VELHO. Em 05/08/2026 isso enganou o desenvolvimento CINCO vezes num dia —
     * teste "falhando" por código que já estava consertado, e "consertos" que na verdade
     * não tinham subido.
     *
     * `usePolling` faz o Vite PERGUNTAR pelos arquivos em vez de esperar o aviso. Custa um
     * pouco de CPU, então só liga onde o problema existe: projeto rodando em /mnt/*.
     * Em Linux nativo, Mac, Windows puro e no build de produção, nada muda.
     */
    watch: process.cwd().startsWith('/mnt/')
      ? { usePolling: true, interval: 300 }
      : undefined,
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

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_API_URL || 'http://localhost:4000';

  return {
    plugins: [react()],

    server: {
      port: 5173,
      // Used when VITE_API_URL is left empty locally: the browser then talks to
      // a single origin and dev does not depend on the API's CORS allow-list.
      // With VITE_API_URL set, axios calls the API directly and this is unused.
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },

    preview: {
      port: 4173,
    },

    build: {
      outDir: 'dist',
      // Source maps are uploaded nowhere and would expose application source to
      // anyone loading the site.
      sourcemap: false,
      target: 'es2022',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Split the large, rarely-changing dependencies into their own chunks
          // so an app-code deploy does not invalidate the whole cached bundle.
          // Written as a function rather than the object form because Rollup 4
          // types the object form as a ManualChunksFunction only.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('lucide-react')) return 'icons';
            if (/node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
              return 'react';
            }
            return undefined;
          },
        },
      },
    },
  };
});

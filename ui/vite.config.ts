import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const envApiBase = (env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  const apiBaseUrl = envApiBase
    ? envApiBase.endsWith('/api')
      ? envApiBase
      : `${envApiBase}/api`
    : 'http://localhost:8080/api';
  const proxyTarget = apiBaseUrl.replace(/\/api$/, '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          secure: true,
          changeOrigin: true,
        },
      },
    },
  };
});

import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawApiBase = (env.API_BASE_URL || 'http://localhost:8080/api').trim().replace(/\/+$/, '');
  const apiBaseUrl = rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`;
  const apiToken = (env.API_TOKEN || '').trim();

  const parsedApiBase = new URL(apiBaseUrl);
  const proxyTarget = `${parsedApiBase.protocol}//${parsedApiBase.host}`;
  const proxyBasePath = parsedApiBase.pathname.replace(/\/+$/, '') || '/api';

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
          rewrite: (path) => path.replace(/^\/api/, proxyBasePath),
          ...(apiToken ? { headers: { 'X-API-Token': apiToken } } : {}),
        },
      },
    },
  };
});

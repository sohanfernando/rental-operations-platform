import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  const { API_PORT = '3000' } = loadEnv(mode, repositoryRoot, 'API_PORT');

  return {
    plugins: [react()],
    server: {
      strictPort: true,
      proxy: {
        '/api/v1': `http://127.0.0.1:${API_PORT}`,
      },
    },
  };
});

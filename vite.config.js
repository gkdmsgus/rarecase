import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHandler } from './server/app.js';

// 개발 서버에 같은 API·영상 처리를 붙인다 (프록시·두 번째 프로세스 없음)
function rarecaseApi() {
  return {
    name: 'rarecase-api',
    configureServer(server) {
      const handle = createHandler();
      server.middlewares.use((req, res, next) => handle(req, res, next));
    },
    configurePreviewServer(server) {
      const handle = createHandler();
      server.middlewares.use((req, res, next) => handle(req, res, next));
    },
  };
}

export default defineConfig({
  plugins: [react(), rarecaseApi()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});

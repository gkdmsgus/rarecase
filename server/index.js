// 배포 모드: npm run build 후 npm start. dist 정적 파일 + API + 영상을 한 서버로.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHandler } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('dist/index.html not found. Run: npm run build');
  process.exit(1);
}

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const handle = createHandler({ distDir });
http.createServer((req, res) => handle(req, res)).listen(port, host, () => {
  console.log(`RareCase on http://${host}:${port}`);
});

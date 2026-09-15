// RareCase 요청 처리. 개발 때는 Vite 서버 미들웨어로, 배포 때는 server/index.js가 그대로 쓴다.
//
//  GET /api/health                → { ok: true }
//  GET  /api/cases                → 승인·형식 검사를 통과한 케이스만, 정답 정보를 뺀 형태 + 숨긴 케이스 id·사유 (원칙 4)
//  POST /api/grade                → { caseId, finding, dx, asked } 를 서버에서 채점, 정답·근거는 이때만 보냄
//  GET  /data/<dataset>/<file>.png → 저장소 밖 DATA_ROOT의 영상. 노출 허용 데이터셋만 (원칙 7·8)
//  그 밖                           → 배포 모드면 dist 정적 파일, 없으면 next()
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import CASES from '../src/lib/cases.js';
import { partitionCases } from '../src/lib/case-schema.js';
import { createCaseBook } from './public-case.js';

const MAX_BODY = 16 * 1024;

function readJson(req) {
  return new Promise((resolve) => {
    const type = String(req.headers['content-type'] || '');
    if (!/^application\/json\b/i.test(type)) return resolve({ status: 415, error: 'content-type must be application/json' });
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY) { done = true; resolve({ status: 413, error: 'body too large' }); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      try { resolve({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); }
      catch { resolve({ status: 400, error: 'invalid json' }); }
    });
    req.on('error', () => { if (!done) { done = true; resolve({ status: 400, error: 'read error' }); } });
  });
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 학습자 화면 노출이 라이선스로 허용된 데이터셋만 (docs/data-plan.md)
export const DISPLAY_DATASETS = ['rsna-pneumonia', 'nih-cxr14'];

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj));

// base 안에 있는 실제 파일 경로만 돌려준다. 벗어나면 null
function resolveInside(base, rel) {
  let decoded;
  try { decoded = decodeURIComponent(rel); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(base, '.' + path.sep + decoded);
  const r = path.relative(base, full);
  if (r.startsWith('..') || path.isAbsolute(r)) return null;
  return full;
}

export function createHandler({
  dataRoot = process.env.RARECASE_DATA || 'C:\\rarecase-data',
  distDir = null,
  cases = CASES,
  // 선택지 id·순서를 정하는 비밀값. 없으면 서버를 켤 때마다 새로 만듦(재시작하면 id가 바뀜)
  secret = process.env.RARECASE_SECRET || crypto.randomBytes(24).toString('base64url'),
  log = console,
} = {}) {
  const resolvedData = path.resolve(dataRoot);
  const insideRepo = !path.relative(REPO, resolvedData).startsWith('..') && !path.isAbsolute(path.relative(REPO, resolvedData));
  if (insideRepo) throw new Error('DATA_ROOT must be outside the repository (principle 7): ' + resolvedData);

  const { visible, hidden } = partitionCases(cases);
  hidden.filter((h) => h.reason === 'invalid').forEach((h) => log.warn('[RareCase] approved case hidden for schema errors:', h.id, h.errors));
  const book = createCaseBook(visible, secret);
  const casesBody = JSON.stringify({ cases: book.publicCases, hidden: hidden.map(({ id, reason }) => ({ id, reason })) });

  return function handle(req, res, next = () => json(res, 404, { error: 'not found' })) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (p === '/api/grade') {
      if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
      return readJson(req).then((r) => {
        if (r.error) return json(res, r.status, { error: r.error });
        const g = book.grade(r.body);
        if (!g.ok) return json(res, g.status, { error: g.error });
        return send(res, 200, JSON.stringify(g.result), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
      });
    }

    if (p.startsWith('/api/') || p.startsWith('/data/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
    }

    if (p === '/api/health') return json(res, 200, { ok: true });
    if (p === '/api/cases') return send(res, 200, casesBody, 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
    if (p.startsWith('/api/')) return json(res, 404, { error: 'not found' });

    if (p.startsWith('/data/')) {
      const m = /^\/data\/([a-z0-9-]+)\/(.+)$/.exec(p);
      if (!m || !DISPLAY_DATASETS.includes(m[1])) return json(res, 404, { error: 'not found' });
      if (path.extname(m[2]).toLowerCase() !== '.png') return json(res, 404, { error: 'not found' });
      const base = path.join(resolvedData, m[1]);
      const file = resolveInside(base, m[2]);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file).pipe(res);
    }

    if (distDir && (req.method === 'GET' || req.method === 'HEAD')) {
      const rel = p === '/' ? 'index.html' : p.slice(1);
      let file = resolveInside(distDir, rel);
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(distDir, 'index.html');
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return send(res, 200, fs.readFileSync(file), type);
    }
    return next();
  };
}

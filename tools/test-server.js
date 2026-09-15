// server/app.js 시험. 실행: node tools/test-server.js
// 원칙 4(미승인 케이스는 응답에 없음), 7(영상은 저장소 밖), 8(노출 허용 데이터셋만), 경로 탈출 차단
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../server/app.js';
import CASES from '../src/lib/cases.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-server-test-'));
const dataRoot = path.join(tmp, 'data');
const distDir = path.join(tmp, 'dist');
fs.mkdirSync(path.join(dataRoot, 'rsna-pneumonia', 'png'), { recursive: true });
fs.mkdirSync(path.join(dataRoot, 'physionet'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
fs.writeFileSync(path.join(dataRoot, 'rsna-pneumonia', 'png', 'a.png'), PNG);
fs.writeFileSync(path.join(dataRoot, 'rsna-pneumonia', 'labels.json'), '{"secret":1}');
fs.writeFileSync(path.join(dataRoot, 'physionet', 'b.png'), PNG);
fs.writeFileSync(path.join(tmp, 'outside.png'), PNG);
fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><div id=root></div>');
fs.writeFileSync(path.join(distDir, 'assets', 'app.js'), 'console.log(1)');

let passed = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); passed++; results.push('PASS ' + name); }
  catch (e) { results.push('FAIL ' + name + ' - ' + e.message); process.exitCode = 1; }
};

function serve(handler) {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => handler(req, res));
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}
// 경로를 정규화하지 않고 그대로 보낸다 (fetch는 ../를 미리 접어 버림)
function raw(server, method, p) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path: p }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const warns = [];
const log = { warn: (...a) => warns.push(a.join(' ')) };
const api = await serve(createHandler({ dataRoot, distDir: null, log }));

await test('GET /api/cases returns only approved, valid cases', async () => {
  const r = await raw(api, 'GET', '/api/cases');
  assert.strictEqual(r.status, 200);
  const j = JSON.parse(r.body);
  assert.deepStrictEqual(j.cases.map((c) => c.id), ['RC-014', 'RC-033']);
  assert.deepStrictEqual(j.hidden, [{ id: 'RC-021', reason: 'unapproved' }, { id: 'RC-047', reason: 'unapproved' }]);
});

await test('draft case content never leaves the server (principle 4)', async () => {
  const body = (await raw(api, 'GET', '/api/cases')).body.toString();
  assert.ok(!body.includes('발열 · 화농성 객담'), 'RC-021 chief complaint leaked');
  assert.ok(!body.includes('건강검진'), 'RC-047 chief complaint leaked');
  assert.ok(!body.includes('"errors"'));
});

await test('approved-but-invalid case is withheld and logged', async () => {
  const broken = JSON.parse(JSON.stringify(CASES.find((c) => c.id === 'RC-014')));
  broken.id = 'RC-999'; broken.who = 'BROKEN-MARKER'; broken.findings[1].correct = true;
  const s = await serve(createHandler({ dataRoot, cases: [...CASES, broken], log }));
  const body = (await raw(s, 'GET', '/api/cases')).body.toString();
  s.close();
  assert.ok(!body.includes('BROKEN-MARKER'));
  assert.ok(body.includes('"id":"RC-999","reason":"invalid"'));
  assert.ok(warns.some((w) => w.includes('RC-999')));
});

await test('health and unknown api', async () => {
  assert.strictEqual((await raw(api, 'GET', '/api/health')).status, 200);
  assert.strictEqual((await raw(api, 'GET', '/api/nope')).status, 404);
  assert.strictEqual((await raw(api, 'POST', '/api/cases')).status, 405);
});

await test('serves png from allowed dataset, HEAD too', async () => {
  const r = await raw(api, 'GET', '/data/rsna-pneumonia/png/a.png');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.type, 'image/png');
  assert.deepStrictEqual(r.body, PNG);
  const h = await raw(api, 'HEAD', '/data/rsna-pneumonia/png/a.png');
  assert.strictEqual(h.status, 200);
  assert.strictEqual(h.body.length, 0);
});

await test('dataset not licensed for display is refused (principle 8)', async () => {
  assert.strictEqual((await raw(api, 'GET', '/data/physionet/b.png')).status, 404);
});

await test('non-png files in data root are refused', async () => {
  assert.strictEqual((await raw(api, 'GET', '/data/rsna-pneumonia/labels.json')).status, 404);
});

for (const p of [
  '/data/rsna-pneumonia/../outside.png',
  '/data/rsna-pneumonia/../../outside.png',
  '/data/rsna-pneumonia/%2e%2e/%2e%2e/outside.png',
  '/data/rsna-pneumonia/..%2f..%2foutside.png',
  '/data/rsna-pneumonia/..%5c..%5coutside.png',
  '/data/rsna-pneumonia/png/a.png%00.png',
  '/data/rsna-pneumonia/%E0%A4%A.png',
  '/data/rsna-pneumonia/png/missing.png',
]) {
  await test('blocked or missing: ' + p, async () => {
    const r = await raw(api, 'GET', p);
    assert.strictEqual(r.status, 404, 'status ' + r.status);
    assert.ok(!r.body.equals(PNG) || p.endsWith('missing.png'));
  });
}

await test('DATA_ROOT inside repository is rejected at startup (principle 7)', async () => {
  assert.throws(() => createHandler({ dataRoot: path.join(REPO, 'data'), log }), /principle 7/);
  assert.throws(() => createHandler({ dataRoot: REPO, log }), /principle 7/);
});

const web = await serve(createHandler({ dataRoot, distDir, log }));
await test('dist: static files and SPA fallback', async () => {
  const js = await raw(web, 'GET', '/assets/app.js');
  assert.strictEqual(js.status, 200);
  assert.match(js.type, /javascript/);
  const deep = await raw(web, 'GET', '/some/route');
  assert.match(deep.body.toString(), /id=root/);
});
await test('dist: traversal falls back to index, never reads outside', async () => {
  for (const p of ['/../outside.png', '/%2e%2e/outside.png', '/..%5coutside.png']) {
    const r = await raw(web, 'GET', p);
    assert.ok(!r.body.equals(PNG), p);
  }
});
await test('dist mode still serves api', async () => {
  assert.strictEqual((await raw(web, 'GET', '/api/cases')).status, 200);
});

api.close(); web.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: ALL ' + passed + ' PASS');

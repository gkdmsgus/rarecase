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
import { gradeAttempt } from '../src/lib/grading.js';

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
function raw(server, method, p, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}
const post = (server, obj, headers = { 'Content-Type': 'application/json' }) =>
  raw(server, 'POST', '/api/grade', typeof obj === 'string' ? obj : JSON.stringify(obj), headers)
    .then((r) => ({ ...r, json: (() => { try { return JSON.parse(r.body); } catch { return null; } })() }));

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

// ── 채점 전 응답에 정답이 새지 않는지 ──────────────────────────
const pub = JSON.parse((await raw(api, 'GET', '/api/cases')).body);
const pubBody = JSON.stringify(pub);
const originals = CASES.filter((c) => pub.cases.some((p) => p.id === c.id));

await test('no answer fields in /api/cases (correct, answer, feedback, missed, question key)', async () => {
  const keys = new Set();
  JSON.parse(pubBody, (k, v) => { keys.add(k); return v; });
  for (const k of ['correct', 'answer', 'feedback', 'missed', 'cite']) assert.ok(!keys.has(k), 'field ' + k + ' present');
  // orders[].key(검사 종류 식별자 'cxr' 등)는 정답과 무관. 문진의 key(핵심 질문 표시)만 없어야 함
  for (const c of pub.cases) c.questions.forEach((q) => assert.deepStrictEqual(Object.keys(q).sort(), ['a', 'q']));
  for (const c of pub.cases) [...c.findings, ...c.diagnoses].forEach((o) => assert.deepStrictEqual(Object.keys(o).sort(), ['id', 'text']));
});

await test('no answer text in /api/cases (feedback sentences, citations, answer text)', async () => {
  for (const c of originals) {
    for (const p of c.feedback) {
      assert.ok(!pubBody.includes(p.cite.text), 'citation leaked: ' + p.cite.text);
      assert.ok(!pubBody.includes(p.t.slice(0, 20)), 'feedback leaked');
    }
    assert.ok(!pubBody.includes(c.missed.t.slice(0, 20)), 'missed text leaked');
    // 정답 진단 문구는 선택지로는 나오지만 answer 필드로 따로 나오면 안 됨 → 선택지 텍스트 출현 횟수 1회
    assert.strictEqual(pubBody.split(JSON.stringify(c.answer)).length - 1, 1, 'answer text appears outside options: ' + c.id);
  }
});

await test('option ids are opaque (not f1/d1) and unique', async () => {
  for (const c of pub.cases) {
    const ids = [...c.findings, ...c.diagnoses].map((o) => o.id);
    ids.forEach((id) => assert.match(id, /^[fd]_[A-Za-z0-9_-]{12}$/));
    assert.strictEqual(new Set(ids).size, ids.length);
    const orig = CASES.find((o) => o.id === c.id);
    ids.forEach((id) => assert.ok(![...orig.findings, ...orig.diagnoses].some((o) => o.id === id)));
  }
});

await test('options are a permutation of the originals (same texts, nothing added or lost)', async () => {
  for (const c of pub.cases) {
    const orig = CASES.find((o) => o.id === c.id);
    assert.deepStrictEqual(c.findings.map((o) => o.text).sort(), orig.findings.map((o) => o.text).sort());
    assert.deepStrictEqual(c.diagnoses.map((o) => o.text).sort(), orig.diagnoses.map((o) => o.text).sort());
  }
});

await test('same secret → same ids and order; different secret → different ids', async () => {
  const s1 = await serve(createHandler({ dataRoot, secret: 'a'.repeat(32), log }));
  const s2 = await serve(createHandler({ dataRoot, secret: 'a'.repeat(32), log }));
  const s3 = await serve(createHandler({ dataRoot, secret: 'b'.repeat(32), log }));
  const get = async (s) => JSON.parse((await raw(s, 'GET', '/api/cases')).body).cases.map((c) => c.findings.map((o) => o.id));
  const [a, b, c] = [await get(s1), await get(s2), await get(s3)];
  s1.close(); s2.close(); s3.close();
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
});

await test('correct option position is roughly uniform across secrets (400 secrets, each slot 15-35%)', async () => {
  const { createCaseBook } = await import('../server/public-case.js');
  const N = 400;
  const pos = {};
  for (let i = 0; i < N; i++) {
    const book = createCaseBook(originals, 'secret-number-' + String(i).padStart(6, '0'));
    for (const pc of book.publicCases) {
      const oc = originals.find((c) => c.id === pc.id);
      for (const kind of ['findings', 'diagnoses']) {
        const idx = pc[kind].findIndex((o) => o.text === oc[kind].find((x) => x.correct).text);
        (pos[pc.id + kind] = pos[pc.id + kind] || Array(pc[kind].length).fill(0))[idx]++;
      }
    }
  }
  for (const [k, v] of Object.entries(pos)) v.forEach((n) => assert.ok(n / N >= 0.15 && n / N <= 0.35, k + ' ' + v));
});

await test('short secret rejected at startup', async () => {
  assert.throws(() => createHandler({ dataRoot, secret: 'short', log }), /secret/);
});

// ── 서버 채점이 원래 채점 함수와 모든 조합에서 같은지 ─────────────
await test('POST /api/grade matches gradeAttempt for every finding x diagnosis combination', async () => {
  for (const pc of pub.cases) {
    const oc = CASES.find((o) => o.id === pc.id);
    const origId = (list, text) => list.find((o) => o.text === text).id;
    for (const f of pc.findings) {
      for (const d of pc.diagnoses) {
        const r = await post(api, { caseId: pc.id, finding: f.id, dx: d.id, asked: [] });
        assert.strictEqual(r.status, 200, JSON.stringify(r.json));
        const expect = gradeAttempt(oc, { finding: origId(oc.findings, f.text), dx: origId(oc.diagnoses, d.text), asked: [] });
        assert.strictEqual(r.json.verdict, expect.verdict, pc.id + ' ' + f.text + ' / ' + d.text);
        assert.strictEqual(r.json.findingOk, expect.findingOk);
        assert.strictEqual(r.json.dxOk, expect.dxOk);
        assert.strictEqual(pc.findings.find((o) => o.id === r.json.correctFinding).text, expect.correctFinding.text);
        assert.strictEqual(pc.diagnoses.find((o) => o.id === r.json.correctDx).text, expect.correctDx.text);
        assert.strictEqual(r.json.answer, oc.answer);
        assert.deepStrictEqual(r.json.feedback, oc.feedback);
        assert.deepStrictEqual(r.json.missed, oc.missed);
      }
    }
  }
});

await test('grade: missed key questions from asked list; unknown asked strings ignored', async () => {
  const pc = pub.cases.find((c) => c.id === 'RC-014');
  const [f, d] = [pc.findings[0].id, pc.diagnoses[0].id];
  const none = await post(api, { caseId: 'RC-014', finding: f, dx: d, asked: [] });
  assert.deepStrictEqual(none.json.missedKeyQuestions, ['코피가 자주 나는 편인가요?', '가족 중에 비슷한 증상이 있나요?']);
  const fake = await post(api, { caseId: 'RC-014', finding: f, dx: d, asked: ['코피가 자주 나는 편인가요? ', 'made up'] });
  assert.strictEqual(fake.json.missedKeyQuestions.length, 2);
  const all = await post(api, { caseId: 'RC-014', finding: f, dx: d, asked: pc.questions.map((q) => q.q) });
  assert.deepStrictEqual(all.json.missedKeyQuestions, []);
  assert.strictEqual(all.headers['cache-control'], 'no-store');
});

await test('grade: hidden or unknown case → 404, no content', async () => {
  const pc = pub.cases[0];
  for (const caseId of ['RC-021', 'RC-047', 'RC-999', '', 42, null]) {
    const r = await post(api, { caseId, finding: pc.findings[0].id, dx: pc.diagnoses[0].id });
    assert.strictEqual(r.status, 404, String(caseId));
    assert.ok(!r.body.toString().includes('feedback'));
  }
});

await test('grade: option from another case or original ids → 400', async () => {
  const [a, b] = pub.cases;
  assert.strictEqual((await post(api, { caseId: a.id, finding: b.findings[0].id, dx: a.diagnoses[0].id })).status, 400);
  assert.strictEqual((await post(api, { caseId: a.id, finding: 'f1', dx: 'd1' })).status, 400);
  assert.strictEqual((await post(api, { caseId: a.id, finding: a.diagnoses[0].id, dx: a.findings[0].id })).status, 400);
  assert.strictEqual((await post(api, { caseId: a.id, finding: a.findings[0].id })).status, 400);
});

await test('grade: malformed requests', async () => {
  const pc = pub.cases[0];
  const ok = { caseId: pc.id, finding: pc.findings[0].id, dx: pc.diagnoses[0].id };
  assert.strictEqual((await post(api, '{not json')).status, 400);
  assert.strictEqual((await post(api, '[]')).status, 400);
  assert.strictEqual((await post(api, 'null')).status, 400);
  assert.strictEqual((await post(api, ok, { 'Content-Type': 'text/plain' })).status, 415);
  assert.strictEqual((await post(api, { ...ok, asked: 'x' })).status, 400);
  assert.strictEqual((await post(api, { ...ok, asked: [1] })).status, 400);
  assert.strictEqual((await post(api, { ...ok, asked: Array(101).fill('q') })).status, 400);
  assert.strictEqual((await post(api, { ...ok, pad: 'x'.repeat(20000) })).status, 413);
  assert.strictEqual((await raw(api, 'GET', '/api/grade')).status, 405);
  assert.strictEqual((await raw(api, 'PUT', '/api/grade', '{}', { 'Content-Type': 'application/json' })).status, 405);
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

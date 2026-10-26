// Clinical Checkpoint 시험. 실행: node tools/test-cc.js
// 1) 처음 보내는 증례에 답변·소견·검토 기준이 없다  2) 문진은 증례 사실 범위 안에서만 답한다
// 3) Claude 응답이 범위를 벗어나거나 실패하면 규칙 엔진으로 넘어간다  4) 디브리핑 대조가 맞다  5) 잘못된 요청을 막는다
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../server/app.js';
import CASE from '../server/cc/case-headache.js';
import { publicCase, ruleAnswer, ask, debrief } from '../server/cc/engine.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const results = [];
const test = async (name, fn) => {
  try { await fn(); passed++; results.push('PASS ' + name); }
  catch (e) { results.push('FAIL ' + name + ' - ' + e.message); process.exitCode = 1; }
};
const serve = (handler) => new Promise((resolve) => { const s = http.createServer((q, r) => handler(q, r)); s.listen(0, '127.0.0.1', () => resolve(s)); });
const call = async (s, method, p, body) => {
  const r = await fetch(`http://127.0.0.1:${s.address().port}${p}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const fakeClient = (fn) => ({ messages: { parse: async (req) => fn(req) } });
const quiet = { warn() {}, log() {} };

// ── 1. 공개 정보 ─────────────────────────────────────────
await test('처음 보내는 증례에 답변·소견·검사 결과·검토 기준이 없다', () => {
  const text = JSON.stringify(publicCase(CASE));
  const secrets = [
    ...CASE.facts.map((f) => f.answer), ...CASE.exams.map((e) => e.finding), ...CASE.tests.map((t) => t.result),
    ...CASE.review.reasoning, ...CASE.review.clues.map((c) => c.text), CASE.imaging.keyRegion.label, CASE.unknownAnswer,
  ];
  secrets.forEach((s) => assert(!text.includes(s), '노출됨: ' + s.slice(0, 20)));
  ['fit', 'required', 'keyRegion', 'review', 'facts', 'clue'].forEach((k) => assert(!text.includes('"' + k + '"'), '필드 노출: ' + k));
});

await test('증례 데이터 무결성: id 중복 없음, 검토 단서가 실제로 셀 수 있는 단서', () => {
  ['facts', 'exams', 'tests'].forEach((k) => { const ids = CASE[k].map((x) => x.id); assert.strictEqual(new Set(ids).size, ids.length, k + ' id 중복'); });
  const reachable = new Set([...CASE.facts.map((f) => f.clue), ...CASE.exams.map((e) => e.clue)].filter(Boolean));
  CASE.review.clues.forEach((c) => assert(reachable.has(c.id), '확인할 방법이 없는 단서: ' + c.id));
  assert.strictEqual(CASE.reviewed, false, '검수 전 증례는 reviewed:false');
  assert(CASE.tests.some((t) => t.fit === 'required'), '필수 검사 없음');
});

await test('핀 기준 영역이 CT 도식의 밝은 영역 중심과 같다', () => {
  const src = fs.readFileSync(path.join(REPO, 'src/cc/CtViewer.jsx'), 'utf8');
  const W = Number(/const W = (\d+)/.exec(src)[1]), H = Number(/const H = (\d+)/.exec(src)[1]);
  const cyOff = Number(/const cx = W \/ 2, cy = H \/ 2 \+ (\d+)/.exec(src)[1]);
  const cisternOff = Number(/cy \+ (\d+) \+ Math\.sin\(a\) \* r/.exec(src)[1]);
  const k = CASE.imaging.keyRegion;
  assert(Math.abs(k.x - 0.5) < 0.005, 'x');
  assert(Math.abs(k.y - (H / 2 + cyOff + cisternOff) / H) < 0.005, `y ${k.y} vs ${(H / 2 + cyOff + cisternOff) / H}`);
  assert(k.r * W >= 54, '영역 반지름이 도식 바깥 반지름(54px)보다 작음');
});

// ── 2. 규칙 기반 문진 ────────────────────────────────────
const cases = [
  ['두통이 언제부터 어떻게 시작됐나요?', 'f-onset'],
  ['지금까지 겪은 두통 중에 얼마나 심한가요?', 'f-severity'],
  ['최근에 머리를 다치신 적이 있나요?', 'f-trauma'],
  ['고혈압이나 지병이 있으세요?', 'f-history'],
  ['가족 중에 뇌출혈 있었던 분 계세요?', 'f-family'],
  ['열이 나나요?', 'f-fever'],
  ['팔다리에 힘이 빠지거나 저린 곳은요?', 'f-neuro'],
];
await test('문진: 질문마다 맞는 사실을 고른다 (' + cases.length + '건)', () => {
  cases.forEach(([q, id]) => { const r = ruleAnswer(CASE, q); assert(r.factIds.includes(id), `${q} → ${r.factIds}`); });
});
await test('문진: 두 가지를 한 번에 물으면 둘 다 답한다', () => {
  const r = ruleAnswer(CASE, '토하거나 목이 뻣뻣한 느낌이 있나요?');
  assert.deepStrictEqual([...r.factIds].sort(), ['f-neck', 'f-vomit']);
});
await test('문진: 범위 밖 질문은 지어내지 않고 모른다고 답한다', () => {
  ['주말에 뭐 하셨어요?', '좋아하는 음식이 뭐예요?', 'hello'].forEach((q) => {
    const r = ruleAnswer(CASE, q);
    assert.deepStrictEqual(r.factIds, [], q); assert.strictEqual(r.answer, CASE.unknownAnswer);
  });
});
await test('문진: 답변 문장은 항상 증례 사실 문장으로만 이루어진다', () => {
  const answers = new Set(CASE.facts.map((f) => f.answer));
  [...cases.map((c) => c[0]), '토하거나 목이 뻣뻣한 느낌이 있나요?', '약 드신 거 있어요?'].forEach((q) => {
    const r = ruleAnswer(CASE, q);
    const rebuilt = r.factIds.map((id) => CASE.facts.find((f) => f.id === id).answer).join(' ');
    assert.strictEqual(r.answer, rebuilt); r.factIds.forEach((id) => assert(answers.has(CASE.facts.find((f) => f.id === id).answer)));
  });
});

// ── 3. Claude 경로와 되돌아가기 ──────────────────────────
await test('Claude: 정상 응답이면 engine=claude, 증례 사실 범위 안의 id', async () => {
  let seen = null;
  const client = fakeClient((req) => { seen = req; return { stop_reason: 'end_turn', parsed_output: { answer: '아침 8시쯤 갑자기 아팠어요.', fact_ids: ['f-onset'] } }; });
  const { result } = await ask(CASE, { question: '언제부터요?', history: [] }, { client });
  assert.strictEqual(result.engine, 'claude'); assert.deepStrictEqual(result.factIds, ['f-onset']);
  assert.strictEqual(seen.model, 'claude-opus-5-5');
  CASE.facts.forEach((f) => assert(seen.system.includes(f.answer), '시스템 프롬프트에 사실 누락: ' + f.id));
  assert(!seen.system.includes(CASE.review.reasoning[0]), '검토 기준이 프롬프트에 들어감');
});
for (const [name, fn] of [
  ['목록 밖 id', () => ({ stop_reason: 'end_turn', parsed_output: { answer: '어제 넘어졌어요', fact_ids: ['f-invented'] } })],
  ['거절', () => ({ stop_reason: 'refusal', parsed_output: null })],
  ['파싱 실패', () => ({ stop_reason: 'end_turn', parsed_output: null })],
  ['오류', () => { throw new Error('network'); }],
]) {
  await test('Claude: ' + name + '이면 규칙 엔진으로 넘어간다', async () => {
    const { result } = await ask(CASE, { question: '언제부터 시작됐나요?' }, { client: fakeClient(fn) });
    assert.strictEqual(result.engine, 'rule'); assert.deepStrictEqual(result.factIds, ['f-onset']);
  });
}
await test('문진: 빈 질문·너무 긴 질문은 거부', async () => {
  assert.strictEqual((await ask(CASE, { question: '  ' })).status, 400);
  assert.strictEqual((await ask(CASE, { question: '가'.repeat(301) })).status, 400);
});

// ── 4. 디브리핑 ──────────────────────────────────────────
await test('디브리핑: 문진·진찰로 확인한 단서를 센다 (진찰로 확인한 목 강직·국소 증상 없음 포함)', () => {
  const { result } = debrief(CASE, { factIds: ['f-onset', 'f-severity'], examIds: ['e-neck', 'e-motor'], testIds: [], pins: [] });
  const found = result.clues.filter((c) => c.found).map((c) => c.id).sort();
  assert.deepStrictEqual(found, ['c-neck', 'c-no-focal', 'c-sudden', 'c-worst']);
});
await test('디브리핑: 핀이 기준 영역 안이면 true, 밖이면 false', () => {
  const k = CASE.imaging.keyRegion;
  assert.strictEqual(debrief(CASE, { pins: [{ x: k.x, y: k.y }] }).result.imaging.pinInRegion, true);
  assert.strictEqual(debrief(CASE, { pins: [{ x: 0.1, y: 0.1 }] }).result.imaging.pinInRegion, false);
  assert.strictEqual(debrief(CASE, { pins: [{ x: 0.1, y: 0.1 }, { x: k.x + 0.05, y: k.y }] }).result.imaging.pinInRegion, true);
});
await test('디브리핑: 이상한 입력은 버린다 (문자열 아닌 id, 숫자 아닌 핀, 너무 긴 보고서)', () => {
  const { result } = debrief(CASE, { factIds: [1, null, 'f-onset'], pins: [{ x: 'a', y: 1 }, null], report: { judgement: '가'.repeat(5000) } });
  assert.strictEqual(result.clues.find((c) => c.id === 'c-sudden').found, true);
  assert.strictEqual(result.imaging.pins, 0);
  assert.strictEqual(result.report.judgement.length, 2000);
});
await test('디브리핑: 검사 적절성은 미리 정한 기준 그대로 돌려준다', () => {
  const { result } = debrief(CASE, { testIds: ['t-ct', 't-mri'] });
  const ct = result.tests.find((t) => t.id === 't-ct'), mri = result.tests.find((t) => t.id === 't-mri');
  assert(ct.ordered && ct.fit === 'required'); assert(mri.ordered && mri.fit === 'low-yield');
});

// ── 5. HTTP ──────────────────────────────────────────────
const s = await serve(createHandler({ ccClient: null, log: quiet }));
await test('HTTP: GET /api/cc/case 200, 답변 없음', async () => {
  const r = await call(s, 'GET', '/api/cc/case');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.id, 'CC-001'); assert(!JSON.stringify(r.body).includes(CASE.facts[0].answer));
});
await test('HTTP: 문진·진찰·검사·디브리핑 왕복', async () => {
  const a = await call(s, 'POST', '/api/cc/ask', { question: '언제부터 아팠어요?' });
  assert.strictEqual(a.status, 200); assert.strictEqual(a.body.engine, 'rule'); assert.deepStrictEqual(a.body.factIds, ['f-onset']);
  const e = await call(s, 'POST', '/api/cc/exam', { examId: 'e-neck' });
  assert.strictEqual(e.status, 200); assert.strictEqual(e.body.finding, CASE.exams.find((x) => x.id === 'e-neck').finding);
  const t = await call(s, 'POST', '/api/cc/test', { testId: 't-ct' });
  assert.strictEqual(t.status, 200); assert.strictEqual(t.body.imaging, true);
  const d = await call(s, 'POST', '/api/cc/debrief', { factIds: a.body.factIds, examIds: ['e-neck'], testIds: ['t-ct'], pins: [], report: { judgement: 'x' } });
  assert.strictEqual(d.status, 200); assert.strictEqual(d.body.clues.filter((c) => c.found).length, 2);
});
await test('HTTP: 없는 id 400, 잘못된 메서드 405, JSON 아님 415', async () => {
  assert.strictEqual((await call(s, 'POST', '/api/cc/exam', { examId: 'nope' })).status, 400);
  assert.strictEqual((await call(s, 'POST', '/api/cc/test', { testId: 'nope' })).status, 400);
  assert.strictEqual((await call(s, 'GET', '/api/cc/ask')).status, 405);
  assert.strictEqual((await call(s, 'POST', '/api/cc/case')).status, 405);
  const r = await fetch(`http://127.0.0.1:${s.address().port}/api/cc/ask`, { method: 'POST', body: 'x' });
  assert.strictEqual(r.status, 415);
});
await test('HTTP: 긴 보고서(대략 30 KB)는 디브리핑만 받고, 문진은 16 KB 넘으면 413', async () => {
  const big = '가'.repeat(10000);   // UTF-8 3바이트 × 10000 = 30000 바이트
  assert.strictEqual((await call(s, 'POST', '/api/cc/debrief', { report: { judgement: big } })).status, 200);
  assert.strictEqual((await call(s, 'POST', '/api/cc/ask', { question: 'x', pad: big })).status, 413);
});
await test('HTTP: Claude 클라이언트를 넣으면 그 엔진으로 답한다', async () => {
  const s2 = await serve(createHandler({ log: quiet, ccClient: fakeClient(() => ({ stop_reason: 'end_turn', parsed_output: { answer: '뒷머리가 아파요.', fact_ids: ['f-location'] } })) }));
  const r = await call(s2, 'POST', '/api/cc/ask', { question: '어디가 아파요?' });
  assert.strictEqual(r.body.engine, 'claude'); assert.deepStrictEqual(r.body.factIds, ['f-location']);
  s2.close();
});
s.close();

// ── 6. 실제 사진 (매니페스트·해시 확인) ─────────────────
await test('실제 사진: 매니페스트에 있고 해시가 맞는 파일만 보내고, 화면 정보에 출처가 붙는다', async () => {
  const os = await import('node:os'); const crypto = await import('node:crypto');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-media-'));
  fs.mkdirSync(path.join(tmp, 'cc-media'));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  fs.writeFileSync(path.join(tmp, 'cc-media', 'patient.png'), png);
  fs.writeFileSync(path.join(tmp, 'cc-media', 'ct.png'), png);
  fs.writeFileSync(path.join(tmp, 'cc-media', 'stray.png'), png);
  const sha = crypto.createHash('sha256').update(png).digest('hex');
  const base = { license: 'CC BY 4.0', author: 'A', sourceUrl: 'https://example.org/x', attribution: 'A / CC BY 4.0' };
  const manifest = path.join(tmp, 'm.json');
  fs.writeFileSync(manifest, JSON.stringify({ items: [
    { ...base, id: 'patient-photo', file: 'patient.png', sha256: sha },
    { ...base, id: 'ct', file: 'ct.png', sha256: '0'.repeat(64) },          // 해시 불일치 → 빠짐
  ] }));
  const sv = await serve(createHandler({ dataRoot: tmp, ccMediaManifest: manifest, ccClient: null, log: quiet }));
  const c = (await call(sv, 'GET', '/api/cc/case')).body;
  assert.strictEqual(c.patient.photo.url, '/data/cc-media/patient.png'); assert.strictEqual(c.patient.photo.attribution, base.attribution);
  assert.strictEqual(c.imaging.image, null, '해시가 다른 CT가 노출됨');
  const get = (u) => fetch(`http://127.0.0.1:${sv.address().port}${u}`).then((r) => r.status);
  assert.strictEqual(await get('/data/cc-media/patient.png'), 200);
  assert.strictEqual(await get('/data/cc-media/ct.png'), 404);
  assert.strictEqual(await get('/data/cc-media/stray.png'), 404);
  assert.strictEqual(await get('/data/cc-media/..%2fm.json'), 404);
  sv.close();
});
await test('실제 CT에 위치 기준(region)이 없으면 핀 위치를 대조하지 않는다', () => {
  const media = { ct: { url: '/x', region: undefined } };
  const r = debrief(CASE, { pins: [{ x: 0.5, y: 0.54 }] }, media).result.imaging;
  assert.strictEqual(r.pinInRegion, null); assert.strictEqual(r.region, null);
  const r2 = debrief(CASE, { pins: [{ x: 0.5, y: 0.5 }] }, { ct: { region: { x: 0.5, y: 0.5, r: 0.1, label: 'L' } } }).result.imaging;
  assert.strictEqual(r2.pinInRegion, true);
});
await test('사진이 없으면 일러스트·도식으로 돌아간다 (기본 매니페스트는 비어 있음)', () => {
  const pc = publicCase(CASE, {});
  assert.strictEqual(pc.patient.photo, null); assert.strictEqual(pc.imaging.image, null);
});

results.forEach((x) => console.log(x));
console.log(`\n${passed}/${results.length} passed`);

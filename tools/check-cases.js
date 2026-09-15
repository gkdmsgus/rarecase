// 케이스 데이터·스키마 검사. 실행: node tools/check-cases.js
// 1) 실제 데이터의 노출/숨김 결과
// 2) 원본 데모(docs/original-demo.html)에서 내용이 빠지거나 바뀌지 않았는지
// 3) 깨진 케이스가 실제로 숨겨지는지 (실패 모드)
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const { partitionCases, validateCase } = require(path.join(ROOT, 'case-schema.js'));
const CASES = require(path.join(ROOT, 'cases.js'));

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('PASS', name); }
  catch (e) { console.log('FAIL', name, '-', e.message); process.exitCode = 1; }
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── 1. 실제 데이터 ──────────────────────────────────────────
const { visible, hidden } = partitionCases(CASES);

test('visible cases are RC-014, RC-033', () =>
  assert.deepStrictEqual(visible.map((c) => c.id), ['RC-014', 'RC-033']));

test('drafts RC-021, RC-047 hidden as unapproved', () =>
  assert.deepStrictEqual(hidden.map((h) => [h.id, h.reason]),
    [['RC-021', 'unapproved'], ['RC-047', 'unapproved']]));

test('no approved case is invalid', () =>
  CASES.filter((c) => c.approval.status === 'approved')
    .forEach((c) => assert.deepStrictEqual(validateCase(c), [], c.id)));

test('every visible cite is still unverified (no source checked yet)', () =>
  visible.forEach((c) => c.feedback.forEach((p) =>
    assert.strictEqual(p.cite.verified, false, c.id + ' ' + p.cite.text))));

test('every visible case marked medicalReviewed=false', () =>
  visible.forEach((c) => assert.strictEqual(c.medicalReviewed, false, c.id)));

// ── 2. 원본 데모와 내용 대조 ─────────────────────────────────
const html = fs.readFileSync(path.join(ROOT, 'docs', 'original-demo.html'), 'utf8');
const start = html.indexOf('const CASES = [');
const end = html.indexOf('\n];', start);
assert(start > 0 && end > start, 'original CASES block not found');
// eslint-disable-next-line no-new-func
const ORIGINAL = new Function(html.slice(start, end + 3) + '\nreturn CASES;')();

test('same case ids and order as original', () =>
  assert.deepStrictEqual(CASES.map((c) => c.id), ORIGINAL.map((c) => c.id)));

ORIGINAL.forEach((o) => {
  const n = CASES.find((c) => c.id === o.id);
  test(o.id + ' content matches original', () => {
    ['who', 'cc', 'rarity', 'film'].forEach((k) => assert.deepStrictEqual(n[k], o[k], k));
    // 원본 active:true ⇔ 새 approval approved
    assert.strictEqual(n.approval.status === 'approved', o.active, 'active/approval');
    if (!o.active) return;
    ['intro', 'vitals', 'orders', 'findings', 'diagnoses', 'answer', 'missed']
      .forEach((k) => assert.deepStrictEqual(n[k], o[k], k));
    // 2단계에서 questions[].key가 추가됨 — 질문·답 문장만 비교
    assert.deepStrictEqual(n.questions.map((q) => [q.q, q.a]), o.questions.map((q) => [q.q, q.a]), 'questions');
    assert.deepStrictEqual({ name: n.study.name, acc: n.study.acc },
      { name: o.study.name, acc: o.study.acc }, 'study');
    assert.strictEqual(n.approval.date, o.study.approved, 'approval date');
    assert.deepStrictEqual(n.feedback.map((p) => [p.t, p.cite.text]),
      o.feedback.map((p) => [p.t, p.cite]), 'feedback');
  });
});

// ── 3. 실패 모드: 깨진 케이스는 숨겨져야 한다 ─────────────────
const base = CASES.find((c) => c.id === 'RC-014');
const mutants = {
  'approval missing': (c) => { delete c.approval; },
  'approval pending': (c) => { c.approval.status = 'pending'; },
  'approved without approver': (c) => { delete c.approval.by; },
  'two correct findings': (c) => { c.findings[1].correct = true; },
  'no correct diagnosis': (c) => { c.diagnoses[0].correct = false; },
  'answer differs from correct diagnosis': (c) => { c.answer = '폐결핵'; },
  'unknown film variant': (c) => { c.film = 'real-photo'; },
  'film missing': (c) => { c.film = null; },
  'cite as plain string (old format)': (c) => { c.feedback[0].cite = '흉부영상의학 §7.4'; },
  'cite verified missing': (c) => { delete c.feedback[0].cite.verified; },
  'no ready order': (c) => { c.orders.forEach((o) => { o.ready = false; }); },
  'medicalReviewed missing': (c) => { delete c.medicalReviewed; },
  'duplicate finding id': (c) => { c.findings[1].id = c.findings[0].id; },
};
Object.entries(mutants).forEach(([name, mutate]) => {
  test('hidden when ' + name, () => {
    const c = clone(base);
    mutate(c);
    const r = partitionCases([c]);
    assert.strictEqual(r.visible.length, 0);
    assert.strictEqual(r.hidden.length, 1);
  });
});

test('hidden when question key is not boolean', () => {
  const c = clone(base);
  c.questions[0].key = 'yes';
  assert.strictEqual(partitionCases([c]).visible.length, 0);
});

// ── 4. 채점 (2단계) ─────────────────────────────────────────
const { gradeAttempt, keyToAction } = require(path.join(ROOT, 'grading.js'));

// 핵심 문진은 근거 문장에 실제로 등장하는 질문만이어야 한다 (새 의학 내용 금지)
test('key questions per case match feedback-referenced history', () => {
  const keys = (id) => CASES.find((c) => c.id === id).questions.filter((q) => q.key).map((q) => q.q);
  assert.deepStrictEqual(keys('RC-014'), ['코피가 자주 나는 편인가요?', '가족 중에 비슷한 증상이 있나요?']);
  assert.deepStrictEqual(keys('RC-033'), ['키와 체중이 어떻게 되나요?', '흡연력이 있으신가요?']);
});

visible.forEach((c) => {
  const rf = c.findings.find((f) => f.correct).id;
  const wf = c.findings.find((f) => !f.correct).id;
  const rd = c.diagnoses.find((d) => d.correct).id;
  const wd = c.diagnoses.find((d) => !d.correct).id;
  const allQ = c.questions.map((q) => q.q);

  test(c.id + ' grade: both right = correct', () => {
    const r = gradeAttempt(c, { finding: rf, dx: rd, asked: allQ });
    assert.deepStrictEqual([r.findingOk, r.dxOk, r.verdict], [true, true, 'correct']);
    assert.deepStrictEqual(r.missedKeyQuestions, []);
  });
  test(c.id + ' grade: finding only = partial', () =>
    assert.deepStrictEqual(Object.values((({ findingOk, dxOk, verdict }) => ({ findingOk, dxOk, verdict }))(
      gradeAttempt(c, { finding: rf, dx: wd }))), [true, false, 'partial']));
  test(c.id + ' grade: dx only = partial', () =>
    assert.deepStrictEqual(Object.values((({ findingOk, dxOk, verdict }) => ({ findingOk, dxOk, verdict }))(
      gradeAttempt(c, { finding: wf, dx: rd }))), [false, true, 'partial']));
  test(c.id + ' grade: both wrong = wrong', () =>
    assert.strictEqual(gradeAttempt(c, { finding: wf, dx: wd }).verdict, 'wrong'));
  test(c.id + ' grade: every wrong finding x wrong dx combination is wrong', () =>
    c.findings.filter((f) => !f.correct).forEach((f) => c.diagnoses.filter((d) => !d.correct)
      .forEach((d) => assert.strictEqual(gradeAttempt(c, { finding: f.id, dx: d.id }).verdict, 'wrong'))));
  test(c.id + ' grade: no questions asked lists all key questions in order', () =>
    assert.deepStrictEqual(gradeAttempt(c, { finding: rf, dx: rd, asked: [] }).missedKeyQuestions,
      c.questions.filter((q) => q.key).map((q) => q.q)));
  test(c.id + ' grade: asking only non-key questions still misses key ones', () => {
    const nonKey = c.questions.filter((q) => !q.key).map((q) => q.q);
    assert.strictEqual(gradeAttempt(c, { finding: rf, dx: rd, asked: nonKey }).missedKeyQuestions.length,
      c.questions.filter((q) => q.key).length);
  });
  test(c.id + ' grade: answer text equals correct diagnosis shown', () =>
    assert.strictEqual(gradeAttempt(c, { finding: rf, dx: rd }).correctDx.text, c.answer));
});

test('grade: nothing selected is wrong, not a crash', () =>
  assert.strictEqual(gradeAttempt(base, {}).verdict, 'wrong'));

test('keys: Digit1-4 -> finding 0-3, Digit5 ignored with 4 findings', () => {
  assert.deepStrictEqual(keyToAction({ code: 'Digit1' }, 4, 4), { type: 'finding', index: 0 });
  assert.deepStrictEqual(keyToAction({ code: 'Numpad4' }, 4, 4), { type: 'finding', index: 3 });
  assert.strictEqual(keyToAction({ code: 'Digit5' }, 4, 4), null);
});
test('keys: KeyA-D -> dx 0-3 (works under Korean IME since code is physical), KeyE ignored', () => {
  assert.deepStrictEqual(keyToAction({ code: 'KeyA', key: 'ㅁ' }, 4, 4), { type: 'dx', index: 0 });
  assert.deepStrictEqual(keyToAction({ code: 'KeyD', key: 'ㅇ' }, 4, 4), { type: 'dx', index: 3 });
  assert.strictEqual(keyToAction({ code: 'KeyE' }, 4, 4), null);
});
test('keys: Enter submits; Ctrl/Meta/Alt combos ignored (Ctrl+C copy stays usable)', () => {
  assert.deepStrictEqual(keyToAction({ code: 'Enter' }, 4, 4), { type: 'submit' });
  assert.strictEqual(keyToAction({ code: 'KeyC', ctrlKey: true }, 4, 4), null);
  assert.strictEqual(keyToAction({ code: 'Digit1', altKey: true }, 4, 4), null);
  assert.strictEqual(keyToAction({ code: 'KeyA', metaKey: true }, 4, 4), null);
});

test('empty / missing list does not throw', () => {
  assert.deepStrictEqual(partitionCases([]), { visible: [], hidden: [] });
  assert.deepStrictEqual(partitionCases(undefined), { visible: [], hidden: [] });
});

console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: ALL ' + passed + ' PASS');

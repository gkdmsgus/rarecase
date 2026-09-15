// rsna-build-truth.cjs 시험. 실행: node tools/test-rsna-truth.cjs
// 1) 가짜 주석으로 규칙 분기 하나하나  2) 실제 data/manifest/rsna-truth.json 불변 조건
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildTruth, adjudicatedCategory, RULE_VERSION } = require('./rsna-build-truth.cjs');

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('PASS', name); }
  catch (e) { console.log('FAIL', name, '-', e.message); process.exitCode = 1; }
};

// ── 1. 가짜 데이터 ───────────────────────────────────────────
const groups = {
  'Team 1': ['Lung Opacity (High Prob)', 'No Lung Opacity / Not Normal', 'Normal', 'Exclude'],
  'Team 2': ['Lung Opacity (High Prob)', 'No Lung Opacity / Not Normal', 'Normal', 'Exclude'],
  'Team 2a': ['Lung Opacity (High Prob)', 'No Lung Opacity / Not Normal', 'Normal', 'Exclude'],
  Calculated: ['Normal', 'No Lung Opacity / Not Normal', 'Lung Opacity'],
  Adjudication: ['Lung Opacity (High Prob)', 'Lung Opacity (Med Prob)', 'Lung Opacity (Low Prob)', 'No Lung Opacity / Not Normal', 'Normal', 'Flag'],
};
const ids = {};
const labelGroups = Object.entries(groups).map(([g, names], gi) => ({
  name: g, labels: names.map((n, li) => { const id = `L${gi}_${li}`; ids[g + '/' + n] = id; return { id, name: n }; }),
}));
let seq = 0;
const ann = (study, group, name, user = 'U' + group, data = null) => ({ StudyInstanceUID: study, labelId: ids[group + '/' + name], createdById: user, data, id: 'A' + seq++ });
const triple = (study, cat) => [ann(study, 'Team 1', cat), ann(study, 'Team 2', cat), ann(study, 'Team 2a', cat)];

const box = { x: 10, y: 20, width: 30, height: 40 };
const anns = [
  ...triple('S_normal', 'Normal'), ann('S_normal', 'Calculated', 'Normal'),
  ...triple('S_op', 'Lung Opacity (High Prob)'), ann('S_op', 'Calculated', 'Lung Opacity', 'calc', box), ann('S_op', 'Calculated', 'Lung Opacity', 'calc', { ...box, x: 99 }),
  ...triple('S_nn', 'No Lung Opacity / Not Normal'), ann('S_nn', 'Calculated', 'No Lung Opacity / Not Normal'),
  // 두 팀만 판독 → 대상 아님
  ann('S_two', 'Team 1', 'Normal'), ann('S_two', 'Team 2', 'Normal'), ann('S_two', 'Calculated', 'Normal'),
  // Exclude 표시
  ...triple('S_excl', 'Normal'), ann('S_excl', 'Team 2', 'Exclude'), ann('S_excl', 'Calculated', 'Normal'),
  // Calculated 없음
  ...triple('S_nocalc', 'Normal'),
  // 조정 판독의가 Not Normal이라 했는데 Calculated는 Normal → 충돌 제외
  ...triple('S_conflict', 'Normal'), ann('S_conflict', 'Adjudication', 'No Lung Opacity / Not Normal'), ann('S_conflict', 'Calculated', 'Normal'),
  // 조정 판독의가 Low Prob만 → 명시 분류 아님, Calculated 따름
  ...triple('S_low', 'Normal'), ann('S_low', 'Adjudication', 'Lung Opacity (Low Prob)'), ann('S_low', 'Calculated', 'No Lung Opacity / Not Normal'),
  // 조정이 Flag만 → Calculated 따름
  ...triple('S_flag', 'Normal'), ann('S_flag', 'Adjudication', 'Flag'), ann('S_flag', 'Calculated', 'Lung Opacity', 'calc', box),
  // Calculated가 둘 → 제외
  ...triple('S_multi', 'Normal'), ann('S_multi', 'Calculated', 'Normal'), ann('S_multi', 'Calculated', 'No Lung Opacity / Not Normal'),
];
const studies = ['S_normal', 'S_op', 'S_nn', 'S_two', 'S_excl', 'S_nocalc', 'S_conflict', 'S_low', 'S_flag', 'S_multi'];
const mappings = studies.map((s, i) => ({ StudyInstanceUID: s, SOPInstanceUID: s + '.1', img_id: `0000000${i}_000.png`, orig_labels: ['Nodule'] }));
const nihEntries = new Map(mappings.map((m, i) => [m.img_id, { age: 30 + i, sex: i % 2 ? 'F' : 'M', view: 'PA' }]));
const fake = buildTruth({ annotations: { labelGroups, datasets: [{ annotations: anns }] }, mappings, nihEntries, sources: {} });
const byStudy = Object.fromEntries(fake.cases.map((c) => [c.studyInstanceUID, c]));
const exReason = Object.fromEntries(fake.excluded.map((e) => [e.studyInstanceUID, e.reason]));

test('only studies read by all three teams are considered', () => {
  assert.strictEqual(fake.counts.tripleRead, 9);
  assert.ok(!byStudy.S_two && !exReason.S_two);
});
test('truth comes from Calculated label', () => {
  assert.strictEqual(byStudy.S_normal.truth, 'normal');
  assert.strictEqual(byStudy.S_nn.truth, 'not-normal');
  assert.strictEqual(byStudy.S_op.truth, 'lung-opacity');
});
test('boxes kept only for lung-opacity, all Calculated boxes', () => {
  assert.strictEqual(byStudy.S_op.boxes.length, 2);
  assert.deepStrictEqual(byStudy.S_normal.boxes, []);
});
test('exclusion reasons', () => {
  assert.strictEqual(exReason.S_excl, 'reader-exclude');
  assert.strictEqual(exReason.S_nocalc, 'no-calculated-label');
  assert.strictEqual(exReason.S_conflict, 'adjudication-conflict');
  assert.strictEqual(exReason.S_multi, 'multiple-calculated-labels');
});
test('adjudication with only low-prob or flags defers to Calculated', () => {
  assert.strictEqual(byStudy.S_low.truth, 'not-normal');
  assert.strictEqual(byStudy.S_flag.truth, 'lung-opacity');
  assert.strictEqual(byStudy.S_flag.adjudicated, true);
});
test('NLP labels never appear in output', () => {
  assert.ok(!JSON.stringify(fake.cases).includes('Nodule'));
});
test('adjudicatedCategory mapping', () => {
  assert.strictEqual(adjudicatedCategory(['Lung Opacity (Med Prob)', 'Normal']), 'lung-opacity');
  assert.strictEqual(adjudicatedCategory(['Lung Opacity (Low Prob)']), null);
  assert.strictEqual(adjudicatedCategory(['Flag']), null);
  assert.strictEqual(adjudicatedCategory(['Normal']), 'normal');
});
test('unknown labelId throws instead of silently skipping', () => {
  assert.throws(() => buildTruth({ annotations: { labelGroups, datasets: [{ annotations: [{ StudyInstanceUID: 'X', labelId: 'nope' }] }] }, mappings, nihEntries, sources: {} }), /unknown labelId/);
});

// ── 2. 실제 결과물 불변 조건 ─────────────────────────────────
const file = path.join(__dirname, '..', 'data', 'manifest', 'rsna-truth.json');
const real = JSON.parse(fs.readFileSync(file, 'utf8'));

test('real: rule version and counts add up', () => {
  assert.strictEqual(real.rule, RULE_VERSION);
  assert.strictEqual(real.counts.included + real.counts.excluded, real.counts.tripleRead);
  assert.strictEqual(real.cases.length, real.counts.included);
  assert.strictEqual(Object.values(real.counts.byTruth).reduce((a, b) => a + b, 0), real.counts.included);
});
test('real: matches values reported to user (4526 → 4510; 1437/1434/1639; excluded 14+2)', () => {
  assert.strictEqual(real.counts.tripleRead, 4526);
  assert.deepStrictEqual(real.counts.byTruth, { normal: 1437, 'lung-opacity': 1639, 'not-normal': 1434 });
  assert.deepStrictEqual(real.counts.excludedByReason, { 'adjudication-conflict': 2, 'reader-exclude': 14 });
});
test('real: unique studies and NIH images, valid names', () => {
  assert.strictEqual(new Set(real.cases.map((c) => c.studyInstanceUID)).size, real.cases.length);
  assert.strictEqual(new Set(real.cases.map((c) => c.nihImage)).size, real.cases.length);
  real.cases.forEach((c) => assert.match(c.nihImage, /^\d{8}_\d{3}\.png$/));
});
test('real: every opacity has >=1 box with positive size; others have none', () => {
  for (const c of real.cases) {
    if (c.truth === 'lung-opacity') {
      assert.ok(c.boxes.length >= 1, c.nihImage);
      c.boxes.forEach((b) => assert.ok(b.width > 0 && b.height > 0 && b.x >= 0 && b.y >= 0, c.nihImage));
    } else assert.strictEqual(c.boxes.length, 0, c.nihImage);
  }
});
test('real: at least 3 readers, metadata present and plausible', () => {
  for (const c of real.cases) {
    assert.ok(c.readers >= 3, c.nihImage);
    assert.ok(Number.isInteger(c.meta.age) && c.meta.age >= 0 && c.meta.age <= 110, c.nihImage + ' age ' + c.meta.age);
    assert.ok(['M', 'F'].includes(c.meta.sex) && ['PA', 'AP'].includes(c.meta.view), c.nihImage);
  }
});
test('real: excluded studies are not in cases', () => {
  const inc = new Set(real.cases.map((c) => c.studyInstanceUID));
  real.excluded.forEach((e) => assert.ok(!inc.has(e.studyInstanceUID)));
});
test('real: no NLP label field and no patient ID in output (principle 9)', () => {
  const s = JSON.stringify(real.cases);
  assert.ok(!/orig_labels|Finding Labels|Patient ID|patientId/i.test(s));
  real.cases.forEach((c) => assert.deepStrictEqual(Object.keys(c.meta).sort(), ['age', 'sex', 'view']));
});

console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: ALL ' + passed + ' PASS');

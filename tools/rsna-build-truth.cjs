// RSNA Pneumonia 2018 라벨에서 RareCase 정답 목록을 만든다. 영상은 읽지 않는다 (원칙 2).
//
// 실행: node tools/rsna-build-truth.cjs [--rsna C:\rarecase-data\rsna-pneumonia\labels] [--nih C:\rarecase-data\nih-cxr14\meta]
// 결과: data/manifest/rsna-truth.json (정답·박스·메타데이터·제외 사유, 규칙 설명 포함)
//
// 정답 규칙 v1 (2026-09-15 사용자 확정, docs/data-plan.md)
//  1. 대상: Team 1(RSNA) · Team 2(STR) · Team 2a(STR) 세 팀이 모두 판독한 study
//  2. 정답: Calculated 그룹 라벨 (판독의 기록을 규칙으로 합친 값)
//  3. 제외: Calculated 라벨 없음 / 판독의 Exclude 표시 / 조정 판독의가 명시한 분류와 Calculated가 다름
//  4. 박스: 정답이 Lung Opacity일 때 Calculated 박스만 (x, y, width, height, 원본 픽셀 좌표)
//  5. NIH의 NLP 라벨(orig_labels, Finding Labels)은 정답에 쓰지 않는다
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RULE_VERSION = 'rsna-truth-v1';
const CATEGORY = { 'Lung Opacity': 'lung-opacity', 'No Lung Opacity / Not Normal': 'not-normal', Normal: 'normal' };
const TEAMS = ['Team 1', 'Team 2', 'Team 2a'];

function args(argv) {
  const a = { rsna: 'C:\\rarecase-data\\rsna-pneumonia\\labels', nih: 'C:\\rarecase-data\\nih-cxr14\\meta', out: path.join(__dirname, '..', 'data', 'manifest', 'rsna-truth.json') };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in a)) throw new Error('unknown option ' + argv[i]);
    a[k] = argv[i + 1];
  }
  return a;
}

// 조정 판독의가 남긴 라벨 → 명시한 분류. 고확률·중확률 음영만 음영으로 본다(논문: 저확률 박스 제거). 명시 안 했으면 null
function adjudicatedCategory(names) {
  if (names.some((n) => /^Lung Opacity \((High|Med) Prob\)/.test(n))) return 'lung-opacity';
  if (names.includes('No Lung Opacity / Not Normal')) return 'not-normal';
  if (names.includes('Normal')) return 'normal';
  return null;
}

function buildTruth({ annotations, mappings, nihEntries, sources }) {
  const lab = {};
  for (const g of annotations.labelGroups) for (const l of g.labels) lab[l.id] = { group: g.name, name: l.name };

  const per = new Map();
  for (const a of annotations.datasets[0].annotations) {
    const L = lab[a.labelId];
    if (!L) throw new Error('unknown labelId ' + a.labelId);
    let s = per.get(a.StudyInstanceUID);
    if (!s) per.set(a.StudyInstanceUID, (s = { teams: {}, calc: [], boxes: [], adj: [], exclude: 0 }));
    if (TEAMS.includes(L.group)) (s.teams[L.group] = s.teams[L.group] || new Set()).add(a.createdById);
    if (L.name === 'Exclude') s.exclude++;
    if (L.group === 'Adjudication') s.adj.push(L.name);
    if (L.group === 'Calculated') {
      s.calc.push(L.name);
      if (a.data) s.boxes.push({ x: a.data.x, y: a.data.y, width: a.data.width, height: a.data.height });
    }
  }

  const mapByStudy = new Map(mappings.map((m) => [m.StudyInstanceUID, m]));
  const cases = [];
  const excluded = [];
  let tripleRead = 0;

  for (const [uid, s] of per) {
    if (!TEAMS.every((t) => s.teams[t])) continue;
    tripleRead++;
    const calcSet = [...new Set(s.calc)];
    const reason =
      s.exclude > 0 ? 'reader-exclude'
      : calcSet.length === 0 ? 'no-calculated-label'
      : calcSet.length > 1 ? 'multiple-calculated-labels'
      : !CATEGORY[calcSet[0]] ? 'unknown-calculated-label'
      : null;
    const truth = reason ? null : CATEGORY[calcSet[0]];
    const adj = adjudicatedCategory(s.adj);
    const finalReason = reason || (adj && adj !== truth ? 'adjudication-conflict' : null);
    const m = mapByStudy.get(uid);
    if (!finalReason && !m) throw new Error('study without NIH mapping ' + uid);
    if (finalReason) { excluded.push({ studyInstanceUID: uid, reason: finalReason, calculated: calcSet, adjudicated: adj }); continue; }

    const nih = nihEntries.get(m.img_id);
    if (!nih) throw new Error('NIH image not in Data_Entry: ' + m.img_id);
    cases.push({
      studyInstanceUID: uid,
      sopInstanceUID: m.SOPInstanceUID,
      nihImage: m.img_id,
      truth,
      boxes: truth === 'lung-opacity' ? s.boxes : [],
      readers: TEAMS.reduce((n, t) => n + s.teams[t].size, 0),
      adjudicated: s.adj.length > 0,
      meta: nih,
    });
  }

  cases.sort((a, b) => a.nihImage.localeCompare(b.nihImage));
  excluded.sort((a, b) => a.reason.localeCompare(b.reason) || a.studyInstanceUID.localeCompare(b.studyInstanceUID));
  const count = (arr, f) => arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});

  return {
    rule: RULE_VERSION,
    ruleText: [
      'Include studies read by all three teams (Team 1 RSNA, Team 2 STR, Team 2a STR).',
      'Ground truth = Calculated label group (rule-based aggregation of radiologist reads).',
      'Exclude: reader Exclude mark, missing Calculated label, or adjudicator explicit category differing from Calculated.',
      'Boxes: Calculated boxes for lung-opacity only, original pixel coordinates.',
      'NIH NLP labels are not used.',
    ],
    license: 'RSNA Pneumonia Detection Challenge Terms of Use: academic research and education permitted; no attempt to identify subjects; attribution required when sharing (checked 2026-09-15).',
    citation: [
      'Shih G, et al. Augmenting the National Institutes of Health Chest Radiograph Dataset with Expert Annotations of Possible Pneumonia. Radiology: AI 2019. https://doi.org/10.1148/ryai.2019180041',
      'RSNA download site: https://www.rsna.org/rsnai/ai-image-challenge/rsna-pneumonia-detection-challenge-2018',
      'Wang X, et al. ChestX-ray8. IEEE CVPR 2017, pp. 3462-3471',
      'NIH download site: https://nihcc.app.box.com/v/ChestXray-NIHCC',
      'NIH Clinical Center is the data provider',
    ],
    sources,
    counts: {
      tripleRead,
      included: cases.length,
      excluded: excluded.length,
      byTruth: count(cases, (c) => c.truth),
      excludedByReason: count(excluded, (e) => e.reason),
      adjudicatedIncluded: cases.filter((c) => c.adjudicated).length,
      byView: count(cases, (c) => c.meta.view),
      bySex: count(cases, (c) => c.meta.sex),
    },
    cases,
    excluded,
  };
}

function readNihEntries(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  const col = (n) => { const i = head.indexOf(n); if (i < 0) throw new Error('column ' + n); return i; };
  const iImg = col('Image Index'), iAge = col('Patient Age'), iSex = col('Patient Sex'), iView = col('View Position');
  return new Map(lines.slice(1).map((l) => {
    const r = l.split(',');
    return [r[iImg], { age: Number(r[iAge]), sex: r[iSex], view: r[iView] }];
  }));
}

function main() {
  const a = args(process.argv.slice(2));
  const files = {
    annotations: path.join(a.rsna, 'pneumonia-challenge-annotations-adjudicated-kaggle_2018.json'),
    mappings: path.join(a.rsna, 'pneumonia-challenge-dataset-mappings_2018.json'),
    nih: path.join(a.nih, 'Data_Entry_2017_v2020.csv'),
  };
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const truth = buildTruth({
    annotations: JSON.parse(fs.readFileSync(files.annotations, 'utf8')),
    mappings: JSON.parse(fs.readFileSync(files.mappings, 'utf8')),
    nihEntries: readNihEntries(files.nih),
    sources: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { file: path.basename(f), sha256: sha(f) }])),
  });
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  fs.writeFileSync(a.out, JSON.stringify(truth, null, 1) + '\n');
  console.log(JSON.stringify(truth.counts, null, 1));
  console.log('wrote', a.out);
}

if (require.main === module) main();
module.exports = { buildTruth, adjudicatedCategory, RULE_VERSION };

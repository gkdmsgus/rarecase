// NIH ChestX-ray14 메타데이터 요약 + 매니페스트 기록.
// 실행: node tools/nih-meta-summary.js [데이터 폴더, 기본 C:\rarecase-data\nih-cxr14\meta]
// 영상은 읽지 않는다. 결과는 data/manifest/nih-cxr14-meta.json (저장소에 커밋 가능한 해시·개수만).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const META = process.argv[2] || 'C:\\rarecase-data\\nih-cxr14\\meta';
const OUT = path.join(__dirname, '..', 'data', 'manifest', 'nih-cxr14-meta.json');

// 따옴표 없는 단순 CSV (NIH 파일 형식). 따옴표가 나오면 멈춘다.
function readCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.some((l) => l.includes('"'))) throw new Error('quoted CSV not supported: ' + file);
  const head = lines[0].split(',');
  return { head, rows: lines.slice(1).map((l) => l.split(',')) };
}
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const count = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});

const entry = readCsv(path.join(META, 'Data_Entry_2017_v2020.csv'));
const col = (name) => { const i = entry.head.indexOf(name); if (i < 0) throw new Error('column ' + name); return i; };
const iImg = col('Image Index'), iLab = col('Finding Labels'), iPid = col('Patient ID');
const iAge = col('Patient Age'), iSex = col('Patient Sex'), iView = col('View Position');

const labels = count(entry.rows.flatMap((r) => r[iLab].split('|')));
const bbox = readCsv(path.join(META, 'BBox_List_2017.csv'));

const summary = {
  dataset: 'nih-chestxray14',
  source: 'https://nihcc.app.box.com/v/ChestXray-NIHCC',
  license: 'Google Cloud dataset page: "There are no restrictions on the use of the NIH chest x-ray images." (checked 2026-09-15). README_CHESTXRAY.pdf states no license text.',
  citation: [
    'Wang X, Peng Y, Lu L, Lu Z, Bagheri M, Summers RM. ChestX-ray8. IEEE CVPR 2017, pp. 3462-3471',
    'NIH Clinical Center is the data provider',
  ],
  labelNote: 'Finding Labels are NLP-mined from reports (README: accuracy estimated >90%). NOT usable as ground truth under principle 4.',
  downloadedAt: '2026-09-15',
  files: fs.readdirSync(META).sort().map((f) => ({
    name: f, bytes: fs.statSync(path.join(META, f)).size, sha256: sha256(path.join(META, f)),
  })),
  counts: {
    images: entry.rows.length,
    uniqueImages: new Set(entry.rows.map((r) => r[iImg])).size,
    patients: new Set(entry.rows.map((r) => r[iPid])).size,
    view: count(entry.rows.map((r) => r[iView])),
    sex: count(entry.rows.map((r) => r[iSex])),
    ageOutOfRange: entry.rows.filter((r) => !(Number(r[iAge]) >= 0 && Number(r[iAge]) <= 110)).length,
    nlpLabels: labels,
    bboxRows: bbox.rows.length,
    bboxImages: new Set(bbox.rows.map((r) => r[0])).size,
    bboxLabels: count(bbox.rows.map((r) => r[1])),
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary.counts, null, 1));
console.log('wrote', OUT);

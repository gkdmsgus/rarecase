// nih-extract.js 시험. 실제 영상 없이 가짜 파일로 만든 tar.gz를 file:// 로 흘려 넣는다.
// 실행: node tools/test-nih-extract.cjs
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const { assertOutsideRepo, readTargets, parseRange } = require('./nih-extract.cjs');

const SCRIPT = path.join(__dirname, 'nih-extract.cjs');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-extract-test-'));
let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('PASS', name); }
  catch (e) { console.log('FAIL', name, '-', e.message); process.exitCode = 1; }
};
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// 가짜 "영상": 크기가 512 경계에 걸리거나 안 걸리게 섞는다
function makeArchive(name, files, format) {
  const src = path.join(ROOT, name + '-src');
  fs.mkdirSync(path.join(src, 'images'), { recursive: true });
  for (const [f, size] of Object.entries(files)) {
    fs.writeFileSync(path.join(src, 'images', f), crypto.randomBytes(size));
  }
  const out = path.join(ROOT, name + '.tar.gz');
  execFileSync('tar', ['--format', format, '-czf', out, '-C', src, 'images']);
  return { src, url: fileUrl(out), file: out };
}
function run(args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
}

const files = { '00000001_000.png': 1000, '00000001_001.png': 512, '00000002_000.png': 0, '00000003_000.png': 70000, '00000004_000.png': 513 };
const a1 = makeArchive('a1', files, 'ustar');
const longName = '00000005_000.png';
const a2 = makeArchive('a2', { [longName]: 2048, '00000006_000.png': 10 }, 'pax');
const targetsFile = path.join(ROOT, 'targets.txt');
fs.writeFileSync(targetsFile, ['00000001_001.png', '00000003_000.png', '00000002_000.png', '00000005_000.png', '99999999_999.png'].join('\n'));
const out = path.join(ROOT, 'out');

test('extract only targets from ustar + pax archives', () => {
  const r = run(['--targets', targetsFile, '--out', out, '--archives', '1-2', '--urls', a1.url + ',' + a2.url]);
  // 목록의 99999999_999.png는 어느 압축에도 없으므로 전체 실행 후 누락 → 종료 코드 2
  assert.strictEqual(r.status, 2, r.stderr + r.stdout);
  const saved = fs.readdirSync(path.join(out, 'images')).sort();
  assert.deepStrictEqual(saved, ['00000001_001.png', '00000002_000.png', '00000003_000.png', '00000005_000.png']);
  assert.match(r.stdout, /missing 1/);
});

test('saved bytes identical to source (sha256), including 0-byte and 512-byte files', () => {
  for (const [f, dir] of [['00000001_001.png', a1.src], ['00000002_000.png', a1.src], ['00000003_000.png', a1.src], ['00000005_000.png', a2.src]]) {
    assert.strictEqual(sha(fs.readFileSync(path.join(out, 'images', f))), sha(fs.readFileSync(path.join(dir, 'images', f))), f);
  }
});

test('index lists every file in archive with size', () => {
  const lines = fs.readFileSync(path.join(out, 'index', 'images_01.tsv'), 'utf8').trim().split('\n');
  const regular = lines.filter((l) => /\.png\t/.test(l)).map((l) => l.split('\t'));
  assert.strictEqual(regular.length, 5);
  for (const [n, s] of regular) assert.strictEqual(Number(s), files[path.basename(n)], n);
});

test('extracted.tsv hashes match files on disk', () => {
  const rows = fs.readFileSync(path.join(out, 'extracted.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t'));
  assert.strictEqual(rows.length, 4);
  for (const [n, bytes, h] of rows) {
    const b = fs.readFileSync(path.join(out, 'images', n));
    assert.strictEqual(b.length, Number(bytes));
    assert.strictEqual(sha(b), h);
  }
});

test('re-run skips finished archives and does not duplicate extracted.tsv', () => {
  const r = run(['--targets', targetsFile, '--out', out, '--archives', '1-2', '--urls', a1.url + ',' + a2.url]);
  assert.match(r.stdout, /images_01 already done, skip/);
  assert.match(r.stdout, /images_02 already done, skip/);
  assert.strictEqual(fs.readFileSync(path.join(out, 'extracted.tsv'), 'utf8').trim().split('\n').length, 4);
});

test('truncated archive fails and leaves no done marker', () => {
  const buf = fs.readFileSync(a1.file);
  const cut = path.join(ROOT, 'cut.tar.gz');
  fs.writeFileSync(cut, buf.subarray(0, Math.floor(buf.length / 2)));
  const o = path.join(ROOT, 'out-cut');
  const r = run(['--targets', targetsFile, '--out', o, '--archives', '1', '--urls', fileUrl(cut)]);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /ERROR/);
  assert.ok(!fs.existsSync(path.join(o, 'index', 'images_01.done.json')));
});

test('missing archive URL (curl failure) fails and leaves no done marker', () => {
  const o = path.join(ROOT, 'out-404');
  const r = run(['--targets', targetsFile, '--out', o, '--archives', '1', '--urls', fileUrl(path.join(ROOT, 'nope.tar.gz'))]);
  assert.notStrictEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(o, 'index', 'images_01.done.json')));
});

test('refuses output inside repository (principle 7)', () => {
  assert.throws(() => assertOutsideRepo(path.join(__dirname, '..', 'data', 'images')), /principle 7/);
  assert.throws(() => assertOutsideRepo(path.join(__dirname, '..')), /principle 7/);
  assertOutsideRepo('C:\\rarecase-data\\nih-cxr14');
  const r = run(['--targets', targetsFile, '--out', path.join(__dirname, '..', 'data', 'x'), '--urls', a1.url, '--archives', '1']);
  assert.notStrictEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'data', 'x')));
});

test('rejects target names that are not NIH image names', () => {
  const bad = path.join(ROOT, 'bad.txt');
  fs.writeFileSync(bad, '00000001_000.png\n../evil.png\n');
  assert.throws(() => readTargets(bad), /invalid image names/);
});

test('archive range parsing', () => {
  assert.deepStrictEqual(parseRange('1-3,5', 12), [1, 2, 3, 5]);
  assert.throws(() => parseRange('0-2', 12));
  assert.throws(() => parseRange('13', 12));
});

fs.rmSync(ROOT, { recursive: true, force: true });
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: ALL ' + passed + ' PASS');

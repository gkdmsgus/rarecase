// 원격 zip의 끝부분(중앙 디렉터리)만 범위 요청으로 받아 파일 목록을 본다. 전체를 받지 않는다.
// 실행: node tools/zip-remote-list.js <url> [tailMB=64]
'use strict';
const { execFileSync } = require('child_process');

const url = process.argv[2];
const tailMB = Number(process.argv[3] || 64);
if (!url) { console.error('usage: node tools/zip-remote-list.js <url> [tailMB]'); process.exit(1); }

const range = (spec) => execFileSync('curl.exe', ['-sL', '--fail', '-r', spec, url], { maxBuffer: 1024 * 1024 * 1024 });
const head = execFileSync('curl.exe', ['-sIL', url]).toString();
const total = Number((head.match(/content-length:\s*(\d+)/gi) || []).pop().split(':')[1]);

const tail = range(`${Math.max(0, total - tailMB * 1048576)}-${total - 1}`);
const tailStart = total - tail.length;

// EOCD (0x06054b50), ZIP64 locator (0x07064b50) 찾기
const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (eocd < 0) throw new Error('EOCD not found in tail');
let cdCount = tail.readUInt16LE(eocd + 10);
let cdSize = tail.readUInt32LE(eocd + 12);
let cdOffset = tail.readUInt32LE(eocd + 16);
const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
if (loc >= 0 && (cdOffset === 0xffffffff || cdCount === 0xffff)) {
  const z64 = Number(tail.readBigUInt64LE(loc + 8)) - tailStart;
  cdCount = Number(tail.readBigUInt64LE(z64 + 32));
  cdSize = Number(tail.readBigUInt64LE(z64 + 40));
  cdOffset = Number(tail.readBigUInt64LE(z64 + 48));
}
if (cdOffset < tailStart) throw new Error(`central directory starts before fetched tail; rerun with tailMB >= ${Math.ceil((total - cdOffset) / 1048576)}`);

const cd = tail.subarray(cdOffset - tailStart, cdOffset - tailStart + cdSize);
const entries = [];
for (let p = 0; p < cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
  const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
  let size = cd.readUInt32LE(p + 24);
  const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
  const extra = cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen);
  if (size === 0xffffffff) {
    for (let e = 0; e + 4 <= extra.length;) {
      const id = extra.readUInt16LE(e), len = extra.readUInt16LE(e + 2);
      if (id === 0x0001) { size = Number(extra.readBigUInt64LE(e + 4)); break; }
      e += 4 + len;
    }
  }
  entries.push({ name, size });
  p += 46 + nameLen + extraLen + commentLen;
}

const files = entries.filter((e) => !e.name.endsWith('/'));
const ext = files.reduce((m, e) => { const x = (e.name.match(/\.([^./]+)$/) || [, '(none)'])[1].toLowerCase(); m[x] = (m[x] || 0) + 1; return m; }, {});
const dirs = files.reduce((m, e) => { const d = e.name.split('/').slice(0, -1).join('/') || '.'; m[d] = (m[d] || 0) + 1; return m; }, {});
console.log(JSON.stringify({
  url, totalMB: +(total / 1048576).toFixed(1), declaredEntries: cdCount, parsedEntries: entries.length, files: files.length,
  uncompressedGB: +(files.reduce((t, e) => t + e.size, 0) / 1073741824).toFixed(2), byExtension: ext,
  topDirs: Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 8), sample: files.slice(0, 5).map((e) => e.name),
}, null, 1));

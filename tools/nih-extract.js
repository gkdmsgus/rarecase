// NIH ChestX-ray14 영상 압축을 받으면서 필요한 PNG만 저장한다 (전체 41.98 GB를 디스크에 두지 않음).
//
// 실행:
//   node tools/nih-extract.js --targets <영상 이름 목록.txt> [--out C:\rarecase-data\nih-cxr14] [--archives 1-12]
//
// 결과 (모두 --out 아래, 저장소 밖):
//   images/<이름>.png            목록에 있는 영상만
//   index/images_NN.tsv         압축 안 전체 파일 이름·크기 (다음에 필요한 압축만 고르기 위해)
//   index/images_NN.done.json   끝난 압축 표시 — 다시 실행하면 건너뜀
//   extracted.tsv               저장한 영상 이름·바이트·sha256
//
// 원칙 7: --out이 저장소 안이면 실행을 거부한다.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');

// batch_download_zips.py (NIH Box, 2020-07-20)에 적힌 주소
const ARCHIVES = [
  'vfk49d74nhbxq3nqjg0900w5nvkorp5c', 'i28rlmbvmfjbl8p2n3ril0pptcmcu9d1', 'f1t00wrtdk94satdfb9olcolqx20z2jp',
  '0aowwzs5lhjrceb3qp67ahp0rd1l1etg', 'v5e3goj22zr6h8tzualxfsqlqaygfbsn', 'asi7ikud9jwnkrnkj99jnpfkjdes7l6l',
  'jn1b4mw4n6lnh74ovmcjb8y48h8xj07n', 'tvpxmn7qyrgl0w8wfh9kqfjskv6nmm1j', 'upyy3ml7qdumlgk2rfcvlb9k6gvqq2pj',
  'l6nilvfa9cg3s28tqv1qc1olm3gnz54p', 'hhq8fkdgvcari67vfhs7ppg2w6ni4jze', 'ioqwiy20ihqwyr8pf4c24eazhh281pbu',
].map((k) => 'https://nihcc.box.com/shared/static/' + k + '.gz');

const NAME_RE = /^\d{8}_\d{3}\.png$/;

function parseArgs(argv) {
  const a = { out: 'C:\\rarecase-data\\nih-cxr14', archives: '1-12', urls: null };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in a) && k !== 'targets') throw new Error('unknown option ' + argv[i]);
    a[k] = argv[i + 1];
  }
  if (!a.targets) throw new Error('--targets required');
  return a;
}

function parseRange(s, max) {
  const out = new Set();
  for (const part of s.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new Error('bad --archives ' + s);
    for (let i = Number(m[1]); i <= Number(m[2] || m[1]); i++) {
      if (i < 1 || i > max) throw new Error('archive out of range: ' + i);
      out.add(i);
    }
  }
  return [...out].sort((x, y) => x - y);
}

function assertOutsideRepo(dir) {
  const rel = path.relative(REPO, path.resolve(dir));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error('refusing to write images inside the repository (principle 7): ' + dir);
  }
}

function readTargets(file) {
  const names = fs.readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const bad = names.filter((n) => !NAME_RE.test(n));
  if (bad.length) throw new Error('invalid image names in targets: ' + bad.slice(0, 3).join(', '));
  return new Set(names);
}

/* 스트리밍 tar 파서. ustar / GNU 긴 이름(L) / pax 경로(x) 지원.
   onEntry(name, size, typeflag) → true를 돌려주면 내용을 모아 onData(name, buffer)로 넘긴다. */
function createTarParser(onEntry, onData) {
  let buf = Buffer.alloc(0);
  let state = 'header';
  let cur = null; // { name, size, keep, chunks, got, pad }
  let longName = null;
  let paxPath = null;
  let ended = false;

  const octal = (b) => {
    const s = b.toString('ascii').replace(/\0.*$/, '').trim();
    return s ? parseInt(s, 8) : 0;
  };
  const str = (b) => b.toString('utf8').replace(/\0.*$/, '');

  function feed(chunk) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (ended) return;
      if (state === 'header') {
        if (buf.length < 512) return;
        const h = buf.subarray(0, 512);
        buf = buf.subarray(512);
        if (h.every((x) => x === 0)) { ended = true; return; }
        const size = octal(h.subarray(124, 136));
        const type = String.fromCharCode(h[156] || 48);
        const prefix = str(h.subarray(345, 500));
        let name = str(h.subarray(0, 100));
        if (prefix) name = prefix + '/' + name;
        if (longName) { name = longName; longName = null; }
        if (paxPath) { name = paxPath; paxPath = null; }
        const meta = type === 'L' || type === 'x';
        const keep = meta || ((type === '0' || type === '\0') && onEntry(name, size, type) === true);
        if (!meta && !(type === '0' || type === '\0')) onEntry(name, size, type);
        cur = { name, size, type, keep, chunks: [], got: 0, pad: (512 - (size % 512)) % 512 };
        state = 'body';
      }
      if (state === 'body') {
        const need = cur.size - cur.got;
        if (need > 0) {
          if (!buf.length) return;
          const take = Math.min(need, buf.length);
          if (cur.keep) cur.chunks.push(buf.subarray(0, take));
          buf = buf.subarray(take);
          cur.got += take;
          if (cur.got < cur.size) return;
        }
        state = 'pad';
      }
      if (state === 'pad') {
        if (buf.length < cur.pad) return;
        buf = buf.subarray(cur.pad);
        const data = cur.keep ? Buffer.concat(cur.chunks) : null;
        if (cur.type === 'L') longName = data.toString('utf8').replace(/\0.*$/, '');
        else if (cur.type === 'x') {
          const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString('utf8'));
          if (m) paxPath = m[1];
        } else if (cur.keep) onData(cur.name, data);
        cur = null;
        state = 'header';
      }
    }
  }
  return { feed, isEnded: () => ended, pending: () => state !== 'header' || buf.length > 0 };
}

function processArchive(num, url, targets, out, log) {
  const tag = 'images_' + String(num).padStart(2, '0');
  const idxDir = path.join(out, 'index');
  const doneFile = path.join(idxDir, tag + '.done.json');
  if (fs.existsSync(doneFile)) { log(tag + ' already done, skip'); return Promise.resolve(JSON.parse(fs.readFileSync(doneFile, 'utf8'))); }

  fs.mkdirSync(idxDir, { recursive: true });
  fs.mkdirSync(path.join(out, 'images'), { recursive: true });
  const idxTmp = path.join(idxDir, tag + '.tsv.part');
  const idx = fs.createWriteStream(idxTmp);
  const extracted = fs.createWriteStream(path.join(out, 'extracted.tsv'), { flags: 'a' });

  let entries = 0, saved = 0, bytesIn = 0;
  const t0 = Date.now();

  return new Promise((resolve, reject) => {
    const curl = spawn('curl.exe', ['-sL', '--fail', '--retry', '3', url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let curlErr = '';
    curl.stderr.on('data', (d) => { curlErr += d; });
    const gunzip = zlib.createGunzip();

    const parser = createTarParser(
      (name, size) => {
        entries++;
        idx.write(name + '\t' + size + '\n');
        return targets.has(path.basename(name));
      },
      (name, data) => {
        const base = path.basename(name);
        const dst = path.join(out, 'images', base);
        fs.writeFileSync(dst + '.part', data);
        fs.renameSync(dst + '.part', dst);
        extracted.write([base, data.length, crypto.createHash('sha256').update(data).digest('hex'), tag].join('\t') + '\n');
        saved++;
      },
    );

    const tick = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      log(`${tag} ${(bytesIn / 1048576).toFixed(0)} MB in ${s.toFixed(0)} s (${(bytesIn / 1048576 / s).toFixed(1)} MB/s), entries ${entries}, saved ${saved}`);
    }, 30000);

    curl.stdout.on('data', (d) => { bytesIn += d.length; });
    curl.stdout.pipe(gunzip);
    gunzip.on('data', (d) => parser.feed(d));
    gunzip.on('error', (e) => { clearInterval(tick); curl.kill(); reject(new Error(tag + ' gunzip: ' + e.message)); });

    gunzip.on('end', () => {
      clearInterval(tick);
      if (!parser.isEnded() && parser.pending()) { reject(new Error(tag + ' truncated tar stream')); return; }
      idx.end(() => extracted.end(() => {
        fs.renameSync(idxTmp, path.join(idxDir, tag + '.tsv'));
        const done = { archive: tag, url, entries, saved, compressedBytes: bytesIn, seconds: Math.round((Date.now() - t0) / 1000), finishedAt: new Date().toISOString() };
        fs.writeFileSync(doneFile, JSON.stringify(done, null, 2));
        log(`${tag} done: entries ${entries}, saved ${saved}, ${(bytesIn / 1073741824).toFixed(2)} GB, ${done.seconds} s`);
        resolve(done);
      }));
    });
    curl.on('close', (code) => {
      if (code !== 0) { clearInterval(tick); reject(new Error(tag + ' curl exit ' + code + ' ' + curlErr.trim())); }
    });
  });
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const urls = a.urls ? a.urls.split(',') : ARCHIVES; // --urls: 테스트용
  assertOutsideRepo(a.out);
  const targets = readTargets(a.targets);
  const nums = parseRange(a.archives, urls.length);
  const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
  log(`targets ${targets.size}, archives ${nums.join(',')}, out ${a.out}`);

  const results = [];
  for (const n of nums) results.push(await processArchive(n, urls[n - 1], targets, a.out, log));

  // 전체 끝났을 때만 누락 검사
  const got = new Set(fs.readdirSync(path.join(a.out, 'images')).filter((f) => NAME_RE.test(f)));
  const missing = [...targets].filter((t) => !got.has(t));
  log(`summary: saved total ${got.size}, missing ${missing.length}` + (missing.length ? ' e.g. ' + missing.slice(0, 5).join(',') : ''));
  if (nums.length === urls.length && missing.length) process.exitCode = 2;
}

if (require.main === module) {
  main().catch((e) => { console.error('ERROR', e.message); process.exitCode = 1; });
}
module.exports = { createTarParser, assertOutsideRepo, readTargets, parseRange };

/* ═══════════════════════════════════════════════════════════
   Clinical Checkpoint 실제 사진(환자 사진·CT 영상) 연결.

   - 사진 파일은 저장소 밖 DATA_ROOT/cc-media/ 에 둔다 (원칙 7, 공개 저장소).
   - 저장소에는 data/manifest/cc-media.json 에 출처·라이선스·저작자·해시만 둔다.
   - 서버는 매니페스트에 있고 sha256이 맞는 파일만 보낸다. 라이선스를 확인하지 않은
     사진이 화면에 뜰 수 없게 하는 장치다 (원칙 8).
   - 파일이 없거나 해시가 다르면 그 항목은 빠지고, 화면은 일러스트·도식으로 돌아간다.

   매니페스트 항목: { id: 'patient-photo' | 'ct', file, sha256, license, licenseUrl,
                      author, sourceUrl, attribution, verifiedOn, region? }
   region: CT에서 학습 대상 위치(0~1 비율). 출처가 위치를 밝힌 경우에만 넣는다.
           없으면 핀은 기록만 하고 위치 대조를 하지 않는다 (원칙 1: 영상을 보고 라벨을 붙이지 않는다).
   ═══════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MEDIA_DIR = 'cc-media';
const EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const REQUIRED = ['id', 'file', 'sha256', 'license', 'author', 'sourceUrl', 'attribution'];

export function loadMedia(dataRoot, manifestPath, log = console) {
  const byId = {};
  const byFile = {};
  let entries = [];
  try { entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).items || []; }
  catch { return { byId, byFile }; }
  for (const e of entries) {
    const missing = REQUIRED.filter((k) => typeof e[k] !== 'string' || !e[k].trim());
    if (missing.length) { log.warn('[CC] media entry skipped, missing', missing.join(','), e && e.id); continue; }
    if (path.basename(e.file) !== e.file || !EXT[path.extname(e.file).toLowerCase()]) { log.warn('[CC] media entry skipped, bad file name', e.file); continue; }
    const full = path.join(dataRoot, MEDIA_DIR, e.file);
    if (!fs.existsSync(full)) continue;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    if (hash !== e.sha256.toLowerCase()) { log.warn('[CC] media hash mismatch, not served:', e.file); continue; }
    const item = { ...e, full, type: EXT[path.extname(e.file).toLowerCase()], url: `/data/${MEDIA_DIR}/${encodeURIComponent(e.file)}` };
    byId[e.id] = item;
    byFile[e.file] = item;
  }
  return { byId, byFile };
}

/* 화면에 보낼 공개 정보: 주소와 출처 표기만 */
export function publicMedia(item) {
  if (!item) return null;
  return { url: item.url, attribution: item.attribution, license: item.license, licenseUrl: item.licenseUrl || null, sourceUrl: item.sourceUrl };
}

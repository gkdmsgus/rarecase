/* ═══════════════════════════════════════════════════════════
   케이스 스키마 검사 — 학습자에게 보여도 되는 케이스를 가른다.

   노출 조건 (둘 다 만족해야 함)
   1. approval.status === 'approved'   (원칙 4: 승인된 케이스만)
   2. 필수 필드가 모두 있고, 정답이 사전에 하나로 확정돼 있음
      (원칙 1: 케이스 우선 — 정답 없이 영상만 있는 케이스는 금지)

   ES 모듈. 화면(Vite)·서버·검사 스크립트가 같은 파일을 import한다.
   ═══════════════════════════════════════════════════════════ */

// src/App.jsx drawFilm()이 그릴 수 있는 도식 종류
const KNOWN_FILMS = ['pavm', 'ptx'];
const RARITIES = ['rare', 'common', 'normal'];
const APPROVAL_STATUSES = ['draft', 'pending', 'approved'];

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isArr = (v) => Array.isArray(v) && v.length > 0;

/* 케이스 하나의 문제 목록을 돌려준다. 빈 배열이면 통과. */
function validateCase(c) {
  const errs = [];
  if (!c || typeof c !== 'object') return ['케이스가 객체가 아님'];

  if (!isStr(c.id)) errs.push('id 없음');
  if (!isStr(c.who)) errs.push('who 없음');
  if (!isStr(c.cc)) errs.push('cc 없음');
  if (!RARITIES.includes(c.rarity)) errs.push('rarity 값 오류: ' + c.rarity);

  const ap = c.approval;
  if (!ap || !APPROVAL_STATUSES.includes(ap.status)) {
    errs.push('approval.status 값 오류');
  } else if (ap.status === 'approved') {
    if (!isStr(ap.by)) errs.push('approval.by 없음');
    if (!isStr(ap.date)) errs.push('approval.date 없음');
  }

  // 여기부터는 풀이에 필요한 내용. 초안(draft)은 비어 있어도 되므로
  // 승인 상태일 때만 요구한다.
  if (!ap || ap.status !== 'approved') return errs;

  if (!KNOWN_FILMS.includes(c.film)) errs.push('film 값 오류: ' + c.film);
  if (!isStr(c.intro)) errs.push('intro 없음');
  if (!isArr(c.vitals)) errs.push('vitals 없음');
  if (!isArr(c.questions)) errs.push('questions 없음');
  else c.questions.forEach((q, i) => {
    if (!isStr(q.q) || !isStr(q.a)) errs.push('questions[' + i + '] q/a 없음');
    if (q.key !== undefined && typeof q.key !== 'boolean') errs.push('questions[' + i + '].key는 boolean');
  });

  if (!isArr(c.orders)) errs.push('orders 없음');
  else if (!c.orders.some((o) => o.ready)) errs.push('준비된 검사(ready) 없음');

  if (!c.study || !isStr(c.study.name) || !isStr(c.study.acc)) errs.push('study 없음');

  ['findings', 'diagnoses'].forEach((k) => {
    const list = c[k];
    if (!isArr(list)) { errs.push(k + ' 없음'); return; }
    const n = list.filter((x) => x.correct === true).length;
    if (n !== 1) errs.push(k + ' 정답 개수 ' + n + '개 (1개여야 함)');
    const ids = list.map((x) => x.id);
    if (new Set(ids).size !== ids.length) errs.push(k + ' id 중복');
  });

  if (isArr(c.diagnoses)) {
    const right = c.diagnoses.find((d) => d.correct === true);
    if (right && c.answer !== right.text) errs.push('answer가 정답 진단과 다름');
  }

  if (!isArr(c.feedback)) {
    errs.push('feedback 없음');
  } else {
    c.feedback.forEach((p, i) => {
      if (!isStr(p.t)) errs.push('feedback[' + i + '].t 없음');
      if (!p.cite || !isStr(p.cite.text) || typeof p.cite.verified !== 'boolean') {
        errs.push('feedback[' + i + '].cite 형식 오류 ({text, verified})');
      }
    });
  }

  if (!c.missed || !isStr(c.missed.h) || !isStr(c.missed.t)) errs.push('missed 없음');
  if (typeof c.medicalReviewed !== 'boolean') errs.push('medicalReviewed 없음');

  return errs;
}

/* 전체 목록을 노출/숨김으로 나눈다. */
function partitionCases(cases) {
  const visible = [];
  const hidden = [];
  (cases || []).forEach((c) => {
    const errs = validateCase(c);
    const approved = c && c.approval && c.approval.status === 'approved';
    if (approved && errs.length === 0) {
      visible.push(c);
    } else {
      hidden.push({
        id: (c && c.id) || '(id 없음)',
        reason: approved ? 'invalid' : 'unapproved',
        errors: errs,
      });
    }
  });
  return { visible, hidden };
}

export { KNOWN_FILMS, validateCase, partitionCases };

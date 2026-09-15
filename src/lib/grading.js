/* ═══════════════════════════════════════════════════════════
   채점 — 사전에 확정된 정답과의 대조만 한다 (원칙 2).
   영상을 보거나 해석하는 코드는 여기에 없다.

   ES 모듈. 화면(Vite)·서버·검사 스크립트가 같은 파일을 import한다.
   ═══════════════════════════════════════════════════════════ */

/*
  c        : 승인·검사를 통과한 케이스
  attempt  : { finding: 소견 id, dx: 진단 id, asked: 물어본 질문 문자열 배열 }
  반환     : { findingOk, dxOk, verdict, correctFinding, correctDx, missedKeyQuestions }
  verdict  : 'correct'(둘 다) | 'partial'(하나만) | 'wrong'(둘 다 틀림)
*/
function gradeAttempt(c, attempt) {
  const a = attempt || {};
  const correctFinding = c.findings.find((f) => f.correct === true);
  const correctDx = c.diagnoses.find((d) => d.correct === true);

  const findingOk = a.finding === correctFinding.id;
  const dxOk = a.dx === correctDx.id;

  const verdict = findingOk && dxOk ? 'correct'
    : findingOk || dxOk ? 'partial'
    : 'wrong';

  const asked = new Set(a.asked || []);
  const missedKeyQuestions = c.questions
    .filter((q) => q.key === true && !asked.has(q.q))
    .map((q) => q.q);

  return { findingOk, dxOk, verdict, correctFinding, correctDx, missedKeyQuestions };
}

/* 판독 중 키 입력 → 선택 동작. 해당 없으면 null.
   e.code를 쓰는 이유: 한글 입력 상태에서도 A–D가 같은 물리 키로 잡힘 */
function keyToAction(e, nFindings, nDiagnoses) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const d = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
  if (d) {
    const i = Number(d[1]) - 1;
    return i < nFindings ? { type: 'finding', index: i } : null;
  }
  const l = /^Key([A-Z])$/.exec(e.code || '');
  if (l) {
    const i = l[1].charCodeAt(0) - 65;
    return i < nDiagnoses ? { type: 'dx', index: i } : null;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') return { type: 'submit' };
  return null;
}

export { gradeAttempt, keyToAction };

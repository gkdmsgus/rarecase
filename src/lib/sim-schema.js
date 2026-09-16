/* ═══════════════════════════════════════════════════════════
   진료 절차 훈련 시나리오 스키마 검사.
   설계: docs/sim-design.md

   노출 조건
   1. 필수 필드가 모두 있고 정답(필수 문진·진찰·검사·처분)이 사전에 확정돼 있다 (원칙 1)
   2. 정답 출처(source)가 있고, 의학 검수 여부(reviewed)가 명시돼 있다 (원칙 4·6)
      reviewed:false는 숨기지 않는다 — 화면에 "확인 필요"를 달고 보여 준다
   ═══════════════════════════════════════════════════════════ */

const SOURCES = ['authored-scenario', 'dataset-label'];
const APPROPRIATENESS = ['required', 'reasonable', 'low-yield'];
const FLAG_WHERE = ['vitals', 'history', 'exam', 'order'];

const isStr = (v) => typeof v === 'string' && v.trim() !== '';
const isArr = (v) => Array.isArray(v) && v.length > 0;
const isBool = (v) => typeof v === 'boolean';

function checkList(errs, list, name, fields, extra) {
  if (!isArr(list)) { errs.push(name + ' 없음'); return; }
  const ids = [];
  list.forEach((x, i) => {
    const at = name + '[' + i + ']';
    fields.forEach((f) => { if (!isStr(x[f])) errs.push(at + '.' + f + ' 없음'); });
    if (x.id !== undefined) ids.push(x.id);
    if (extra) extra(errs, x, at);
  });
  if (ids.length && new Set(ids).size !== ids.length) errs.push(name + ' id 중복');
}

/* 시나리오 하나의 문제 목록. 빈 배열이면 통과. */
export function validateScenario(s) {
  const errs = [];
  if (!s || typeof s !== 'object') return ['시나리오가 객체가 아님'];

  if (!isStr(s.id)) errs.push('id 없음');
  if (!SOURCES.includes(s.source)) errs.push('source 값 오류: ' + s.source);
  if (!isBool(s.reviewed)) errs.push('reviewed 없음(boolean)');

  const p = s.patient;
  if (!p || !Number.isInteger(p.age) || p.age < 0 || p.age > 120) errs.push('patient.age 오류');
  if (!p || !['M', 'F'].includes(p.sex)) errs.push('patient.sex 오류');
  if (!p || !isStr(p.chiefComplaint)) errs.push('patient.chiefComplaint 없음');
  if (!isArr(s.vitals)) errs.push('vitals 없음');

  checkList(errs, s.history, 'history', ['id', 'q', 'a'], (e, x, at) => {
    if (!isBool(x.required)) e.push(at + '.required 없음(boolean)');
    if (x.flag !== undefined && !isStr(x.flag)) e.push(at + '.flag는 위험 신호 id');
  });
  checkList(errs, s.exam, 'exam', ['id', 'label', 'finding'], (e, x, at) => {
    if (!isBool(x.required)) e.push(at + '.required 없음(boolean)');
    if (x.flag !== undefined && !isStr(x.flag)) e.push(at + '.flag는 위험 신호 id');
  });
  checkList(errs, s.orders, 'orders', ['id', 'label', 'result'], (e, x, at) => {
    if (!APPROPRIATENESS.includes(x.appropriate)) e.push(at + '.appropriate 값 오류: ' + x.appropriate);
    if (typeof x.radiation !== 'number' || x.radiation < 0) e.push(at + '.radiation 오류(mSv, 0 이상)');
    if (x.flag !== undefined && !isStr(x.flag)) e.push(at + '.flag는 위험 신호 id');
  });
  if (isArr(s.orders) && !s.orders.some((o) => o.appropriate === 'required')) errs.push('필수 검사(required) 없음');

  checkList(errs, s.redFlags, 'redFlags', ['id', 'text'], (e, x, at) => {
    if (!FLAG_WHERE.includes(x.where)) e.push(at + '.where 값 오류: ' + x.where);
  });

  ['disposition', 'diagnosis'].forEach((k) => {
    const d = s[k];
    if (!d || !isArr(d.options)) { errs.push(k + '.options 없음'); return; }
    const ids = d.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) errs.push(k + '.options id 중복');
    d.options.forEach((o, i) => { if (!isStr(o.id) || !isStr(o.text)) errs.push(k + '.options[' + i + '] 형식 오류'); });
    if (!ids.includes(d.correct)) errs.push(k + '.correct가 선택지에 없음');
    if (!isStr(d.why)) errs.push(k + '.why 없음');
  });

  // 위험 신호는 반드시 어떤 행동으로 발견 가능해야 한다 (발견할 수 없는 신호로 감점하지 않는다)
  if (isArr(s.redFlags)) {
    const reachable = new Set([
      ...(s.vitals || []).map((v) => v[3]).filter(Boolean),
      ...(s.history || []).map((h) => h.flag).filter(Boolean),
      ...(s.exam || []).map((x) => x.flag).filter(Boolean),
      ...(s.orders || []).map((o) => o.flag).filter(Boolean),
    ]);
    s.redFlags.forEach((f) => { if (!reachable.has(f.id)) errs.push('redFlag ' + f.id + '를 발견할 행동이 없음'); });
  }

  if (!isArr(s.citations)) errs.push('citations 없음');
  else s.citations.forEach((c, i) => {
    if (!isStr(c.text)) errs.push('citations[' + i + '].text 없음');
    if (!isBool(c.verified)) errs.push('citations[' + i + '].verified 없음(boolean)');
  });

  return errs;
}

/* 노출 가능한 시나리오와 제외 목록으로 나눈다. */
export function partitionScenarios(list) {
  const visible = [];
  const hidden = [];
  (list || []).forEach((s) => {
    const errs = validateScenario(s);
    if (errs.length === 0) visible.push(s);
    else hidden.push({ id: (s && s.id) || '(id 없음)', errors: errs });
  });
  return { visible, hidden };
}

export { SOURCES, APPROPRIATENESS, FLAG_WHERE };

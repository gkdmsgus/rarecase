/* ═══════════════════════════════════════════════════════════
   Clinical Checkpoint 서버 엔진.

   - publicCase  : 학습자 화면에 처음 보내는 정보. 답변·소견·적절성·검토 기준은 빼고 보낸다.
   - ask         : 가상환자 문진. 응답은 증례의 facts 목록 안에서만 만든다.
                   ANTHROPIC_API_KEY가 있으면 Claude가 그 범위 안에서 말투를 만들고,
                   없거나 실패하면 규칙 기반 엔진이 facts 문장을 그대로 고른다.
   - exam / test : 학습자가 고른 진찰·검사의 결과 한 건씩
   - debrief     : 사전에 정한 검토 기준과 대조한다. 시스템이 진단의 정오를 판정하지 않는다 (원칙 2).
   ═══════════════════════════════════════════════════════════ */

import { publicMedia } from './media.js';

export const CLAUDE_MODEL = 'claude-opus-5-5';

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function publicCase(c, media = {}) {
  const photo = publicMedia(media['patient-photo']);
  const ct = publicMedia(media.ct);
  return {
    id: c.id,
    title: c.title,
    reviewed: c.reviewed,
    source: c.source,
    patient: { ...c.patient, photo },
    vitals: c.vitals,
    opening: c.opening,
    exams: c.exams.map(({ id, label }) => ({ id, label })),
    tests: c.tests.map(({ id, label, imaging }) => ({ id, label, imaging: !!imaging })),
    imaging: ct
      ? { id: c.imaging.id, title: c.imaging.title, caption: '공개 이미지 · 교육용 · 진단 사용 금지 · 이 가상 환자의 영상이 아니라 다른 실제 증례의 예시 영상', image: ct }
      : { id: c.imaging.id, title: c.imaging.title, caption: c.imaging.caption, image: null },
  };
}

/* 규칙 기반 문진: 질문에 들어 있는 낱말이 맞는 사실을 점수순으로 최대 2개 고른다
   ("토하거나 목이 뻣뻣한가요?"처럼 두 가지를 한 번에 묻는 경우). 하나도 없으면 모른다고 답한다. */
export function ruleAnswer(c, question) {
  const q = norm(question).toLowerCase();
  const scored = c.facts
    .map((f) => ({ f, score: f.keys.reduce((n, k) => n + (q.includes(k) ? k.length : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (!scored.length) return { answer: c.unknownAnswer, factIds: [], engine: 'rule' };
  return { answer: scored.map((x) => x.f.answer).join(' '), factIds: scored.map((x) => x.f.id), engine: 'rule' };
}

function systemPrompt(c) {
  const facts = c.facts.map((f) => `- [${f.id}] ${f.answer}`).join('\n');
  return [
    `너는 의대생 교육용 시뮬레이터의 가상환자다. ${c.patient.age}세 ${c.patient.sex === 'F' ? '여성' : '남성'}, 가명 ${c.patient.alias}. 주호소는 "${c.patient.chief}"이다.`,
    '학습자의 질문에 환자로서 한국어 구어체로 1~2문장만 답한다.',
    '반드시 아래 사실 목록에 있는 내용만 말한다. 목록에 없는 증상·병력·수치를 만들어 내지 않는다.',
    `목록으로 답할 수 없는 질문이면 "${c.unknownAnswer}"라고 답하고 fact_ids는 빈 배열로 둔다.`,
    '진단명이나 의학적 판단을 말하지 않는다. 의사처럼 설명하지 않는다.',
    'fact_ids에는 이번 답변에 사용한 사실의 id만 넣는다.',
    '',
    '사실 목록:',
    facts,
  ].join('\n');
}

/* Claude 문진. 키가 없거나, 거절·오류·목록 밖 id가 나오면 null을 돌려 규칙 엔진으로 넘긴다. */
export async function claudeAnswer(c, question, history, { client } = {}) {
  if (!client) return null;
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
  const { z } = await import('zod');
  const Reply = z.object({ answer: z.string(), fact_ids: z.array(z.string()) });
  const messages = [];
  for (const h of (history || []).slice(-12)) {
    if (h && h.q && h.a) {
      messages.push({ role: 'user', content: norm(h.q).slice(0, 300) });
      messages.push({ role: 'assistant', content: JSON.stringify({ answer: norm(h.a).slice(0, 300), fact_ids: [] }) });
    }
  }
  messages.push({ role: 'user', content: norm(question).slice(0, 300) });
  try {
    const response = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(Reply) },
      system: systemPrompt(c),
      messages,
    });
    if (response.stop_reason === 'refusal') return null;
    const out = response.parsed_output;
    if (!out) return null;
    const known = new Set(c.facts.map((f) => f.id));
    if (!out.fact_ids.every((id) => known.has(id))) return null;
    return { answer: norm(out.answer).slice(0, 400), factIds: out.fact_ids, engine: 'claude' };
  } catch {
    return null;
  }
}

export async function ask(c, body, opts = {}) {
  const question = norm(body && body.question);
  if (!question) return { status: 400, error: 'question required' };
  if (question.length > 300) return { status: 400, error: 'question too long' };
  const ai = await claudeAnswer(c, question, body.history, opts);
  return { result: ai || ruleAnswer(c, question) };
}

export function exam(c, body) {
  const e = c.exams.find((x) => x.id === (body && body.examId));
  if (!e) return { status: 400, error: 'unknown exam' };
  return { result: { examId: e.id, label: e.label, finding: e.finding } };
}

export function test(c, body) {
  const t = c.tests.find((x) => x.id === (body && body.testId));
  if (!t) return { status: 400, error: 'unknown test' };
  return { result: { testId: t.id, label: t.label, result: t.result, imaging: !!t.imaging } };
}

const FIT_TEXT = { required: '필수', reasonable: '타당', conditional: '조건부', 'low-yield': '우선순위 낮음' };

export function debrief(c, body, media = {}) {
  const b = body || {};
  const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 100) : []);
  const factIds = new Set(ids(b.factIds));
  const examIds = new Set(ids(b.examIds));
  const testIds = new Set(ids(b.testIds));
  const pins = Array.isArray(b.pins) ? b.pins.slice(0, 20).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];

  const found = new Set();
  c.facts.forEach((f) => { if (f.clue && factIds.has(f.id)) found.add(f.clue); });
  c.exams.forEach((e) => { if (e.clue && examIds.has(e.id)) found.add(e.clue); });
  // 목 뻣뻣함은 문진(호소)이나 진찰(경부 강직) 어느 쪽으로 확인해도 같은 단서로 센다
  if (found.has('c-neck-exam')) found.add('c-neck');

  const clues = c.review.clues.map((k) => ({ ...k, found: found.has(k.id) }));
  const exams = c.exams.map((e) => ({ id: e.id, label: e.label, required: e.required, done: examIds.has(e.id) }));
  const tests = c.tests.map((t) => ({ id: t.id, label: t.label, fit: t.fit, fitText: FIT_TEXT[t.fit], ordered: testIds.has(t.id) }));

  // 실제 CT를 쓰면 위치 기준은 매니페스트의 region(출처가 밝힌 위치)만 쓴다. 없으면 위치 대조를 하지 않는다
  const k = media.ct ? (media.ct.region || null) : c.imaging.keyRegion;
  const pinHits = k ? pins.map((p) => Math.hypot(p.x - k.x, p.y - k.y) <= k.r) : [];

  return {
    result: {
      reviewed: c.reviewed,
      clues,
      exams,
      tests,
      imaging: {
        viewed: !!b.imagingViewed,
        pins: pins.length,
        pinInRegion: k ? pinHits.some(Boolean) : null,
        region: k,
        criterion: c.review.imagingFinding,
      },
      reasoning: c.review.reasoning,
      citations: c.review.citations,
      report: {
        clues: norm(b.report && b.report.clues).slice(0, 2000),
        choices: norm(b.report && b.report.choices).slice(0, 2000),
        imaging: norm(b.report && b.report.imaging).slice(0, 2000),
        judgement: norm(b.report && b.report.judgement).slice(0, 2000),
        uncertainty: norm(b.report && b.report.uncertainty).slice(0, 2000),
      },
    },
  };
}

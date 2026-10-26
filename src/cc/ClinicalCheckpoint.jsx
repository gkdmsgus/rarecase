import React, { useEffect, useMemo, useRef, useState } from 'react';
import PatientAvatar from './PatientAvatar.jsx';
import CtViewer from './CtViewer.jsx';
import './cc.css';

/* ═══════════════════════════════════════════════════════════
   Clinical Checkpoint — 논문의 학습 흐름(그림 2)을 그대로 구현한다.
   ② 가상환자 문진 → ③ 진찰·관찰(신체 진찰, 검사 선택, CT 관찰) → ④ 근거보고서 → ⑤ 디브리핑
   ① 증례 정의는 서버의 증례 파일(server/cc/case-headache.js)이다.
   답변·소견·검토 기준은 서버가 갖고 있고, 학습자가 그 행동을 했을 때만 받는다.
   ═══════════════════════════════════════════════════════════ */

const STEPS = [
  { id: 'interview', label: '가상환자 문진' },
  { id: 'exam', label: '신체 진찰' },
  { id: 'tests', label: '검사 선택' },
  { id: 'ct', label: 'CT 관찰' },
  { id: 'report', label: '근거보고서' },
  { id: 'debrief', label: '디브리핑' },
];

async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
  return data;
}

function PatientCard({ c }) {
  const p = c.patient;
  return (
    <section className="cc-card cc-patient">
      <div className={'ph' + (p.photo ? ' photo' : '')}>
        {p.photo ? <img src={p.photo.url} alt={`가상환자 ${p.alias}(가명) 사진`} /> : <PatientAvatar pain={0.7} />}
      </div>
      {p.photo && <div className="credit" title={p.photo.sourceUrl}>사진: {p.photo.attribution} · 실제 환자 아님(설정)</div>}
      <div className="info">
        <div className="name">{p.alias}<small>(가명)</small></div>
        <div className="meta">{p.age}세 · {p.sex === 'F' ? '여성' : '남성'}</div>
        <dl>
          <div><dt>주호소</dt><dd>{p.chief}</dd></div>
          <div><dt>발병</dt><dd>{p.onset}</dd></div>
          <div><dt>상태</dt><dd>{p.status}</dd></div>
        </dl>
        <div className="cc-vitals">
          {c.vitals.map((v) => (
            <div key={v.k} className={v.warn ? 'warn' : ''}><span>{v.k}</span><b>{v.v}</b></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Memo({ title, sub, value, onChange, placeholder, next, onNext, disabled, hint }) {
  return (
    <section className="cc-card cc-col cc-memo">
      <h3>{title}<small>{sub}</small></h3>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p className="cc-hint">{hint}</p>}
      <div style={{ flex: 1, minHeight: 16 }} />
      <button type="button" className="cc-next" onClick={onNext} disabled={disabled}>{next}</button>
    </section>
  );
}

function Rows({ items }) {
  return (
    <ul className="cc-rows">
      {items.map((it) => (
        <li key={it.key} className={it.cls}><b>{it.badge}</b><span>{it.text}</span></li>
      ))}
    </ul>
  );
}

export default function ClinicalCheckpoint({ onExit }) {
  const [c, setC] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState('interview');
  const [chat, setChat] = useState([]);          // {q, a, factIds}
  const [pending, setPending] = useState(false);
  const [question, setQuestion] = useState('');
  const [engine, setEngine] = useState(null);
  const [memo, setMemo] = useState('');
  const [exams, setExams] = useState({});        // id -> finding
  const [tests, setTests] = useState({});        // id -> {result, reason}
  const [pins, setPins] = useState([]);
  const [pinning, setPinning] = useState(false);
  const [ctMemo, setCtMemo] = useState('');
  const [ctViewed, setCtViewed] = useState(false);
  const [report, setReport] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const chatEnd = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/cc/case').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => alive && setC(d)).catch((e) => alive && setLoadError(e.message));
    return () => { alive = false; };
  }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [chat, pending]);

  const ctOrdered = !!tests['t-ct'];
  const order = STEPS.map((s) => s.id);
  const reached = useMemo(() => {
    const r = new Set(['interview']);
    if (chat.length) r.add('exam');
    if (Object.keys(exams).length) r.add('tests');
    if (ctOrdered) r.add('ct');
    if (Object.keys(tests).length) r.add('report');
    if (result) r.add('debrief');
    r.add(step);
    return r;
  }, [chat.length, exams, tests, ctOrdered, result, step]);

  if (loadError) return <div className="cc"><div className="cc-frame"><div className="cc-body">증례를 불러오지 못했습니다 ({loadError}).</div></div></div>;
  if (!c) return <div className="cc"><div className="cc-frame"><div className="cc-body">증례 불러오는 중…</div></div></div>;

  const reset = () => {
    setStep('interview'); setChat([]); setQuestion(''); setMemo(''); setExams({}); setTests({});
    setPins([]); setPinning(false); setCtMemo(''); setCtViewed(false); setReport(null); setResult(null); setError(null);
  };

  const ask = async () => {
    const q = question.trim();
    if (!q || pending || result) return;
    setQuestion(''); setPending(true); setError(null);
    try {
      const r = await post('/api/cc/ask', { question: q, history: chat.map(({ q: qq, a }) => ({ q: qq, a })) });
      setChat((h) => [...h, { q, a: r.answer, factIds: r.factIds }]);
      setEngine(r.engine);
    } catch (e) { setError('답변을 받지 못했습니다: ' + e.message); setQuestion(q); }
    finally { setPending(false); }
  };

  const doExam = async (id) => {
    if (exams[id] || result) return;
    try { const r = await post('/api/cc/exam', { examId: id }); setExams((m) => ({ ...m, [id]: r.finding })); }
    catch (e) { setError(e.message); }
  };

  const doTest = async (id) => {
    if (tests[id] || result) return;
    try { const r = await post('/api/cc/test', { testId: id }); setTests((m) => ({ ...m, [id]: { result: r.result, reason: '' } })); }
    catch (e) { setError(e.message); }
  };

  const factIds = [...new Set(chat.flatMap((m) => m.factIds || []))];

  const openReport = () => {
    if (!report) {
      const examLines = c.exams.filter((e) => exams[e.id]).map((e) => `${e.label}: ${exams[e.id]}`);
      const testLines = c.tests.filter((t) => tests[t.id]).map((t) => `${t.label}${tests[t.id].reason ? ` — 이유: ${tests[t.id].reason}` : ''}`);
      setReport({
        clues: memo,
        choices: [...(examLines.length ? ['[진찰] ' + examLines.join(' / ')] : []), ...(testLines.length ? ['[검사] ' + testLines.join(' / ')] : [])].join('\n'),
        imaging: [ctMemo, pins.length ? `관찰 핀 ${pins.length}개 표시` : ''].filter(Boolean).join('\n'),
        judgement: '',
        uncertainty: '',
      });
    }
    setStep('report');
  };

  const submit = async () => {
    setError(null);
    try {
      const r = await post('/api/cc/debrief', {
        factIds, examIds: Object.keys(exams), testIds: Object.keys(tests), pins, imagingViewed: ctViewed, report,
      });
      setResult(r); setStep('debrief');
    } catch (e) { setError('제출하지 못했습니다: ' + e.message); }
  };

  const goto = (id) => { if (reached.has(id) && !(id === 'ct' && !ctOrdered)) { setStep(id); if (id === 'ct') setCtViewed(true); } };

  return (
    <div className="cc">
      <div className="cc-frame">
        <header className="cc-head">
          <div className="cc-logo"><i aria-hidden="true">+</i><span>Clinical</span><b>Checkpoint</b></div>
          {!c.reviewed && <span className="cc-badge">확인 필요 · 미검수 시나리오</span>}
          <span className="cc-spacer" />
          <button type="button" className="cc-ghost" onClick={reset}>처음부터</button>
          {onExit && <button type="button" className="cc-ghost" onClick={onExit}>판독 콘솔로</button>}
        </header>

        <nav className="cc-steps" aria-label="학습 단계">
          {STEPS.map((s, i) => {
            const on = s.id === step;
            const done = !on && reached.has(s.id) && order.indexOf(s.id) < order.indexOf(step);
            const can = reached.has(s.id) && !(s.id === 'ct' && !ctOrdered) && !(result && s.id !== 'debrief' && false);
            return (
              <button key={s.id} type="button" className={'cc-step' + (on ? ' on' : '') + (done ? ' done' : '')}
                      disabled={!can} onClick={() => goto(s.id)}>
                <em>{done ? '✓' : i + 1}</em>{s.label}
              </button>
            );
          })}
        </nav>

        <main className="cc-body">
          {error && <div className="cc-note warn" role="alert">{error}</div>}

          {step === 'interview' && (
            <div className="cc-grid">
              <PatientCard c={c} />
              <section className="cc-card cc-col">
                <h3>가상 환자 문진</h3>
                <div className="cc-chat">
                  <div className="cc-msg pt">{c.opening}</div>
                  {chat.map((m, i) => (
                    <React.Fragment key={i}>
                      <div className="cc-msg me">{m.q}</div>
                      <div className="cc-msg pt">{m.a}</div>
                    </React.Fragment>
                  ))}
                  {pending && <div className="cc-msg pt typing">답하는 중…</div>}
                  <div ref={chatEnd} />
                </div>
                <form className="cc-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="환자에게 질문하세요" maxLength={300} disabled={!!result} aria-label="환자에게 할 질문" />
                  <button type="submit" className="cc-send" disabled={!question.trim() || pending || !!result}>전송</button>
                </form>
                <div className="cc-engine">
                  {engine === 'claude' ? '응답: 생성형 AI (검수된 증례 사실 범위 안에서만)' : '응답: 증례 사실 목록에서 선택 (생성형 AI 연결 안 됨)'}
                </div>
              </section>
              <Memo title="메모" sub="현재 판단" value={memo} onChange={setMemo}
                    placeholder="문진에서 확인한 단서와 지금의 판단을 적어 두세요"
                    next="신체 진찰" onNext={() => setStep('exam')} disabled={chat.length === 0}
                    hint={chat.length === 0 ? '질문을 한 번 이상 해야 다음으로 갈 수 있습니다.' : null} />
            </div>
          )}

          {step === 'exam' && (
            <div className="cc-grid">
              <PatientCard c={c} />
              <section className="cc-card cc-col">
                <h3>신체 진찰<small>필요한 진찰을 고르세요. 결과는 고른 항목만 보입니다.</small></h3>
                <div className="cc-list">
                  {c.exams.map((e) => (
                    <button key={e.id} type="button" className={'cc-item' + (exams[e.id] ? ' done' : '')} onClick={() => doExam(e.id)} disabled={!!exams[e.id] || !!result}
                            aria-label={e.label + (exams[e.id] ? ' — ' + exams[e.id] : '')}>
                      <span className="tick">{exams[e.id] ? '✓' : ''}</span>
                      <span><span className="what">{e.label}</span>{exams[e.id] && <span className="res">{exams[e.id]}</span>}</span>
                    </button>
                  ))}
                </div>
              </section>
              <Memo title="메모" sub="현재 판단" value={memo} onChange={setMemo} placeholder="진찰 소견을 더해 판단을 고쳐 적으세요"
                    next="검사 선택" onNext={() => setStep('tests')} disabled={Object.keys(exams).length === 0}
                    hint={Object.keys(exams).length === 0 ? '진찰을 한 가지 이상 해야 다음으로 갈 수 있습니다.' : null} />
            </div>
          )}

          {step === 'tests' && (
            <div className="cc-grid two">
              <section className="cc-card cc-col">
                <h3>검사 선택<small>오더한 검사마다 선택 이유를 남기면 근거보고서에 들어갑니다.</small></h3>
                <div className="cc-list">
                  {c.tests.map((t) => {
                    const o = tests[t.id];
                    return (
                      <div key={t.id} className={'cc-item' + (o ? ' done' : '')} style={{ cursor: o ? 'default' : 'pointer' }}
                           onClick={() => !o && doTest(t.id)} role="button" tabIndex={0} aria-label={t.label + (o ? ' — 오더함' : '')}
                           onKeyDown={(e) => { if (!o && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); doTest(t.id); } }}>
                        <span className="tick">{o ? '✓' : ''}</span>
                        <span style={{ flex: 1 }}>
                          <span className="what">{t.label}</span>{t.imaging && <span className="tag">영상</span>}
                          {o && <span className="res">{o.result}</span>}
                          {o && (
                            <input className="cc-reason" placeholder="이 검사를 고른 이유" value={o.reason} onClick={(e) => e.stopPropagation()}
                                   onChange={(e) => setTests((m) => ({ ...m, [t.id]: { ...m[t.id], reason: e.target.value } }))} />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <Memo title="메모" sub="현재 판단" value={memo} onChange={setMemo} placeholder="검사 계획과 판단을 적으세요"
                    next={ctOrdered ? 'CT 관찰' : '근거보고서 작성'}
                    onNext={() => { if (ctOrdered) { setStep('ct'); setCtViewed(true); } else openReport(); }}
                    disabled={Object.keys(tests).length === 0}
                    hint={Object.keys(tests).length === 0 ? '검사를 한 가지 이상 오더해야 다음으로 갈 수 있습니다.' : (!ctOrdered ? '영상 검사를 오더하지 않으면 영상 관찰 없이 보고서로 넘어갑니다.' : null)} />
            </div>
          )}

          {step === 'ct' && (
            <>
              <h2 className="cc-title">CT 관찰</h2>
              <div className="cc-grid two">
                <section className="cc-card">
                  <h3>{c.imaging.title}</h3>
                  <CtViewer image={c.imaging.image} pins={pins} pinning={pinning} onTogglePin={() => setPinning((v) => !v)}
                            onAddPin={(p) => setPins((ps) => (ps.length >= 9 ? ps : [...ps, p]))} />
                  <div className="cc-caption">
                    {c.imaging.caption}{c.imaging.image ? <> · 출처: {c.imaging.image.attribution}</> : ' · 도식으로 그린 그림이며 실제 의료영상이 아닙니다.'}
                    {pins.length > 0 && <> · 핀 {pins.length}개 <button type="button" className="cc-ghost" style={{ padding: '1px 8px', marginLeft: 6 }} onClick={() => setPins([])}>핀 지우기</button></>}
                  </div>
                </section>
                <Memo title="메모" sub="관찰 메모" value={ctMemo} onChange={setCtMemo} placeholder="관찰 내용"
                      next="근거보고서 작성" onNext={openReport} />
              </div>
            </>
          )}

          {step === 'report' && report && (
            <div className="cc-grid two">
              <section className="cc-card">
                <h3>근거보고서<small>문진·진찰·검사·영상 메모를 모아 두었습니다. 판단과 근거를 정리해 제출하세요.</small></h3>
                <div className="cc-report">
                  {[
                    ['clues', '확인한 임상 단서', '문진·진찰에서 얻은 것'],
                    ['choices', '진찰·검사 선택과 이유', ''],
                    ['imaging', '영상에서 관찰한 소견', ''],
                    ['judgement', '판단과 근거', '단서를 어떻게 연결했는지'],
                    ['uncertainty', '불확실한 점', '더 확인해야 할 것'],
                  ].map(([k, label, sub]) => (
                    <div key={k}>
                      <label htmlFor={'r-' + k}>{label}{sub && <small>{sub}</small>}</label>
                      <textarea id={'r-' + k} value={report[k]} onChange={(e) => setReport((r) => ({ ...r, [k]: e.target.value }))} disabled={!!result} />
                      {k === 'clues' && chat.length > 0 && (
                        <div className="cc-chips">{chat.map((m, i) => <span key={i}>{m.q}</span>)}</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section className="cc-card cc-col cc-memo">
                <h3>제출 전 확인</h3>
                <ul className="cc-rows">
                  <li className="na"><b>문진</b><span>질문 {chat.length}개</span></li>
                  <li className="na"><b>진찰</b><span>{Object.keys(exams).length}개 항목</span></li>
                  <li className="na"><b>검사</b><span>{Object.keys(tests).length}개 오더</span></li>
                  <li className="na"><b>영상</b><span>{ctViewed ? `관찰함 · 핀 ${pins.length}개` : '관찰 안 함'}</span></li>
                </ul>
                <p className="cc-hint">제출하면 사전에 정한 검토 기준과 대조합니다. 시스템이 진단의 정오를 판정하지 않습니다.</p>
                <div style={{ flex: 1, minHeight: 16 }} />
                <button type="button" className="cc-next" onClick={submit} disabled={!!result || !report.judgement.trim()}>디브리핑</button>
                {!report.judgement.trim() && <p className="cc-hint">‘판단과 근거’를 적어야 제출할 수 있습니다.</p>}
              </section>
            </div>
          )}

          {step === 'debrief' && result && (
            <>
              <h2 className="cc-title">디브리핑</h2>
              <div className="cc-note">사전에 정한 검토 기준과 대조한 결과입니다. 시스템이 진단의 정오를 판정하지 않으며, 놓친 단서와 근거를 되돌아보는 자료입니다.</div>
              {!result.reviewed && <div className="cc-note warn">확인 필요 · 이 증례의 검토 기준과 근거 문장은 아직 임상전문가 검수 전입니다.</div>}
              <div className="cc-sum">
                <div><span>확인한 단서</span><b>{result.clues.filter((x) => x.found).length} / {result.clues.length}</b></div>
                <div><span>필수 진찰</span><b>{result.exams.filter((x) => x.required && x.done).length} / {result.exams.filter((x) => x.required).length}</b></div>
                <div><span>필수 검사</span><b>{result.tests.filter((x) => x.fit === 'required' && x.ordered).length} / {result.tests.filter((x) => x.fit === 'required').length}</b></div>
                <div><span>영상 핀</span><b>{result.imaging.pinInRegion === null ? `${result.imaging.pins}개 기록` : result.imaging.pinInRegion ? '영역 안' : result.imaging.pins ? '영역 밖' : '없음'}</b></div>
              </div>
              <div className="cc-grid two" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <section className="cc-card">
                  <h3>임상 단서</h3>
                  <Rows items={result.clues.map((x) => ({ key: x.id, cls: x.found ? 'ok' : 'miss', badge: x.found ? '확인' : '누락', text: x.text }))} />
                  <h3 style={{ marginTop: 16 }}>신체 진찰</h3>
                  <Rows items={result.exams.map((x) => ({ key: x.id, cls: x.done ? 'ok' : x.required ? 'miss' : 'na', badge: x.done ? '시행' : x.required ? '누락' : '선택', text: x.label }))} />
                </section>
                <section className="cc-card">
                  <h3>검사 선택</h3>
                  <Rows items={result.tests.map((x) => ({
                    key: x.id,
                    cls: x.ordered ? (x.fit === 'low-yield' ? 'miss' : 'ok') : (x.fit === 'required' ? 'miss' : 'na'),
                    badge: x.ordered ? '오더' : '안 함',
                    text: `${x.label} · 검토 기준: ${x.fitText}`,
                  }))} />
                  <h3 style={{ marginTop: 16 }}>영상 관찰</h3>
                  <Rows items={[{
                    key: 'img', cls: result.imaging.pinInRegion ? 'ok' : result.imaging.pinInRegion === null ? 'na' : 'miss',
                    badge: result.imaging.pinInRegion ? '표시' : result.imaging.pinInRegion === null ? '기록' : '확인',
                    text: result.imaging.region ? `${result.imaging.criterion} — 기준 영역: ${result.imaging.region.label}` : `${result.imaging.criterion} — 이 영상에는 출처가 밝힌 위치 기준이 없어 핀 위치는 대조하지 않습니다`,
                  }]} />
                </section>
              </div>
              <section className="cc-card">
                <h3>내 판단과 근거 vs 검토 기준</h3>
                <div className="cc-cmp">
                  <div>
                    <p><b>내 보고서</b></p>
                    <div className="mine">{result.report.judgement || '(비어 있음)'}</div>
                    {result.report.uncertainty && <><p style={{ marginTop: 10 }}><b>불확실한 점</b></p><div className="mine">{result.report.uncertainty}</div></>}
                  </div>
                  <div>
                    <p><b>검토 기준</b>{!result.reviewed && <span className="cc-unverified">확인 필요</span>}</p>
                    <ul className="cc-rows">{result.reasoning.map((t, i) => <li key={i} className="na"><b>{i + 1}</b><span>{t}</span></li>)}</ul>
                    <p style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
                      근거: {result.citations.map((x) => x.text).join(' · ')}{result.citations.some((x) => !x.verified) && <span className="cc-unverified">원문 대조 전</span>}
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>

        <footer className="cc-foot">
          <span>교육용 시뮬레이터 · 실제 진단에 사용하지 않습니다</span>
          <span>가상 환자 · 가명</span>
          <span>{c.imaging.image ? '영상은 공개 이미지이며 교육용입니다 · 진단 사용 금지' : '영상은 도식 그림이며 실제 의료영상이 아닙니다'}</span>
        </footer>
      </div>
    </div>
  );
}

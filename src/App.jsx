import React, { useState, useEffect, useRef } from 'react';
import { gradeAttempt, keyToAction } from './lib/grading.js';

/* ═══════════════════════════════════════════════════════════
   케이스는 서버(/api/cases)가 준다. 서버가 case-schema.js로 걸러
   승인됐고 형식이 온전한 케이스만 보내므로, 미승인 케이스는
   브라우저에 아예 도착하지 않는다 (원칙 4).
   ═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   영상 플레이스홀더
   실제 의료영상이 아니다. 데모 흐름을 보여주기 위해 코드로
   그린 도식적 렌더링이며, 사실적으로 보이지 않도록 의도했다.
   ═══════════════════════════════════════════════════════════ */

function drawFilm(cv, variant){
  const W = 520, H = 610;
  cv.width = W * 2; cv.height = H * 2;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const g = cv.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);

  g.fillStyle = '#04070a'; g.fillRect(0, 0, W, H);

  const soft = g.createRadialGradient(W/2, H*0.46, 40, W/2, H*0.46, W*0.72);
  soft.addColorStop(0,   'rgba(126,142,158,0.30)');
  soft.addColorStop(0.62,'rgba(84,98,112,0.15)');
  soft.addColorStop(1,   'rgba(0,0,0,0)');
  g.fillStyle = soft; g.fillRect(0, 0, W, H);

  const ell = (x,y,rx,ry,fill,rot=0)=>{
    g.save(); g.translate(x,y); g.rotate(rot);
    g.beginPath(); g.ellipse(0,0,rx,ry,0,0,Math.PI*2);
    g.fillStyle = fill; g.fill(); g.restore();
  };

  // lung fields (air = dark)
  ell(W*0.33, H*0.44, 92, 156, 'rgba(2,4,7,0.90)');
  ell(W*0.67, H*0.44, 92, 156, 'rgba(2,4,7,0.90)');

  // pulmonary vascular markings — branching from hila outward.
  // 기흉에서는 흉막선 바깥에서 이 음영이 사라지는 것이 핵심 소견.
  const drawVessels = (side)=>{
    const hx = W/2 + side*40, hy = H*0.44;
    g.strokeStyle = 'rgba(190,204,218,0.26)';
    for(let i=0;i<7;i++){
      const a = (-0.85 + i*0.30) * (side>0?1:-1);
      const len = 68 + (i%3)*26;
      g.lineWidth = 2.4 - (i%3)*0.55;
      g.beginPath(); g.moveTo(hx, hy);
      g.quadraticCurveTo(
        hx + side*len*0.55, hy + Math.sin(a)*len*0.75,
        hx + side*len,      hy + Math.sin(a)*len*1.5
      );
      g.stroke();
    }
  };
  drawVessels(-1); drawVessels(1);

  // mediastinum + spine
  const med = g.createLinearGradient(W/2-34,0,W/2+34,0);
  med.addColorStop(0,'rgba(0,0,0,0)');
  med.addColorStop(0.5,'rgba(178,192,206,0.42)');
  med.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = med; g.fillRect(W/2-34, H*0.13, 68, H*0.56);

  g.strokeStyle = 'rgba(196,208,220,0.20)'; g.lineWidth = 1;
  for(let i=0;i<11;i++){
    const y = H*0.16 + i*(H*0.50/11);
    g.beginPath(); g.moveTo(W/2-13,y); g.lineTo(W/2+13,y); g.stroke();
  }

  // heart shadow — patient's left, viewer's right in PA
  ell(W*0.575, H*0.545, 78, 96, 'rgba(160,175,190,0.34)', -0.16);

  // ribs
  g.lineWidth = 2.1;
  for(let s=-1; s<=1; s+=2){
    for(let i=0;i<9;i++){
      const y = H*0.185 + i*30;
      g.beginPath();
      g.strokeStyle = 'rgba(206,218,230,' + (0.30 - i*0.017) + ')';
      g.moveTo(W/2 + s*16, y);
      g.quadraticCurveTo(W/2 + s*(112 + i*7), y + 20 + i*7, W/2 + s*(150 + i*3), y + 96 + i*10);
      g.stroke();
    }
  }

  // clavicles
  g.lineWidth = 4.4; g.strokeStyle = 'rgba(214,226,238,0.38)';
  [-1,1].forEach(s=>{
    g.beginPath(); g.moveTo(W/2 + s*14, H*0.155);
    g.quadraticCurveTo(W/2 + s*80, H*0.118, W/2 + s*152, H*0.152); g.stroke();
  });

  // diaphragm
  g.lineWidth = 3; g.strokeStyle = 'rgba(196,210,224,0.44)';
  [[0.30,0.735],[0.68,0.755]].forEach(([cx,cy])=>{
    g.beginPath(); g.moveTo(W*cx-108, H*(cy+0.045));
    g.quadraticCurveTo(W*cx, H*(cy-0.055), W*cx+108, H*(cy+0.052)); g.stroke();
  });
  g.fillStyle = 'rgba(96,110,124,0.34)';
  g.fillRect(0, H*0.80, W, H*0.20);

  /* ── 케이스별 소견 ─────────────────────────────────────── */

  if(variant === 'pavm'){
    /* 우하폐야(환자 우측 = 화면 좌측)의 경계 뚜렷한 결절 +
       폐문으로 향하는 굵은 공급/유출 혈관 음영. */
    const nx = W*0.305, ny = H*0.615;

    g.lineWidth = 3.4; g.strokeStyle = 'rgba(226,236,246,0.50)';
    g.beginPath(); g.moveTo(nx+11, ny-6);
    g.quadraticCurveTo(W*0.40, H*0.575, W/2-26, H*0.505); g.stroke();
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(nx+8, ny+7);
    g.quadraticCurveTo(W*0.395, H*0.625, W/2-24, H*0.545); g.stroke();

    const nod = g.createRadialGradient(nx, ny, 2, nx, ny, 22);
    nod.addColorStop(0,   'rgba(240,246,252,0.92)');
    nod.addColorStop(0.62,'rgba(210,222,234,0.72)');
    nod.addColorStop(1,   'rgba(150,166,182,0)');
    g.beginPath(); g.arc(nx, ny, 22, 0, Math.PI*2);
    g.fillStyle = nod; g.fill();
  }

  if(variant === 'ptx'){
    /* 우측(화면 좌측) 폐첨부 기흉.
       흉막선을 그리고, 그 바깥의 폐혈관 음영을 지운다. */
    const line = (ctx)=>{
      ctx.beginPath();
      ctx.moveTo(W*0.115, H*0.315);
      ctx.quadraticCurveTo(W*0.185, H*0.135, W*0.415, H*0.175);
      ctx.quadraticCurveTo(W*0.455, H*0.205, W*0.452, H*0.255);
    };

    // 흉막선 바깥(폐첨 방향)만 남기고 혈관 음영 제거
    g.save();
    g.beginPath();
    g.moveTo(W*0.09, H*0.32);
    g.lineTo(W*0.09, H*0.10);
    g.lineTo(W*0.47, H*0.10);
    g.lineTo(W*0.452, H*0.255);
    g.quadraticCurveTo(W*0.455, H*0.205, W*0.415, H*0.175);
    g.quadraticCurveTo(W*0.185, H*0.135, W*0.115, H*0.315);
    g.closePath();
    g.clip();
    g.fillStyle = 'rgba(3,5,8,0.93)';
    g.fillRect(W*0.08, H*0.08, W*0.42, H*0.28);
    g.restore();

    // 허탈된 폐 가장자리 = 얇고 선명한 흉막선
    g.lineWidth = 2.2;
    g.strokeStyle = 'rgba(236,244,252,0.86)';
    line(g); g.stroke();

    g.lineWidth = 6;
    g.strokeStyle = 'rgba(236,244,252,0.10)';
    line(g); g.stroke();
  }

  // film grain
  const img = g.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for(let i=0;i<d.length;i+=4){
    const n = (Math.random()-0.5)*17;
    d[i]+=n; d[i+1]+=n; d[i+2]+=n;
  }
  g.putImageData(img, 0, 0);

  // vignette
  g.setTransform(2, 0, 0, 2, 0, 0);
  const vg = g.createRadialGradient(W/2,H/2,W*0.30,W/2,H/2,W*0.80);
  vg.addColorStop(0,'rgba(0,0,0,0)');
  vg.addColorStop(1,'rgba(0,0,0,0.72)');
  g.fillStyle = vg; g.fillRect(0,0,W,H);
}

function Film({ variant }){
  const ref = useRef(null);
  useEffect(()=>{ if(ref.current) drawFilm(ref.current, variant); },[variant]);
  const wm = 'AI 생성 · 교육용 · 진단 사용 금지';
  return (
    <div className="film">
      <canvas ref={ref} aria-label="데모용 흉부 X-ray 스타일 플레이스홀더 이미지" />
      <div className="wm-corner">SYNTHETIC</div>
      <div className="lat-mark">R</div>
      <div className="wm-diag" aria-hidden="true">
        <span>{wm}<br/>{wm}<br/>{wm}<br/>{wm}<br/>{wm}</span>
      </div>
      <div className="wm-bar">
        <span>AI 생성 영상 · 교육용</span>
        <span>진단 사용 금지</span>
      </div>
    </div>
  );
}

/* 근거 문단의 **강조** 처리 */
function rich(s){
  return s.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2,-2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

/* ═══════════════════════════════════════════════════════════ */

function App({ cases: CASES, hidden: HIDDEN_CASES }){
  const [caseId, setCaseId] = useState(CASES[0].id);
  const [asked,  setAsked]  = useState([]);
  const [typing, setTyping] = useState(false);
  const [phase,  setPhase]  = useState('idle');   // idle | scanning | film
  const [finding, setFinding] = useState(null);
  const [dx, setDx] = useState(null);
  const [result, setResult] = useState(null);   // gradeAttempt() 결과, 제출 전 null
  const graded = result !== null;
  const chatEnd = useRef(null);
  const timers = useRef([]);

  const track = (id)=>{ timers.current.push(id); return id; };
  const clearAll = ()=>{ timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(()=>clearAll,[]);

  useEffect(()=>{ chatEnd.current?.scrollIntoView({block:'end'}); },[asked, typing]);

  const cur = CASES.find(c=>c.id===caseId);

  const newSession = (id)=>{
    clearAll();
    setCaseId(id); setAsked([]); setTyping(false);
    setPhase('idle'); setFinding(null); setDx(null); setResult(null);
  };

  const ask = (item)=>{
    if(typing || asked.some(a=>a.q===item.q)) return;
    setAsked(p=>[...p,{q:item.q,a:null}]);
    setTyping(true);
    track(setTimeout(()=>{
      setAsked(p=>p.map(m=>m.q===item.q?{...m,a:item.a}:m));
      setTyping(false);
    }, 620));
  };

  const order = (o)=>{
    if(!o.ready || phase!=='idle') return;
    setPhase('scanning');
    track(setTimeout(()=>setPhase('film'), 1500));
  };

  const canSubmit = finding && dx && !graded;

  // 제출 순간의 선택·문진으로 채점하고 고정한다 (제출 뒤 질문을 더 해도 결과는 그대로)
  const submit = ()=>{
    if(!canSubmit) return;
    setResult(gradeAttempt(cur, {
      finding, dx, asked: asked.map(m=>m.q),
    }));
  };

  // 판독 중 키보드: 1–4 소견, A–D 진단, Enter 제출
  useEffect(()=>{
    if(phase!=='film' || graded) return;
    const onKey = (e)=>{
      const act = keyToAction(e, cur.findings.length, cur.diagnoses.length);
      if(!act) return;
      // 선택지가 아닌 버튼(케이스·처음부터·질문 등)에 포커스가 있으면 Enter는 그 버튼 몫
      if(act.type==='submit' && e.target.closest?.('button:not(.opt)')) return;
      e.preventDefault();
      if(act.type==='finding') setFinding(cur.findings[act.index].id);
      if(act.type==='dx') setDx(cur.diagnoses[act.index].id);
      if(act.type==='submit') submit();
    };
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  });

  const resOf = (list, picked, id)=>{
    if(!graded) return undefined;
    const it = list.find(x=>x.id===id);
    if(it.correct) return 'ok';
    return id===picked ? 'miss' : undefined;
  };

  return (
    <div className="app">

      <header className="topbar">
        <div className="brand">
          <b>RareCase</b>
          <span>Reading Console</span>
        </div>
        <div className="mix" title="희귀 소견만 연속 제시하면 유병률 감각이 무너진다">
          <span>세션 구성</span>
          <span className="bars">
            <i className="on"/><i className="com"/><i className="com"/><i/>
          </span>
          <span>희귀 1 : 흔함 2 : 정상 1</span>
        </div>
        <div className="spacer"/>
        <button className="reset" onClick={()=>newSession(CASES[0].id)}>처음부터</button>
      </header>

      <main className="console">

        {/* ── 케이스 레일 ── */}
        <section className="pane">
          <div className="pane-hd">케이스</div>
          <div className="pane-bd">
            <div className="caselist">
              {CASES.map(c=>(
                <button key={c.id} className="case"
                        data-sel={c.id===caseId?'1':'0'}
                        onClick={()=>newSession(c.id)}>
                  <span className="case-id">{c.id}</span>
                  <span className="case-who">{c.who}</span>
                  <span className="case-cc">{c.cc}</span>
                  <span className={'tag ' + c.rarity}>
                    {c.rarity==='rare'?'희귀':c.rarity==='common'?'흔함':'정상'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 환자 · 문진 ── */}
        <section className="pane">
          <div className="pane-hd">환자 · 문진</div>
          <div className="pane-bd">
            <dl className="vitals">
              {cur.vitals.map(([k,v,flag])=>(
                <div className="vital" key={k}>
                  <dt>{k}</dt>
                  <dd className={flag?'flag':''}>{v}</dd>
                </div>
              ))}
            </dl>

            <div className="chat">
              <div className="msg a">
                <span className="who">환자</span>
                {cur.who} · {cur.intro}
              </div>
              {asked.map((m,i)=>(
                <React.Fragment key={i}>
                  <div className="msg q"><span className="who">학습자</span>{m.q}</div>
                  {m.a && <div className="msg a"><span className="who">환자</span>{m.a}</div>}
                </React.Fragment>
              ))}
              {typing && (
                <div className="msg a dots" aria-label="환자가 답하는 중">
                  <i/><i/><i/>
                </div>
              )}
              <div ref={chatEnd}/>
            </div>

            <div className="sect-label">질문</div>
            <div className="chips">
              {cur.questions.map(q=>(
                <button key={q.q}
                        className={'chip' + (asked.some(a=>a.q===q.q)?' used':'')}
                        disabled={typing || asked.some(a=>a.q===q.q)}
                        onClick={()=>ask(q)}>{q.q}</button>
              ))}
            </div>

            <div className="sect-label">검사 오더</div>
            <div className="orders">
              {cur.orders.map(o=>(
                <button key={o.key} className="order"
                        disabled={!o.ready || phase!=='idle'}
                        onClick={()=>order(o)}>{o.label}</button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 뷰어 · 판독 ── */}
        <section className="pane viewer-pane">
          <div className="pane-hd">
            영상 뷰어
            <span style={{marginLeft:'auto',color:'var(--ok)'}}
                  title={'승인: ' + cur.approval.by}>● 승인됨 · 데모 가정</span>
          </div>

          <div className="viewer">
            {phase==='idle' && (
              <div className="idle">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" strokeWidth="1.4">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M3 14l5-4 4 3 3-2 6 4"/>
                </svg>
                검사 오더 대기
              </div>
            )}
            {phase==='scanning' && (
              <div className="scanning">
                <div className="scanline"/>
                <div className="scan-txt">촬영 중 · 승인된 영상 불러오는 중</div>
              </div>
            )}
            {phase==='film' && <Film variant={cur.film}/>}
          </div>

          {phase==='film' && (
            <div className="study-line">
              <span><b>STUDY</b> {cur.study.name}</span>
              <span><b>ACC</b> {cur.study.acc}</span>
              <span><b>승인</b> {cur.approval.date}</span>
              <span><b>승인자</b> {cur.approval.by}</span>
            </div>
          )}

          <div className="readout">
            {phase==='film' && !graded && (
              <React.Fragment>
                <div className="sect-label">판독 소견 — 하나 선택</div>
                <div className="opts">
                  {cur.findings.map((f,i)=>(
                    <button key={f.id} className="opt" data-on={finding===f.id?'1':'0'}
                            onClick={()=>setFinding(f.id)}>
                      <span className="key">{i+1}</span>{f.text}
                    </button>
                  ))}
                </div>

                <div className="sect-label">추정 진단</div>
                <div className="opts">
                  {cur.diagnoses.map((d,i)=>(
                    <button key={d.id} className="opt" data-on={dx===d.id?'1':'0'}
                            onClick={()=>setDx(d.id)}>
                      <span className="key">{String.fromCharCode(65+i)}</span>{d.text}
                    </button>
                  ))}
                </div>

                <button className="submit" disabled={!canSubmit}
                        onClick={submit}>
                  판독 제출
                </button>
                <div className="kbd-hint">키보드 · 1–{cur.findings.length} 소견 · A–{String.fromCharCode(64+cur.diagnoses.length)} 진단 · Enter 제출</div>
              </React.Fragment>
            )}

            {graded && (
              <React.Fragment>
                <div className="verdict" data-v={result.verdict}>
                  <span className="mark">
                    {result.verdict==='correct'?'✓':result.verdict==='partial'?'△':'✕'}
                  </span>
                  <div>
                    <b>
                      {result.verdict==='correct' && '정답 · ' + cur.answer}
                      {result.verdict==='partial' && '부분 정답 · 정답은 ' + cur.answer}
                      {result.verdict==='wrong' && '오답 · 정답은 ' + cur.answer}
                    </b>
                    <p className="score-line">
                      <span data-ok={result.findingOk?'1':'0'}>소견 {result.findingOk?'맞음':'틀림'}</span>
                      <span data-ok={result.dxOk?'1':'0'}>진단 {result.dxOk?'맞음':'틀림'}</span>
                    </p>
                    <p>사전에 확정된 케이스 정답과 대조한 결과입니다. 시스템은 영상을 판독하지 않습니다.</p>
                  </div>
                </div>

                <div className="sect-label">판독 소견</div>
                <div className="opts">
                  {cur.findings.map((f,i)=>(
                    <button key={f.id} className="opt" disabled
                            data-res={resOf(cur.findings, finding, f.id)}>
                      <span className="key">{i+1}</span>{f.text}
                    </button>
                  ))}
                </div>

                <div className="sect-label">추정 진단</div>
                <div className="opts">
                  {cur.diagnoses.map((d,i)=>(
                    <button key={d.id} className="opt" disabled
                            data-res={resOf(cur.diagnoses, dx, d.id)}>
                      <span className="key">{String.fromCharCode(65+i)}</span>{d.text}
                    </button>
                  ))}
                </div>

                <div className="sect-label">문진</div>
                {result.missedKeyQuestions.length > 0 ? (
                  <div className="history" data-missed="1">
                    <h4>근거에 쓰인 문진 중 묻지 않은 질문</h4>
                    <ul>{result.missedKeyQuestions.map(q=><li key={q}>{q}</li>)}</ul>
                  </div>
                ) : (
                  <div className="history">
                    <h4>근거에 쓰인 문진을 모두 확인했습니다</h4>
                  </div>
                )}

                <div className="sect-label">근거</div>
                {!cur.medicalReviewed && (
                  <div className="review-note">
                    확인 필요 · 이 케이스의 소견·진단 기준·근거 문장은 아직 원문과 대조하지 않았습니다.
                  </div>
                )}
                <div className="fb">
                  {cur.feedback.map((p,i)=>(
                    <p key={i}>{rich(p.t)}<span className="cite">{p.cite.text}</span>
                      {!p.cite.verified && <span className="unverified">확인 필요</span>}
                    </p>
                  ))}
                  <div className="missed">
                    <h4>{cur.missed.h}</h4>
                    <p>{cur.missed.t}</p>
                  </div>
                </div>
              </React.Fragment>
            )}
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span className="st"><i className="dot"/>승인된 케이스만 노출</span>
        {HIDDEN_CASES.length > 0 && (
          <span className="st" title={HIDDEN_CASES.map(h=>h.id).join(', ')}>
            <b>{HIDDEN_CASES.length}</b>건 미승인·숨김
          </span>
        )}
        <span className="st"><i className="dot"/>판단은 <b>학습자</b>가 합니다</span>
        <span className="st warn"><i className="dot"/>데모 · 가상 환자 · 실제 의료영상 아님</span>
        <span className="spacer"/>
        <span className="st" style={{color:'var(--text-faint)'}}>풀이 기록 저장 안 함</span>
      </footer>
    </div>
  );
}

export default function Root(){
  const [data, setData] = useState(null);   // { cases, hidden }
  const [error, setError] = useState(null);

  useEffect(()=>{
    let alive = true;
    fetch('/api/cases')
      .then(r=>{ if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d=>{ if(alive) setData(d); })
      .catch(e=>{ if(alive) setError(e.message); });
    return ()=>{ alive = false; };
  },[]);

  if(error) return <div className="empty">케이스를 불러오지 못했습니다 ({error}).</div>;
  if(!data) return <div className="empty">케이스 불러오는 중…</div>;
  if(data.cases.length === 0){
    return <div className="empty">노출 가능한 승인 케이스가 없습니다.</div>;
  }
  return <App cases={data.cases} hidden={data.hidden}/>;
}

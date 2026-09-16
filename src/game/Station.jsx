import React, { useEffect, useRef, useState } from 'react';
import Patient from './Patient.jsx';
import SCENARIOS from '../lib/scenarios.js';
import './station.css';

const STEPS = [
  { id: 'history', label: '문진' },
  { id: 'exam', label: '진찰' },
  { id: 'orders', label: '검사' },
];

export default function Station({ onExit }) {
  const [sc] = useState(SCENARIOS[0]);
  const [step, setStep] = useState('history');
  const [log, setLog] = useState([]);            // {who, text}
  const [asked, setAsked] = useState([]);        // history id
  const [doneExam, setDoneExam] = useState([]);  // exam id
  const [orders, setOrders] = useState([]);      // order id
  const [flagged, setFlagged] = useState([]);    // 학습자가 체크한 위험 신호
  const [say, setSay] = useState(sc.patient.chiefComplaint + '… 가슴이 너무 아픕니다.');
  const logEnd = useRef(null);

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [log]);

  const ask = (h) => {
    if (asked.includes(h.id)) return;
    setAsked((a) => [...a, h.id]);
    setSay(h.a);
    setLog((l) => [...l, { who: 'me', text: h.q }, { who: 'pt', text: h.a }]);
  };

  // 몸을 클릭하면 그 부위의 진찰 항목을 수행한다
  const examine = (part) => {
    if (step !== 'exam') setStep('exam');
    const item = sc.exam.find((e) => e.part === part && !doneExam.includes(e.id));
    if (!item) {
      setLog((l) => [...l, { who: 'sys', text: '이 부위에서 더 확인할 것이 없다.' }]);
      return;
    }
    setDoneExam((d) => [...d, item.id]);
    setLog((l) => [...l, { who: 'exam', text: item.label }, { who: 'find', text: item.finding }]);
  };

  const order = (o) => {
    if (orders.includes(o.id)) return;
    setOrders((s) => [...s, o.id]);
    setLog((l) => [...l, { who: 'order', text: o.label }, { who: 'find', text: o.result }]);
  };

  // 지금까지 한 행동으로 발견할 수 있는 위험 신호만 시트에 올린다
  const seen = new Set([
    ...sc.vitals.map((v) => v[3]),
    ...sc.history.filter((h) => asked.includes(h.id)).map((h) => h.flag),
    ...sc.exam.filter((e) => doneExam.includes(e.id)).map((e) => e.flag),
    ...sc.orders.filter((o) => orders.includes(o.id)).map((o) => o.flag),
  ].filter(Boolean));
  const sheet = sc.redFlags.filter((f) => seen.has(f.id));
  const examDoneParts = sc.exam.filter((e) => doneExam.includes(e.id)).map((e) => e.part);

  const toggleFlag = (id) =>
    setFlagged((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const radiation = sc.orders
    .filter((o) => orders.includes(o.id))
    .reduce((t, o) => t + o.radiation, 0);

  return (
    <div className="station">
      <div className="room">
        <div className="wall">
          <div className="poster">손을 씻읍시다</div>
          <div className="clock"><span /></div>
        </div>

        <div className="stage">
          <div className="bubble">{say}</div>
          <Patient distress={0.8} onPick={examine} done={examDoneParts} />
        </div>

        <div className="counter">
          <div className="counter-top" />
        </div>
      </div>

      <div className="hud-layer">
      <div className="hud hud-top">
        <span className="tag-mono">DAY 1 · {sc.id}</span>
        <span className="hud-title">
          {sc.patient.age}세 {sc.patient.sex === 'M' ? '남성' : '여성'} · {sc.patient.chiefComplaint}
        </span>
        {!sc.reviewed && <span className="badge-warn">확인 필요 · 미검수 시나리오</span>}
        <span className="hud-spacer" />
        <span className="tag-mono">피폭 {radiation.toFixed(1)} mSv</span>
        <button className="ghost" onClick={onExit}>나가기</button>
      </div>

      <div className="hud-body">
      <div className="hud hud-left-col">
      <div className="hud hud-vitals">
        {sc.vitals.map(([k, v, warn]) => (
          <div key={k} className={'vital' + (warn ? ' warn' : '')}>
            <span>{k}</span><b>{v}</b>
          </div>
        ))}
      </div>

      <div className="hud hud-left">
        <div className="tabs">
          {STEPS.map((s) => (
            <button key={s.id} className={step === s.id ? 'on' : ''} onClick={() => setStep(s.id)}>{s.label}</button>
          ))}
        </div>

        {step === 'history' && (
          <div className="chips">
            {sc.history.map((h) => (
              <button key={h.id} disabled={asked.includes(h.id)} onClick={() => ask(h)}>{h.q}</button>
            ))}
          </div>
        )}

        {step === 'exam' && (
          <p className="hint">환자의 몸에서 진찰할 부위를 클릭하세요. 머리 · 목 · 가슴 · 배 · 팔 · 다리</p>
        )}

        {step === 'orders' && (
          <div className="chips">
            {sc.orders.map((o) => (
              <button key={o.id} disabled={orders.includes(o.id)} onClick={() => order(o)}>
                {o.label}{o.radiation > 0 && <i className="rad"> {o.radiation} mSv</i>}
              </button>
            ))}
          </div>
        )}

        <div className="log">
          {log.length === 0 && <p className="m sys">아직 한 것이 없다.</p>}
          {log.map((m, i) => <p key={i} className={'m ' + m.who}>{m.text}</p>)}
          <div ref={logEnd} />
        </div>
      </div>

      </div>
      <div className="hud hud-right">
        <h3>증상 시트</h3>
        {sheet.length === 0 && <p className="dim">아직 기록할 것이 없다. 문진·진찰·검사를 해 보자.</p>}
        {sheet.map((f) => (
          <button key={f.id} className={'flag' + (flagged.includes(f.id) ? ' on' : '')}
                  onClick={() => toggleFlag(f.id)}>
            <span className="box">{flagged.includes(f.id) ? '✓' : ''}</span>{f.text}
          </button>
        ))}
      </div>

      </div>
      <div className="hud hud-bottom">
        <span className="tool-hint">처분을 고르면 채점됩니다</span>
        <div className="dispo">
          {sc.disposition.options.map((d) => (
            <button key={d.id} className={d.id === 'd-emergency' ? 'danger' : ''}>{d.text}</button>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

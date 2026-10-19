import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './App.jsx';
import Station from './game/Station.jsx';
import ClinicalCheckpoint from './cc/ClinicalCheckpoint.jsx';
import './styles.css';

/* 세 모드를 한 앱에서 오간다.
   - 판독 콘솔: 영상 판독 연습 (기존)
   - 진료 시뮬레이터: 진료 절차 훈련 (개발 중)
   - Clinical Checkpoint: 논문의 가상환자 문진 → 진찰·관찰 → 근거보고서 → 디브리핑 (#cc) */
function Shell() {
  const fromHash = () => (location.hash === '#sim' ? 'sim' : location.hash === '#cc' ? 'cc' : 'console');
  const [mode, setMode] = useState(fromHash);
  const go = (m) => { location.hash = m === 'console' ? '' : '#' + m; setMode(m); };
  // 주소창의 #만 바꿔도 화면이 따라가게 한다 (시연 때 #cc로 바로 열기)
  useEffect(() => {
    const on = () => setMode(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  if (mode === 'sim') return <Station onExit={() => go('console')} />;
  if (mode === 'cc') return <ClinicalCheckpoint onExit={() => go('console')} />;
  return (
    <>
      <Root />
      <button className="mode-switch" onClick={() => go('sim')}>진료 시뮬레이터 (개발 중)</button>
      <button className="mode-switch" style={{ bottom: 64 }} onClick={() => go('cc')}>Clinical Checkpoint</button>
    </>
  );
}

createRoot(document.getElementById('root')).render(<Shell />);

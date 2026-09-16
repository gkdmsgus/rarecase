import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './App.jsx';
import Station from './game/Station.jsx';
import './styles.css';

/* 두 모드를 한 앱에서 오간다.
   - 판독 콘솔: 영상 판독 연습 (기존)
   - 진료 시뮬레이터: 진료 절차 훈련 (개발 중) */
function Shell() {
  const [mode, setMode] = useState(() => (location.hash === '#sim' ? 'sim' : 'console'));
  const go = (m) => { location.hash = m === 'sim' ? '#sim' : ''; setMode(m); };

  if (mode === 'sim') return <Station onExit={() => go('console')} />;
  return (
    <>
      <Root />
      <button className="mode-switch" onClick={() => go('sim')}>진료 시뮬레이터 (개발 중)</button>
    </>
  );
}

createRoot(document.getElementById('root')).render(<Shell />);

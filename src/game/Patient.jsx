import React from 'react';

/* 2D 환자 그림. 사실적인 인체·병변 묘사는 하지 않는다 (원칙 3).
   부위를 클릭하면 그 부위의 진찰 항목이 수행된다. 소견 문장은 시나리오 데이터에서 온다.
   distress: 0~1. 값이 클수록 창백하고 땀·찡그림이 강해진다. */
export default function Patient({ distress = 0.8, onPick, done = [] }) {
  const skin = distress > 0.5 ? '#d9b9a1' : '#e3c6ae';
  const region = (part, node) => (
    <g className={'region' + (done.includes(part) ? ' done' : '')}
       onClick={() => onPick?.(part)} role="button" tabIndex={0}
       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(part); } }}
       aria-label={part}>
      {node}
    </g>
  );

  return (
    <svg className="patient" viewBox="0 0 220 340" aria-label="환자 도식 그림">
      <ellipse cx="110" cy="332" rx="62" ry="9" fill="rgba(0,0,0,.35)" />

      {/* 다리 */}
      {region('leg', <>
        <rect x="88" y="236" width="18" height="84" rx="8" fill="#3c4756" />
        <rect x="114" y="236" width="18" height="84" rx="8" fill="#3c4756" />
        <rect x="84" y="314" width="26" height="10" rx="5" fill="#2a323d" />
        <rect x="110" y="314" width="26" height="10" rx="5" fill="#2a323d" />
      </>)}

      {/* 팔 */}
      {region('arm', <>
        <rect x="58" y="150" width="17" height="76" rx="8" fill="#5b6b7f" />
        <circle cx="66" cy="232" r="9" fill={skin} />
        <path d="M145 152 q16 26 -2 44" stroke="#5b6b7f" strokeWidth="17" strokeLinecap="round" fill="none" />
        <circle cx="132" cy="200" r="9" fill={skin} />
      </>)}

      {/* 배 */}
      {region('abdomen', <rect x="80" y="206" width="60" height="42" rx="12" fill="#6d7f94" />)}

      {/* 가슴 */}
      {region('chest', <>
        <rect x="74" y="140" width="72" height="76" rx="16" fill="#7b8ea6" />
        <path d="M110 140 v70" stroke="#6b7d93" strokeWidth="3" />
      </>)}

      {/* 목 */}
      {region('neck', <rect x="100" y="120" width="20" height="26" rx="8" fill={skin} />)}

      {/* 머리 */}
      {region('head', <>
        <ellipse cx="110" cy="92" rx="34" ry="38" fill={skin} />
        <path d="M76 84 q6 -34 34 -34 q28 0 34 34 q-10 -14 -34 -14 q-24 0 -34 14 z" fill="#43464d" />
        <path d="M92 84 l14 5" stroke="#3a3d43" strokeWidth="3" strokeLinecap="round" />
        <path d="M128 84 l-14 5" stroke="#3a3d43" strokeWidth="3" strokeLinecap="round" />
        <circle cx="98" cy="96" r="3.4" fill="#2c2f35" />
        <circle cx="122" cy="96" r="3.4" fill="#2c2f35" />
        <path d="M100 114 q10 -6 20 0" stroke="#2c2f35" strokeWidth="3" fill="none" strokeLinecap="round" />
        {distress > 0.5 && <>
          <path className="sweat" d="M142 78 q4 8 0 12 q-4 -4 0 -12z" fill="#7fd4e6" />
          <path className="sweat sweat2" d="M80 72 q4 8 0 12 q-4 -4 0 -12z" fill="#7fd4e6" />
        </>}
      </>)}

      {/* 가슴을 누르는 손 */}
      <g className="hand-on-chest">
        <circle cx="120" cy="176" r="11" fill={skin} />
      </g>
    </svg>
  );
}

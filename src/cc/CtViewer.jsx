import React, { useEffect, useRef } from 'react';

/* 비조영 두부 CT "도식" 그림.
   실제 의료영상이 아니다. 사실적으로 보이지 않도록 단순한 도형으로 그린다 (원칙 3).
   기저조(가운데 별 모양 공간)를 밝게 칠해 학습용 관찰 대상을 표시한다.
   핀 좌표는 0~1 비율로 다룬다. 핀이 맞았는지는 서버가 미리 정한 영역과 거리로만 비교한다 (원칙 2). */

const W = 520;
const H = 520;

function draw(cv) {
  cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.fillStyle = '#05070b'; g.fillRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2 + 6;
  // 두피·두개골
  g.beginPath(); g.ellipse(cx, cy, 196, 232, 0, 0, Math.PI * 2); g.fillStyle = '#2a2f36'; g.fill();
  g.beginPath(); g.ellipse(cx, cy, 186, 222, 0, 0, Math.PI * 2); g.lineWidth = 14; g.strokeStyle = '#e8edf2'; g.stroke();
  // 뇌 실질 (평평한 회색)
  g.beginPath(); g.ellipse(cx, cy, 174, 210, 0, 0, Math.PI * 2); g.fillStyle = '#7b828b'; g.fill();
  // 앞쪽 안와·부비동 (단순 원)
  g.fillStyle = '#05070b';
  [[-62, -196], [62, -196]].forEach(([dx, dy]) => { g.beginPath(); g.ellipse(cx + dx, cy + dy, 34, 26, 0, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = '#e8edf2';
  [[-62, -196], [62, -196]].forEach(([dx, dy]) => { g.beginPath(); g.ellipse(cx + dx, cy + dy, 34, 26, 0, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#d6dde5'; g.stroke(); });
  // 고랑(선으로만)
  g.strokeStyle = 'rgba(40,46,54,.35)'; g.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.32;
    [1, -1].forEach((s) => {
      const r1 = 150, r2 = 118;
      g.beginPath();
      g.moveTo(cx + s * Math.cos(a) * r1 * 0.95, cy + Math.sin(a) * r1 * 1.15);
      g.quadraticCurveTo(cx + s * Math.cos(a + 0.12) * 136, cy + Math.sin(a + 0.12) * 160, cx + s * Math.cos(a) * r2 * 0.95, cy + Math.sin(a) * r2 * 1.15);
      g.stroke();
    });
  }
  // 정중선
  g.beginPath(); g.moveTo(cx, cy - 200); g.lineTo(cx, cy - 70); g.moveTo(cx, cy + 70); g.lineTo(cx, cy + 205);
  g.strokeStyle = 'rgba(30,34,40,.7)'; g.lineWidth = 2.5; g.stroke();
  // 뇌실 (어두운 초승달)
  g.fillStyle = '#20252c';
  [-1, 1].forEach((s) => {
    g.beginPath();
    g.moveTo(cx + s * 8, cy - 64);
    g.quadraticCurveTo(cx + s * 44, cy - 70, cx + s * 40, cy - 22);
    g.quadraticCurveTo(cx + s * 26, cy - 34, cx + s * 10, cy - 30);
    g.closePath(); g.fill();
  });
  // 기저조: 가운데 둥근 오각형 공간 — 학습용으로 밝게 칠한 영역 (도식)
  const cistern = (rOut, rIn, color) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? rIn : rOut;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([cx + Math.cos(a) * r, cy + 16 + Math.sin(a) * r]);
    }
    g.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let m = mid(pts[9], pts[0]); g.moveTo(m[0], m[1]);
    for (let i = 0; i < 10; i++) { const n = mid(pts[i], pts[(i + 1) % 10]); g.quadraticCurveTo(pts[i][0], pts[i][1], n[0], n[1]); }
    g.closePath(); g.fillStyle = color; g.fill();
  };
  cistern(54, 26, '#c9cfd6');
  cistern(36, 17, '#e3e7eb');
  // 뒤통수 쪽 소뇌 경계 (단순 곡선)
  g.beginPath(); g.ellipse(cx, cy + 128, 96, 58, 0, Math.PI * 1.05, Math.PI * 1.95); g.strokeStyle = 'rgba(40,46,54,.6)'; g.lineWidth = 2.5; g.stroke();

  // 비스듬한 워터마크
  g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 7);
  g.fillStyle = 'rgba(251,191,36,.22)'; g.font = '600 19px "Malgun Gothic", sans-serif'; g.textAlign = 'center';
  ['합성 · 교육용 · 진단 사용 금지', '합성 · 교육용 · 진단 사용 금지', '합성 · 교육용 · 진단 사용 금지'].forEach((t, i) => g.fillText(t, 0, (i - 1) * 120));
  g.restore();
  // 좌우 표시
  g.fillStyle = '#cbd5e1'; g.font = '600 16px sans-serif'; g.fillText('R', 14, H / 2); g.fillText('L', W - 26, H / 2);
}

/* image가 있으면(라이선스 확인된 공개 CT) 그 사진을 보여 주고, 없으면 도식을 그린다 */
export default function CtViewer({ image, pins, pinning, onTogglePin, onAddPin }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && !image) draw(ref.current); }, [image]);

  const click = (e) => {
    if (!pinning) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onAddPin({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };

  return (
    <div className={'cc-ct' + (pinning ? ' pinning' : '')}>
      <div className="stage">
        {image
          ? <img src={image.url} onClick={click} alt="공개 비조영 두부 CT 영상 (교육용, 진단 사용 금지)" draggable={false} />
          : <canvas ref={ref} onClick={click} aria-label="도식으로 그린 비조영 두부 CT. 실제 의료영상이 아님" />}
        {pins.map((p, i) => (
          <span key={i} className="cc-pin" style={{ left: p.x * 100 + '%', top: p.y * 100 + '%' }}>{i + 1}</span>
        ))}
      </div>
      <span className="cc-wm">{image ? '공개 이미지 · 교육용 · 진단 사용 금지' : 'SYNTHETIC'}</span>
      <button type="button" className={'cc-pinbtn' + (pinning ? ' on' : '')} onClick={onTogglePin}>
        {pinning ? '핀 표시 중 · 끄기' : '관찰 핀 표시'}
      </button>
    </div>
  );
}

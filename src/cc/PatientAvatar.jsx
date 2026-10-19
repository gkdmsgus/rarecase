import React from 'react';

/* 가상환자 일러스트. 실제 사람 사진을 쓰지 않는다 (원칙 9).
   pain: 0~1. 클수록 미간을 찌푸린다. */
export default function PatientAvatar({ pain = 0.6 }) {
  const brow = 4 + pain * 4;
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="가상환자 일러스트 (52세 여성)">
      <defs>
        <pattern id="gown" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill="#dbe6f3" />
          <circle cx="4" cy="4" r="1.6" fill="#a9bfdc" />
          <circle cx="11" cy="11" r="1.6" fill="#a9bfdc" />
        </pattern>
      </defs>
      {/* 어깨·병원복 */}
      <path d="M22 200 C26 160 58 146 100 146 C142 146 174 160 178 200 Z" fill="url(#gown)" />
      <path d="M78 148 L100 172 L122 148" fill="none" stroke="#b7c9e2" strokeWidth="4" />
      {/* 목 */}
      <path d="M86 124 h28 v26 c-8 6 -20 6 -28 0 z" fill="#e8c2a6" />
      {/* 뒷머리 */}
      <path d="M52 92 C48 46 78 26 104 28 C134 30 156 52 150 96 C148 118 140 130 132 136 L70 136 C60 128 54 114 52 92 Z" fill="#2f2a2b" />
      {/* 귀 */}
      <ellipse cx="62" cy="96" rx="5" ry="9" fill="#e8c2a6" />
      <ellipse cx="138" cy="96" rx="5" ry="9" fill="#e8c2a6" />
      {/* 얼굴 */}
      <ellipse cx="100" cy="92" rx="38" ry="44" fill="#f0cdb2" />
      {/* 앞머리 (희끗한 결) */}
      <path d="M60 86 C62 52 86 42 104 42 C126 42 142 58 142 84 C130 66 112 60 96 62 C82 64 70 72 60 86 Z" fill="#3a3335" />
      <path d="M98 46 C110 52 120 60 126 70" stroke="#8a8486" strokeWidth="1.6" fill="none" opacity=".7" />
      <path d="M84 50 C92 56 98 62 102 70" stroke="#8a8486" strokeWidth="1.2" fill="none" opacity=".5" />
      {/* 눈썹 */}
      <path d={`M76 ${82 - brow / 2} L92 ${80 + brow / 3}`} stroke="#3a3335" strokeWidth="3" strokeLinecap="round" />
      <path d={`M124 ${82 - brow / 2} L108 ${80 + brow / 3}`} stroke="#3a3335" strokeWidth="3" strokeLinecap="round" />
      {/* 눈 */}
      <path d="M78 94 q7 -5 14 0" stroke="#2b2526" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M108 94 q7 -5 14 0" stroke="#2b2526" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 코·입 */}
      <path d="M100 98 q-4 12 1 14" stroke="#c99a7e" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M88 122 q12 -5 24 0" stroke="#9c5b52" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* 볼 */}
      <ellipse cx="76" cy="108" rx="7" ry="4" fill="#e9a99a" opacity=".45" />
      <ellipse cx="124" cy="108" rx="7" ry="4" fill="#e9a99a" opacity=".45" />
    </svg>
  );
}

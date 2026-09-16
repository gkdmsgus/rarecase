/* ═══════════════════════════════════════════════════════════
   진료 절차 훈련 시나리오 데이터.
   형식·검사는 sim-schema.js, 설계는 docs/sim-design.md.

   ⚠ 의학 검수 전이다 (reviewed:false). 화면에 "확인 필요"를 달고 노출한다 (원칙 6).
   정답은 "절차"(필수 문진·진찰·검사 적절성·처분)에 한정한다 (원칙 4 B형).
   exam[].part 는 3D 화면에서 클릭할 신체 부위와 연결된다.
   ═══════════════════════════════════════════════════════════ */

const SC001 = {
  id: 'SC-001',
  source: 'authored-scenario',
  reviewed: false,
  patient: { age: 58, sex: 'M', chiefComplaint: '40분 전 시작된 흉통' },
  vitals: [
    ['BP', '92/58', true, 'rf-hypotension'],
    ['HR', '112 /min', true, 'rf-tachycardia'],
    ['RR', '24 /min', false],
    ['SpO₂', '94 %', false],
    ['BT', '36.8 ℃', false],
  ],
  history: [
    { id: 'h-onset', q: '언제부터 어떻게 아프셨나요?', required: true,
      a: '40분쯤 됐습니다. 가슴 한가운데를 누르는 것처럼 아파요. 가만히 있어도 그대로입니다.' },
    { id: 'h-radiation', q: '통증이 다른 곳으로 퍼지나요?', required: true, flag: 'rf-radiation',
      a: '왼쪽 어깨하고 턱 쪽으로 당기는 느낌이 있어요.' },
    { id: 'h-assoc', q: '같이 나타나는 증상이 있나요?', required: true, flag: 'rf-diaphoresis',
      a: '식은땀이 계속 나고 메스껍습니다.' },
    { id: 'h-risk', q: '고혈압·당뇨·흡연 같은 위험 요인이 있나요?', required: true,
      a: '고혈압으로 약을 먹고 있고, 담배는 하루 한 갑씩 30년 피웠습니다.' },
    { id: 'h-meds', q: '복용 중인 약이 있나요?', required: true,
      a: '혈압약을 먹습니다. 어제 발기부전 치료제를 한 알 먹었어요.' },
    { id: 'h-prev', q: '전에도 같은 통증이 있었나요?', required: false,
      a: '계단 오를 때 가끔 뻐근했는데 쉬면 좋아졌어요.' },
    { id: 'h-travel', q: '최근 여행이나 장시간 이동이 있었나요?', required: false,
      a: '아니요, 최근엔 없었습니다.' },
    { id: 'h-food', q: '식사와 관련이 있나요?', required: false,
      a: '식사하고는 상관없이 아팠습니다.' },
  ],
  exam: [
    { id: 'e-general', part: 'head', label: '전신 상태·의식 확인', required: true,
      finding: '식은땀이 많고 창백하다. 의식은 명료하다.', flag: 'rf-diaphoresis' },
    { id: 'e-neck', part: 'neck', label: '경정맥 확인', required: true,
      finding: '경정맥 확장은 뚜렷하지 않다.' },
    { id: 'e-heart', part: 'chest', label: '심음 청진', required: true,
      finding: '심박이 빠르고 규칙적이다. 심잡음은 들리지 않는다.' },
    { id: 'e-lung', part: 'chest', label: '폐음 청진', required: true,
      finding: '양측 폐음은 대칭이고 수포음은 들리지 않는다.' },
    { id: 'e-bp-both', part: 'arm', label: '양팔 혈압 비교', required: true,
      finding: '양팔 수축기 혈압 차이는 6 mmHg로 크지 않다.' },
    { id: 'e-leg', part: 'leg', label: '하지 부종·비대칭 확인', required: false,
      finding: '양쪽 다리 굵기가 같고 부종은 없다.' },
    { id: 'e-abdomen', part: 'abdomen', label: '복부 촉진', required: false,
      finding: '복부는 부드럽고 압통이 없다.' },
  ],
  orders: [
    { id: 'o-ecg', label: '12유도 심전도', appropriate: 'required', radiation: 0, minutes: 5,
      result: 'II·III·aVF 유도에서 ST 분절 상승이 보인다.', flag: 'rf-st-elevation' },
    { id: 'o-trop', label: '심장효소(트로포닌)', appropriate: 'required', radiation: 0, minutes: 40,
      result: '트로포닌 I가 기준치보다 높다.' },
    { id: 'o-cxr', label: '흉부 X-ray (이동식)', appropriate: 'reasonable', radiation: 0.1, minutes: 15,
      result: '심비대나 종격동 확장은 뚜렷하지 않다.' },
    { id: 'o-ddimer', label: 'D-dimer', appropriate: 'low-yield', radiation: 0, minutes: 40,
      result: '경도 상승. 이 상황에서는 해석이 어렵다.' },
    { id: 'o-ctpa', label: '흉부 CT 조영', appropriate: 'low-yield', radiation: 7, minutes: 45,
      result: '폐동맥에 색전은 보이지 않는다.' },
    { id: 'o-brainct', label: '뇌 CT', appropriate: 'low-yield', radiation: 2, minutes: 30,
      result: '특이 소견 없다.' },
  ],
  redFlags: [
    { id: 'rf-hypotension', where: 'vitals', text: '수축기 혈압 92 mmHg' },
    { id: 'rf-tachycardia', where: 'vitals', text: '맥박 112회' },
    { id: 'rf-radiation', where: 'history', text: '어깨·턱으로 퍼지는 통증' },
    { id: 'rf-diaphoresis', where: 'history', text: '식은땀 동반' },
    { id: 'rf-st-elevation', where: 'order', text: '심전도 ST 분절 상승' },
  ],
  disposition: {
    correct: 'd-emergency',
    why: '위험 신호가 여러 개이고 심전도에서 ST 분절 상승이 확인되므로 귀가시키지 않고 즉시 응급 처치와 전문 진료로 넘긴다.',
    options: [
      { id: 'd-home', text: '귀가 후 경과 관찰' },
      { id: 'd-clinic', text: '외래 추적' },
      { id: 'd-admit', text: '일반 병실 입원' },
      { id: 'd-emergency', text: '즉시 응급 처치 · 전문 진료 의뢰' },
    ],
  },
  diagnosis: {
    correct: 'dx-acs',
    why: '흉통 양상·위험 요인·심전도·심장효소가 급성 관상동맥증후군을 시사한다.',
    options: [
      { id: 'dx-acs', text: '급성 관상동맥증후군 의심' },
      { id: 'dx-dissection', text: '대동맥 박리' },
      { id: 'dx-pe', text: '폐색전증' },
      { id: 'dx-gerd', text: '위식도역류질환' },
    ],
  },
  citations: [
    { text: '흉통 초기 평가: 발병 양상·위험 요인·심전도 우선', verified: false },
    { text: '질산염 투여 전 발기부전 치료제 복용 여부 확인', verified: false },
  ],
};

const SCENARIOS = [SC001];
export default SCENARIOS;

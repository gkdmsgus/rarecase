/* ═══════════════════════════════════════════════════════════
   케이스 데이터 — 나중에 /cases 응답으로 대체된다.
   형식 검사는 case-schema.js.

   케이스 우선(case-first) 원칙:
   정답 소견을 먼저 정의하고 그 소견으로 영상을 생성한다.
   correct:true 필드가 ground truth이고, 영상은 그것을 그리도록
   지시받는다. 반대 순서는 금지 — 무엇이 그려졌는지 아무도
   모르는 상태가 되기 때문.

   필드 메모
   - approval.status : draft | pending | approved. approved만 학습자에게 노출
   - approval.by     : 승인 주체. 지금 두 케이스는 데모 가정일 뿐 실제 검수 없음
   - medicalReviewed : 소견·진단 기준·근거 문장을 원문과 대조했는지
   - feedback[].cite.verified : 인용 출처를 원문에서 확인했는지
   - questions[].key : 근거 문장에 쓰인 핵심 문진. 안 물어보면 채점 후 알려 줌
   ═══════════════════════════════════════════════════════════ */

const DEMO_APPROVER = '데모 가정 (실제 전문가 검수 없음)';

const CASES = [
  {
    id: 'RC-014', who: '22세 남성', cc: '6개월 반복 객혈',
    rarity: 'rare', film: 'pavm',
    approval: { status: 'approved', by: DEMO_APPROVER, date: '2026-09-02' },
    medicalReviewed: false,
    intro: '6개월째 가래에 피가 섞여 나온다며 내원했습니다.',
    vitals: [['SpO₂', '91 %', true], ['BP', '118/74', false], ['HR', '78 /min', false], ['BT', '36.6 ℃', false]],
    questions: [
      { q: '객혈은 언제부터 있었나요?',
        a: '여섯 달쯤 됐어요. 가래에 피가 섞여 나오는데, 요즘은 좀 더 자주 그럽니다.' },
      { q: '코피가 자주 나는 편인가요?', key: true,
        a: '네, 어릴 때부터요. 한 달에 두세 번은 그냥 앉아 있다가도 납니다.' },
      { q: '가족 중에 비슷한 증상이 있나요?', key: true,
        a: '아버지랑 고모도 코피가 잦으셨어요. 고모는 폐에 뭐가 있다고 들었던 것 같은데….' },
      { q: '흡연력이 있으신가요?',
        a: '담배는 한 번도 안 피웠습니다.' },
    ],
    orders: [
      { key: 'cxr', label: '흉부 X-ray (PA)', ready: true },
      { key: 'ct',  label: '흉부 CT',         ready: false },
      { key: 'mri', label: '뇌 MRI',          ready: false },
    ],
    study: { name: '흉부 X-ray PA', acc: 'DEMO-2026-0917' },
    findings: [
      { id: 'f1', text: '우하폐야에 경계가 뚜렷한 결절, 굵은 혈관 음영이 이어짐', correct: true },
      { id: 'f2', text: '양측 폐야 미만성 간질성 음영', correct: false },
      { id: 'f3', text: '좌측 늑골횡격막각 둔화', correct: false },
      { id: 'f4', text: '우측 폐첨부 공동성 병변', correct: false },
    ],
    diagnoses: [
      { id: 'd1', text: '폐동정맥기형 (PAVM)', correct: true },
      { id: 'd2', text: '폐결핵',             correct: false },
      { id: 'd3', text: '폐선암',             correct: false },
      { id: 'd4', text: '기관지확장증',        correct: false },
    ],
    answer: '폐동정맥기형 (PAVM)',
    feedback: [
      { t: '**결절과 이어지는 굵은 혈관 음영**이 핵심 소견입니다. 공급동맥과 유출정맥이 함께 보이면 단순 결절이 아니라 혈관 병변을 먼저 의심합니다.',
        cite: { text: '흉부영상의학 §7.4', verified: false } },
      { t: '문진에서 **반복 비출혈**과 **가족력**이 확인됐습니다. 유전출혈모세혈관확장증(HHT) 진단 기준에 해당하며, PAVM은 HHT에 흔히 동반됩니다.',
        cite: { text: 'Curaçao 기준', verified: false } },
    ],
    missed: {
      h: '놓치기 쉬운 지점',
      t: 'SpO₂ 91%는 우좌단락을 시사합니다. PAVM은 폐 모세혈관을 우회시켜 역설색전과 뇌농양 위험을 높이므로, 확진 전이라도 뇌 영상 검사를 함께 고려합니다.',
    },
  },
  {
    id: 'RC-021', who: '58세 여성', cc: '발열 · 화농성 객담',
    rarity: 'common', film: null,
    approval: { status: 'draft' },
    medicalReviewed: false,
  },
  {
    id: 'RC-033', who: '34세 남성', cc: '갑작스런 흉통 · 호흡곤란',
    rarity: 'common', film: 'ptx',
    approval: { status: 'approved', by: DEMO_APPROVER, date: '2026-09-03' },
    medicalReviewed: false,
    intro: '두 시간 전 갑자기 시작된 오른쪽 흉통으로 내원했습니다.',
    vitals: [['SpO₂', '94 %', false], ['BP', '126/78', false], ['HR', '104 /min', true], ['RR', '24 /min', true]],
    questions: [
      { q: '언제부터 아프기 시작했나요?',
        a: '두 시간쯤 전에요. 가만히 앉아 있다가 갑자기 오른쪽 가슴이 찌르듯 아팠어요.' },
      { q: '숨 쉴 때 더 아픈가요?',
        a: '네, 크게 들이쉬면 확 아파요. 숨도 좀 차고요.' },
      { q: '키와 체중이 어떻게 되나요?', key: true,
        a: '187cm에 62kg입니다. 원래 마른 편이에요.' },
      { q: '흡연력이 있으신가요?', key: true,
        a: '하루 반 갑 정도 피웁니다.' },
    ],
    orders: [
      { key: 'cxr', label: '흉부 X-ray (PA)', ready: true },
      { key: 'ct',  label: '흉부 CT',         ready: false },
      { key: 'ecg', label: '심전도',           ready: false },
    ],
    study: { name: '흉부 X-ray PA', acc: 'DEMO-2026-0918' },
    findings: [
      { id: 'f1', text: '우측 폐첨부에 흉막선, 그 바깥으로 폐혈관 음영 소실', correct: true },
      { id: 'f2', text: '우하폐야 경계가 뚜렷한 결절', correct: false },
      { id: 'f3', text: '양측 폐문 림프절 종대', correct: false },
      { id: 'f4', text: '좌측 대량 흉수', correct: false },
    ],
    diagnoses: [
      { id: 'd1', text: '원발성 자연기흉', correct: true },
      { id: 'd2', text: '폐색전증',       correct: false },
      { id: 'd3', text: '심근경색',       correct: false },
      { id: 'd4', text: '늑막염',         correct: false },
    ],
    answer: '원발성 자연기흉',
    feedback: [
      { t: '**흉막선(pleural line)과 그 바깥의 폐혈관 음영 소실**이 진단적입니다. 흉막선 안쪽으로만 혈관 음영이 보이는지 반드시 확인하세요.',
        cite: { text: '흉부영상의학 §4.2', verified: false } },
      { t: '**키 크고 마른 젊은 남성 흡연자**는 원발성 자연기흉의 전형적 위험군입니다. 187cm·62kg, 흡연력이 모두 일치합니다.',
        cite: { text: 'BTS 흉막질환 지침', verified: false } },
    ],
    missed: {
      h: '먼저 배제할 것',
      t: '긴장성 기흉은 응급입니다. 기관 편위, 저혈압, 경정맥 확장이 있으면 영상 확인을 기다리지 않고 즉시 감압합니다. 이 환자는 혈압이 유지되고 기관 편위가 없어 해당하지 않습니다.',
    },
  },
  {
    id: 'RC-047', who: '27세 여성', cc: '건강검진',
    rarity: 'normal', film: null,
    approval: { status: 'draft' },
    medicalReviewed: false,
  },
];

export default CASES;

/* ═══════════════════════════════════════════════════════════
   Clinical Checkpoint 증례 CC-001 — 급성 비외상성 두통 (논문 초기 시나리오)

   ⚠ 작성 시나리오다 (source:'authored-scenario', reviewed:false).
     의학 검수 전이므로 화면에 "확인 필요 · 미검수"를 단다 (원칙 4·6).
     실제 환자가 아니다. 이름은 가명이다.

   이 파일은 서버에서만 읽는다. 학습자 브라우저에는 publicCase()가 만든
   부분만 간다. 답변·소견·검토 기준은 해당 행동을 했을 때만 나간다.

   facts: 환자가 말할 수 있는 사실의 전부. 문진 엔진은 이 목록 밖의 말을 만들지 않는다.
     keys  : 규칙 기반 엔진이 질문과 맞춰 볼 낱말
     clue  : 디브리핑에서 "확인한 단서"로 셀 항목이면 그 단서 id
   ═══════════════════════════════════════════════════════════ */

const CASE = {
  id: 'CC-001',
  source: 'authored-scenario',
  reviewed: false,
  title: '갑작스러운 중증 두통',
  patient: {
    alias: '김민서',
    age: 52,
    sex: 'F',
    chief: '갑작스러운 중증 두통',
    onset: '오늘 08:00',
    status: '의식 명료',
  },
  vitals: [
    { k: 'BP', v: '168/96 mmHg', warn: true },
    { k: 'HR', v: '92 /min', warn: false },
    { k: 'RR', v: '18 /min', warn: false },
    { k: 'SpO₂', v: '98 %', warn: false },
    { k: 'BT', v: '36.9 ℃', warn: false },
  ],
  opening: '오늘 아침부터 머리가 너무 아파요. 이렇게 갑자기 아픈 건 처음이에요.',
  unknownAnswer: '그건 잘 모르겠어요. 다른 걸 물어봐 주시겠어요?',

  facts: [
    { id: 'f-onset', clue: 'c-sudden',
      keys: ['언제', '시작', '갑자기', '어떻게', '처음', '몇 시', '발병', '순간'],
      answer: '아침 8시쯤 빨래를 널다가 갑자기 머리가 터질 것처럼 아팠어요. 몇 초 만에 제일 심해졌어요.' },
    { id: 'f-severity', clue: 'c-worst',
      keys: ['얼마나', '정도', '심해', '심한', '점수', '가장', '제일', '최악', '세기'],
      answer: '살면서 이렇게 아픈 건 처음이에요. 10점 만점이면 10점이에요.' },
    { id: 'f-location',
      keys: ['어디', '위치', '부위', '어느 쪽', '뒷머리', '앞머리', '관자'],
      answer: '뒷머리 쪽이 제일 아프고, 목 뒤까지 당겨요.' },
    { id: 'f-vomit', clue: 'c-vomit',
      keys: ['토', '구토', '메스', '울렁', '속이', '오심'],
      answer: '아까 한 번 토했어요. 지금도 속이 계속 메스꺼워요.' },
    { id: 'f-neck', clue: 'c-neck',
      keys: ['목', '뻣뻣', '굳', '경직', '고개'],
      answer: '목 뒤가 뻣뻣해서 고개를 숙이기가 힘들어요.' },
    { id: 'f-trauma', clue: 'c-no-trauma',
      keys: ['다치', '부딪', '넘어', '외상', '맞', '사고'],
      answer: '아니요, 어디 부딪히거나 넘어진 적은 없어요.' },
    { id: 'f-conscious',
      keys: ['기절', '의식', '정신', '쓰러', '잃', '깜빡'],
      answer: '잠깐 핑 돌았는데 정신을 잃지는 않았어요.' },
    { id: 'f-neuro', clue: 'c-no-focal',
      keys: ['힘', '마비', '저리', '저림', '말이', '발음', '시야', '눈', '보이', '감각'],
      answer: '눈은 잘 보이고, 팔다리에 힘이 빠지거나 저린 건 없어요.' },
    { id: 'f-history', clue: 'c-htn',
      keys: ['고혈압', '혈압', '지병', '질환', '과거', '앓', '병원', '당뇨'],
      answer: '고혈압이 있다고 들었는데 약은 잘 안 먹었어요.' },
    { id: 'f-meds',
      keys: ['약', '복용', '진통제', '먹은', '항응고', '아스피린'],
      answer: '집에서 진통제를 한 알 먹었는데 소용없었어요. 피 묽게 하는 약은 안 먹어요.' },
    { id: 'f-family',
      keys: ['가족', '부모', '어머니', '아버지', '형제', '유전'],
      answer: '어머니가 예전에 뇌출혈로 쓰러지신 적이 있어요.' },
    { id: 'f-prior',
      keys: ['평소', '원래', '전에도', '예전', '편두통', '자주'],
      answer: '평소에는 두통이 거의 없었어요.' },
    { id: 'f-fever',
      keys: ['열', '오한', '감기', '춥', '체온'],
      answer: '열이 나는 것 같지는 않아요.' },
    { id: 'f-social',
      keys: ['담배', '흡연', '술', '음주'],
      answer: '담배는 안 피우고, 술은 가끔 한두 잔 마셔요.' },
  ],

  exams: [
    { id: 'e-conscious', label: '의식 수준 평가', required: true,
      finding: '의식은 명료하다. 질문에 정확히 답한다.' },
    { id: 'e-neck', label: '경부 강직 확인', required: true, clue: 'c-neck-exam',
      finding: '고개를 앞으로 숙이게 하면 저항과 통증이 있다.' },
    { id: 'e-pupil', label: '동공 반사', required: true,
      finding: '양쪽 동공 크기가 같고 빛 반사가 정상이다.' },
    { id: 'e-motor', label: '사지 근력·감각', required: true, clue: 'c-no-focal',
      finding: '사지 근력과 감각에 좌우 차이가 없다.' },
    { id: 'e-head', label: '두피·머리 외상 확인', required: false,
      finding: '두피에 상처나 부종이 없다.' },
    { id: 'e-abd', label: '복부 촉진', required: false,
      finding: '특이 소견이 없다.' },
  ],

  tests: [
    { id: 't-ct', label: '비조영 두부 CT', fit: 'required', imaging: true,
      result: '영상을 열어 직접 관찰하세요.' },
    { id: 't-lab', label: '혈액검사 (혈구·응고·전해질)', fit: 'reasonable',
      result: '혈소판과 응고 수치는 정상 범위다.' },
    { id: 't-ecg', label: '심전도', fit: 'reasonable',
      result: '동성 리듬. 급성 변화는 뚜렷하지 않다.' },
    { id: 't-lp', label: '요추천자', fit: 'conditional',
      result: '보류. CT 결과를 먼저 확인해야 한다.' },
    { id: 't-mri', label: '두부 MRI', fit: 'low-yield',
      result: '지금은 시간이 오래 걸려 우선순위가 낮다.' },
    { id: 't-cspine', label: '경추 X-ray', fit: 'low-yield',
      result: '외상력이 없어 도움이 적다.' },
  ],

  imaging: {
    id: 'img-ct-1',
    title: '비조영 두부 CT',
    caption: '합성 교육용 이미지 · 진단용이 아닙니다.',
    // 도식 그림 안에서 강조해 그린 영역 (캔버스 비율 좌표 0~1). 핀 위치 비교에만 쓴다 (원칙 2: 시스템은 영상을 판독하지 않는다)
    keyRegion: { x: 0.5, y: 0.542, r: 0.12, label: '기저조 주변 고음영' },   // CtViewer.jsx 별 모양 중심 (260, 282) / 520
  },

  /* ── 검토 기준 (디브리핑에서만 공개) ─────────────────────── */
  review: {
    clues: [
      { id: 'c-sudden', text: '갑작스러운 발병 (몇 초 만에 최고조)' },
      { id: 'c-worst', text: '평생 가장 심한 두통' },
      { id: 'c-vomit', text: '구토 동반' },
      { id: 'c-neck', text: '목 뻣뻣함 호소' },
      { id: 'c-htn', text: '조절되지 않는 고혈압' },
      { id: 'c-no-trauma', text: '외상 없음 (비외상성 확인)' },
      { id: 'c-no-focal', text: '국소 신경학적 증상 없음 확인' },
    ],
    imagingFinding: '기저조 주변 고음영을 관찰하고 기록했는가',
    reasoning: [
      '갑자기 시작된 평생 가장 심한 두통, 구토, 목 뻣뻣함은 두통에서 놓치면 안 되는 위험 신호로 함께 묶어 판단한다.',
      '비외상성임을 확인한 뒤 가장 먼저 비조영 두부 CT로 출혈 여부를 확인한다.',
      'CT에서 이상이 뚜렷하지 않으면 요추천자를 고려한다. MRI·경추 X-ray는 지금 단계의 우선순위가 낮다.',
    ],
    citations: [
      { text: '급성 두통 위험 신호(갑작스러운 발병·최악의 두통·경부 강직) 평가', verified: false },
    ],
  },
};

export default CASE;

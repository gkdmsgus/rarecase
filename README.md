# RareCase

희귀 소견 판독 연습 콘솔. 가상 환자를 문진하고 검사를 오더한 뒤 영상을 판독해 소견·진단을 고르면, **미리 확정되고 승인된 정답과 근거**로 채점한다.

> ⚠️ 교육용 프로토타입이다. 지금 화면의 영상은 코드로 그린 도식 플레이스홀더이며 실제 의료영상이 아니다. 의학 내용(소견·진단 기준·인용)은 아직 원문 대조 전이라 화면에 "확인 필요"로 표시된다. 진단에 쓰면 안 된다.

## 실행

Node 22.12 이상.

```bash
npm install
```

개발 (Vite 개발 서버 + API, http://127.0.0.1:5173):

```bash
npm run dev
```

배포 모드 (빌드 결과물 + API + 영상을 한 서버로, http://127.0.0.1:8787):

```bash
npm run build
```

```bash
npm start
```

영상 데이터 폴더는 저장소 밖이어야 한다. 기본값 `C:\rarecase-data`, 바꾸려면 환경변수 `RARECASE_DATA`.

선택지 id와 순서는 비밀값으로 정한다. `RARECASE_SECRET`(16자 이상)을 정하면 재시작해도 같고, 정하지 않으면 서버를 켤 때마다 바뀐다.

## Clinical Checkpoint (논문 시스템)

논문 「생성형 AI 기반 가상환자 문진과 근거보고서형 디브리핑을 결합한 임상추론 교육 시뮬레이터 설계」의 학습 흐름을 구현한 모드. 개발 서버에서 http://127.0.0.1:5173/#cc 로 연다.

- 흐름: 가상환자 문진(자유 입력) → 신체 진찰 → 검사 선택 → CT 관찰(관찰 핀) → 근거보고서 → 디브리핑
- 증례: CC-001 급성 비외상성 두통 (`server/cc/case-headache.js`, 작성 시나리오, **의학 검수 전**이라 화면에 "확인 필요")
- 문진 응답은 증례에 등록된 사실 목록 안에서만 만든다. 서버에 `ANTHROPIC_API_KEY`가 있으면 Claude(`claude-opus-5-5`)가 그 범위 안에서 말투를 만들고, 없거나 실패하면 규칙 기반 엔진이 사실 문장을 그대로 고른다.
- 디브리핑은 미리 정한 검토 기준과 대조할 뿐, 시스템이 진단의 정오를 판정하지 않는다.
- 실제 사진(환자 카드 연출 사진, 공개 SAH CT 예시 영상)은 저장소 밖 `C:\rarecase-data\cc-media\`에 둔다. 처음 한 번 `python tools/fetch-cc-media.py`로 받는다(해시 확인). 출처·라이선스는 `data/manifest/cc-media.json`. 파일이 없으면 일러스트·도식으로 보인다.

## 검사

```bash
npm test
```

| 스크립트 | 검사 |
|---|---|
| `tools/check-cases.cjs` | 케이스 스키마, 원본 데모와 내용 대조, 깨진 케이스 숨김, 채점 조합, 키보드 |
| `tools/test-server.js` | 미승인 케이스가 응답에 없음, 채점 전 정답 비노출, 서버 채점이 모든 조합에서 원래 채점과 같음, 잘못된 채점 요청 거부, 노출 허용 데이터셋만, 경로 탈출 차단 |
| `tools/test-nih-extract.cjs` | NIH 압축 스트리밍 추출 |
| `tools/test-rsna-truth.cjs` | RSNA 정답 규칙 v1과 실제 정답 목록 불변 조건 |
| `tools/test-cc.js` | Clinical Checkpoint: 정답 비노출, 문진 범위, Claude 실패 시 되돌아가기, 디브리핑 대조, 요청 검사 |

## 구조

| 경로 | 역할 |
|---|---|
| `index.html`, `src/main.jsx`, `src/App.jsx`, `src/styles.css` | 화면 (React 18, Vite) |
| `src/lib/cases.js` | 데모 케이스 데이터 |
| `src/lib/case-schema.js` | 노출 판정: 승인됐고 형식이 온전한 케이스만 |
| `src/lib/grading.js` | 채점: 확정 정답과 대조, 부분 정답, 핵심 문진 누락, 키 입력 |
| `server/app.js` | `/api/cases`, `POST /api/grade`, `/data/<dataset>/*.png`, 배포 모드 정적 파일 |
| `server/public-case.js` | 학습자용 케이스(정답·근거·핵심 문진 표시 제거, 선택지 id 불투명화·순서 섞기)와 서버 채점 |
| `server/index.js` | 배포 모드 서버 |
| `server/cc/` | Clinical Checkpoint 증례(`case-headache.js`)와 엔진(`engine.js`: 공개 정보, 문진, 진찰·검사, 디브리핑) |
| `src/cc/` | Clinical Checkpoint 화면 (문진·진찰·검사·CT·보고서·디브리핑) |
| `data/manifest/` | 공개 데이터셋 매니페스트 (해시·라벨·메타데이터만, 영상 없음) |
| `tools/` | 데이터 수집·검사 스크립트 |
| `docs/data-plan.md` | 데이터셋 라이선스 조사, 정답 규칙, 진행 기록 |
| `docs/original-demo.html` | 출발점 데모 원본 (수정하지 않음) |
| `docs/legacy-index.html` | Vite 이전 단일 파일 버전 |

## 설계 원칙

`CLAUDE.md` 참고. 요약: 케이스 우선, 시스템은 영상을 판독하지 않음, 영상 출처 표시 유지, 정답은 영상의학과 판독 라벨만, 확인 안 된 의학 내용은 "확인 필요", 실제 영상은 저장소 밖, 라이선스가 허용한 데이터만 노출, 재식별 금지.

## 데이터 출처

- RSNA Pneumonia Detection Challenge 2018 — https://www.rsna.org/rsnai/ai-image-challenge/rsna-pneumonia-detection-challenge-2018 · Shih G, et al. Radiology: AI 2019. https://doi.org/10.1148/ryai.2019180041
- NIH ChestX-ray14 — https://nihcc.app.box.com/v/ChestXray-NIHCC · Wang X, et al. ChestX-ray8. IEEE CVPR 2017, pp. 3462-3471 · NIH Clinical Center is the data provider

# 데이터 계획 (Data Plan)

작성 2026-09-15. 결정 배경: 검수자 없음, 시스템 논문, 영상은 라이선스가 확인된 공개 데이터셋을 저장소 밖에 두고 출처·라이선스만 기록.

## 1. 핵심 제약 — "쓸 수 있다"와 "학습자에게 보여 줄 수 있다"는 다르다

RareCase는 영상을 **학습자 화면에 띄우는** 도구다. 연구실 안에서 모델을 학습시키는 것과 달리, 제3자에게 영상을 보여 주는 것은 데이터 공유에 해당할 수 있다. 그래서 데이터셋마다 두 칸을 따로 본다.

| 데이터셋 | 라이선스·조건 (원문 확인) | 연구용 사용 | 학습자 화면 노출 | 정답 라벨 출처 |
|---|---|---|---|---|
| **NIH ChestX-ray14** | "There are no restrictions on the use of the NIH chest x-ray images." 인용 요구: NIH 다운로드 링크, Wang et al. CVPR 2017, "NIH Clinical Center is the data provider" 명시 | 가능 | **가능** | 원본 14개 라벨은 판독문 NLP 추출(부정확). 추가 전문가 라벨: 4개 소견(airspace opacity, pneumothorax, nodule/mass, fracture)을 영상의학과 3명이 독립 판독 후 합의까지 조정, 810장은 5명이 14개 소견+정상/이상 판독(다수결) |
| VinDr-CXR | PhysioNet Credentialed Health Data License 1.5.0, CITI 교육 이수·DUA 서명 필요 | 가능(자격 취득 후) | **불가** — 자격 없는 사용자와 공유 금지 | 영상의학과 3명(train)/5명 합의(test), 28개 라벨, Nodule/Mass·Pneumothorax·No finding 포함 |
| MIMIC-CXR-JPG | 같은 PhysioNet 라이선스. DUA: 데이터 공유 금지, 재식별 시도 금지, 논문 쓰면 코드 공개 | 가능(자격 취득 후) | **불가** | NLP 라벨, test만 영상의학과 1명 |
| PadChest | Research Use Agreement: 데이터 공유 금지, 재식별 금지 | 가능(신청 후) | **불가** | 판독문 27%는 의사가 수작업, 나머지는 RNN 자동 |
| Montgomery County TB | "Please do not share the data set outside of your research group/organization" | 가능 | **불가**(연구 그룹 밖) | 결핵 58/정상 80, 영상의학과 gold standard 검토 |
| CheXpert | 공식 페이지에 라이선스 조건 없음 → Stanford AIMI 페이지 **미확인** | 미확인 | 미확인 | NLP 라벨, validation 200건 영상의학과 3명 합의, test 500건 8명 |
| JSRT (폐결절) | 공식 사이트 인증서 오류로 **미확인** | 미확인 | 미확인 | 미확인 |

출처 (2026-09-15 열어서 확인):
- NIH: https://docs.cloud.google.com/healthcare-api/docs/resources/public-datasets/nih-chest
- VinDr-CXR: https://physionet.org/content/vindr-cxr/1.0.0/
- MIMIC-CXR-JPG: https://physionet.org/content/mimic-cxr-jpg/2.1.0/
- PadChest: https://bimcv.cipf.es/bimcv-projects/padchest/
- Montgomery: https://data.lhncbc.nlm.nih.gov/public/Tuberculosis-Chest-X-ray-Datasets/Montgomery-County-CXR-Set/MontgomerySet/NLM-MontgomeryCXRSet-ReadMe.pdf
- CheXpert: https://stanfordmlgroup.github.io/competitions/chexpert/ (라이선스 조건 없음)

확인 필요로 남은 것
- NIH **전문가 라벨 파일 자체**의 배포 조건. 위 페이지는 영상 조건만 명시함 → 라벨 파일 원문 확인 필요
- NIH 원본 14개 라벨 목록·전체 영상 수는 Google 페이지에 "100,000 de-identified images"라고만 적혀 있음 → 다운로드 원문의 README로 확인 필요

## 2. 결론: 1차 데이터는 NIH ChestX-ray14 + 전문가 라벨

- 학습자 노출이 가능한 것은 확인한 범위에서 NIH 하나다.
- 정답은 **NLP 라벨이 아니라 영상의학과 판독 라벨만** 쓴다. NLP 라벨은 정답 근거로 쓰지 않는다.
- 다른 데이터셋(VinDr 등)은 학습자 노출 없이 **연구 내부 비교**(예: 케이스 설계 검증)에만 쓸 수 있다. 쓸지는 나중에 정한다.

### 한계 (논문에 적어야 할 것)
- **희귀 소견이 거의 없다.** 전문가 라벨이 있는 소견은 흔한 소견 위주(기흉·결절/종괴·공기음영·골절). 기존 데모의 PAVM 같은 희귀 소견은 이 데이터로 만들 수 없다.
- 따라서 "희귀 소견 판독 연습"이라는 목표와 실제 데이터 사이의 간격 자체가 시스템 논문의 논점이 된다: 승인된 정답이 있는 공개 데이터가 희귀 소견을 거의 담지 않는다.

## 3. 원칙 수정 (2026-09-15 사용자 확정, CLAUDE.md 반영)

| 원칙 | 기존 | 수정 |
|---|---|---|
| 1 케이스 우선 | 정답 소견을 먼저 정하고 영상을 만든다 | 정답 소견을 먼저 정하고 **그 소견의 전문가 라벨이 붙은 영상을 고른다**. 영상을 보고 라벨을 붙이지 않는다. 고른 조건(쿼리)을 기록한다 |
| 3 합성 영상 표시 | SYNTHETIC·"AI 생성" 워터마크 | 합성 영상은 그대로. 공개 데이터셋 영상은 "공개 데이터셋 · 교육용 · 진단 사용 금지"와 출처를 표시. 사실적인 가짜 영상 생성 금지는 유지 |
| 4 승인 | 전문가 승인 케이스만 노출 | 승인을 둘로 나눈다. **정답 라벨**: 데이터셋의 영상의학과 판독 라벨이면 외부 전문가 판정으로 인정. **작성 내용**(가상 문진·근거 문장·함정 설명): 검수자가 없으므로 "확인 필요" 표시를 달고 노출 |
| 7 실제 영상 | 저장소에 넣지 않음 | 유지. 영상은 저장소 밖 로컬 폴더에 두고, 저장소에는 매니페스트(출처·ID·해시·라이선스·인용·라벨 출처)만 둔다 |

추가 원칙
- **가상 문진은 실제 메타데이터와 모순되면 안 된다.** 실제 사람의 영상에 지어낸 병력을 붙이므로, 데이터셋의 나이·성별·촬영 방향과 맞추고 "가상 문진"으로 표시한다.
- **재식별 시도 금지.** 메타데이터로 환자를 추정하거나 다른 데이터와 연결하지 않는다.

## 4. 저장 구조

```
C:\rarecase\                      ← git 저장소 (영상 없음)
  data/manifest/nih-cxr14.json    ← 영상별 기록 (아래 형식)
  data/private/                   ← .gitignore (혹시 모를 로컬 사본)
C:\rarecase-data\                 ← 저장소 밖, 실제 영상
  nih-cxr14/images/...
```

매니페스트 항목 초안:

```json
{
  "imageId": "00000001_000.png",
  "dataset": "nih-chestxray14",
  "sha256": "…",
  "license": "NIH: no restrictions on use (checked 2026-09-15)",
  "citation": ["Wang et al., CVPR 2017", "NIH Clinical Center is the data provider"],
  "labelSource": "expert-adjudicated-3-radiologists",
  "labels": { "pneumothorax": true },
  "meta": { "age": 0, "sex": "", "view": "PA" },
  "selectedBy": "query: pneumothorax=true AND view=PA",
  "selectedAt": "2026-09-…"
}
```

## 5. 진행 (2026-09-15)

- 메타데이터 7개 다운로드 → `C:\rarecase-data\nih-cxr14\meta\` (합계 약 11.8 MB). 해시·개수는 `data/manifest/nih-cxr14-meta.json` (`node tools/nih-meta-summary.js`)
  - 영상 112,120장 · 환자 30,805명 · PA 67,310 / AP 44,810 (README 수치와 일치)
  - README 원문: 14개 라벨은 NLP 추출(정확도 >90% 추정). 라이선스 문구는 README에 없음
  - BBox_List_2017.csv: 880장·박스 984개·8개 소견. **누가 그렸는지 README에 없음** → 정답 근거로 쓰지 않음
- 영상 압축 12개: 1바이트 범위 요청으로 크기 확인, 합계 **41.98 GB**. C 드라이브 여유 38.4 GB라 전체 보관 불가 → 압축을 받으면서 필요한 PNG만 풀어 저장(스트리밍 추출)
- 전문가 라벨: Google 신청 폼(기관 유형·용도 2문항, 약관 문구 없음) 제출 후 다운로드 링크 제공
  - 2026-09-15 제출(사용자 선택: Academia / Other) → 버킷 `gcs-public-data--healthcare-nih-chest-xray-labels`
  - 익명 접근 불가: 목록 401, 알려진 파일명 직접 요청 403
  - 사용자 Google 로그인 상태에서도 실패: 콘솔 목록 "액세스 거부됨(storage.objects.list 권한 필요)", `storage.cloud.google.com` 직접 링크 403 (2026-09-15)
  - 세 가지 방법 실패로 중단. 폼이 계정 정보를 받지 않아 제출해도 개인 권한이 생기지 않는 구조로 보임(추정)
- 영상 압축 구조: 압축 안 파일이 이름순이 아님(첫 항목 확인) → 어떤 영상이 어느 압축에 있는지 미리 알 수 없음
- 추출 도구 `tools/nih-extract.js`: 압축을 스트리밍하며 목록의 PNG만 저장, 압축별 전체 색인·완료 표시(재실행 시 건너뜀), 저장소 안 출력 거부. 시험 `tools/test-nih-extract.js` 10/10 (가짜 파일 압축, ustar·pax, 0·512·513바이트, 잘린 압축, 없는 주소)
- 다운로드 속도: Box 50 MB 범위 요청 1회 0.67 MB/s → 전체 41.98 GB 대략 17.8시간 (측정 1회라 어림)

## 5-1. 대체 라벨 조사 (2026-09-15, Google 라벨 접근 실패 후)

NIH 영상 위에 전문가가 라벨을 붙인 공개 데이터

| 데이터 | 조건 (원문 확인) | 판독 방식 | 소견 | 받기 |
|---|---|---|---|---|
| **RSNA Pneumonia Detection Challenge 2018** | Terms PDF: "academic research and education, and other commercial or non-commercial purposes". 조건 ① 대상자 식별·연락 시도 금지 ② 공유·재배포 시 NIH 링크·CVPR 2017 인용·"NIH Clinical Center is the data provider" + RSNA 링크·Shih et al. Radiology: AI 2019 인용. ※ 데이터 설명서에는 "Non-commercial purpose"라고 적혀 있어 두 문서가 다름 → 비상업 교육용이면 둘 다 충족 | NIH 3만 장. **train: 영상의학과 1명**, **test 4,527장: 3명(STR 2 + RSNA 1)**, 합의 안 된 1,380장(30%)은 STR 판독의가 조정. 판독의 18명(16기관, 흉부영상의학 12명, 평균 경력 10.6년) | Lung Opacity / No Lung Opacity·Not Normal / Normal. 3명 판독분 중 Normal 1,455, Not Normal 1,200 → Opacity는 4,527 − 1,455 − 1,200 = 1,872 | RSNA S3, 로그인 불필요. HEAD로 확인: 원본 NIH 영상 zip 3,252.6 MB, 조정 영상 zip 3,794.4 MB, 원래 라벨 json 18.7 MB, 조정 라벨 json 49.6 MB, 대응표 json 16.8 MB |
| ChestX-Det (Deepwise) | GitHub 저장소 LICENSE = Apache-2.0. README에는 라이선스·인용 문구 없음 → 저장소 라이선스가 영상·라벨에도 적용되는지 **확인 필요** | 영상의학과 3명, 합의 방식 README에 없음 | 13개(기흉·결절·종괴·골절·석회화·심비대 등), 박스+폴리곤 | resource.deepwise.com — 2026-09-15 응답 없음 |
| SIIM-ACR Pneumothorax | SIIM 페이지에 조건 없음, Kaggle 규칙 **미확인** | 페이지에 없음 | 기흉 마스크 | Kaggle(계정 필요) |

출처: RSNA 챌린지 페이지 https://www.rsna.org/rsnai/ai-image-challenge/rsna-pneumonia-detection-challenge-2018 · Terms PDF · Dataset Description PDF · 논문 https://pmc.ncbi.nlm.nih.gov/articles/PMC8017407/ · https://github.com/Deepwise-AILab/ChestX-Det-Dataset · https://siim.org/research-journal/siim-machine-learning-challenges/pneumothorax-kaggle-challenge/

권장: **RSNA test 4,527장(3명 판독+조정)을 정답 라벨로** 사용 (원칙 4 "여러 명 합의"). train(1명 판독)은 정답으로 쓰지 않음.
- 장점: 로그인·결제 없음, 교육용 사용과 재배포 조건이 문서로 명시(원칙 8), Normal·Not Normal이 있어 원칙 5(흔함·정상 섞기)에 맞음, 영상 zip이 3.3~3.8 GB라 디스크에 들어감
- 한계: 소견이 폐 음영(폐렴 의심) 하나뿐. 희귀 소견 없음. 다른 소견은 ChestX-Det 조건 확인 후 보강 검토

## 5-2. RSNA 다운로드·라벨 구조 확인 (2026-09-15, 사용자 확정)

받은 파일 (`C:\rarecase-data\rsna-pneumonia\labels\`)
| 파일 | 바이트 기준 MB | sha256 | 실제 내용 |
|---|---|---|---|
| pneumonia-challenge-annotations-adjudicated-kaggle_2018.json | 49.6 | F8F5C54B…E01B18FB | md.ai 프로젝트 x9N20BZa, 30,000 study, 주석 83,809개, 라벨 그룹 7개(Default·QA·Team 1·Team 2·Team 2a·Calculated·Adjudication) |
| pneumonia-challenge-annotations-original_2018.json | 18.7 | 5FBFA5A7…7C9F45 | 프로젝트 LxR6zdR2 "stage 1 train", 25,684 study, 라벨 2개(Lung Opacity / No Lung Opacity) |
| pneumonia-challenge-dataset-mappings_2018.json | 16.8 | 803CE79E…BA10BF27 | 30,000행: NIH `img_id`(PNG 이름) ↔ StudyInstanceUID, NIH 원래 NLP 라벨 |

영상 zip (끝부분 중앙 디렉터리만 받아 목록 확인, `tools/zip-remote-list.js`)
- `…dataset-original_2018.zip` 3,252.6 MB = DICOM 25,684개(stage 1 train, 프로젝트 LxR6zdR2)
- `…dataset-adjudicated-kaggle_2018.zip` 3,794.4 MB (3,978,753,654 B) = **DICOM 30,000개**(프로젝트 x9N20BZa) → 이것을 받음
- 이름의 original/adjudicated가 내용과 직관적으로 맞지 않음. 판독 팀 기록이 있는 쪽은 x9N20BZa

라벨 구조 대조 (논문 Shih 2019와 비교)
| 항목 | 파일에서 센 값 | 논문 | 판정 |
|---|---|---|---|
| Team 1 + Team 2 + Team 2a 모두 판독 | 4,526 | test 4,527 | 1장 차이 |
| Adjudication 그룹이 있는 study (STR 팀이 하나라도 있는 5,256장 중) | 1,380 | 조정 1,380 | **일치** |
| 3팀 판독 4,526장의 Calculated 라벨 | Normal 1,439 · Not Normal 1,434 · Lung Opacity 1,639 · 없음 14 | Normal 1,455 · Not Normal 1,200 | **불일치** |
| STR 팀이 하나만 있는 study | Team 1+2: 679, Team 1+2a: 51 | — | 논문 test 정의에 포함되는지 불명 |

→ 논문의 test 세트를 파일에서 똑같이 재현하는 규칙은 **아직 못 찾음**.

### 정답 규칙 v1 (`rsna-truth-v1`, 2026-09-15 사용자 확정)
1. 대상: Team 1(RSNA)·Team 2(STR)·Team 2a(STR) 세 팀 모두 판독한 study (4,526)
2. 정답: Calculated 그룹 라벨 (판독의 기록을 규칙으로 합친 값 — AI 판독 아님)
3. 제외: 판독의 Exclude 표시 14 (이 14장은 Calculated 라벨도 없음) / 조정 판독의가 명시한 분류와 Calculated가 다름 2
4. 박스: Lung Opacity인 경우 Calculated 박스 (원본 픽셀 좌표)
5. NIH NLP 라벨 사용 안 함, 출력에 환자 ID 없음(나이·성별·촬영 방향만)

근거 확인: 3팀 판독 중 조정된 1,350장에서 조정 판독의가 분류를 명시한 706장 중 704장이 Calculated와 일치. 명시 없이 저확률 음영·Flag만 남긴 경우는 Calculated가 판독의 다수 기록을 따름.

결과 `data/manifest/rsna-truth.json` (`node tools/rsna-build-truth.js`, 시험 `tools/test-rsna-truth.js` 15/15)
- 포함 **4,510** = 정상 1,437 · 음영 없음/비정상 1,434 · 폐 음영 1,639 (음영 전부 박스 있음)
- 조정 거친 포함 1,348 · PA 2,425 / AP 2,085 · M 2,569 / F 1,941
- 논문 수치(정상 1,455·비정상 1,200)와 차이는 논문 한계 절에 기록할 것

## 6. 다음 단계

1. NIH 전문가 라벨 파일과 README 원문 확인 (배포 조건, 라벨 목록)
2. 다운로드 범위 결정: 전체(대략 수십 GB, **미확인**) 대신 전문가 라벨이 있는 영상만 받기
3. 매니페스트 생성·검증 스크립트 (해시 대조, NLP 라벨 사용 금지 검사)
4. 영상 뷰어가 로컬 폴더의 실제 영상을 표시하도록 변경, 워터마크 문구 분기

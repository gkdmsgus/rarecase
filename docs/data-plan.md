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

## 3. 원칙 수정안

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

## 5. 다음 단계

1. NIH 전문가 라벨 파일과 README 원문 확인 (배포 조건, 라벨 목록)
2. 다운로드 범위 결정: 전체(대략 수십 GB, **미확인**) 대신 전문가 라벨이 있는 영상만 받기
3. 매니페스트 생성·검증 스크립트 (해시 대조, NLP 라벨 사용 금지 검사)
4. 영상 뷰어가 로컬 폴더의 실제 영상을 표시하도록 변경, 워터마크 문구 분기

# Clinical Checkpoint 실제 사진 받기. 저장소 밖 DATA_ROOT/cc-media/ 에 내려받고 sha256을 확인한다.
# 사진은 저장소에 넣지 않는다 (원칙 7). 출처·라이선스는 data/manifest/cc-media.json.
# 실행: python tools/fetch-cc-media.py   (DATA_ROOT 기본값 C:\rarecase-data, 바꾸려면 환경변수 RARECASE_DATA)
import hashlib, json, os, sys, urllib.request

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
data_root = os.environ.get("RARECASE_DATA", r"C:\rarecase-data")
dest = os.path.join(data_root, "cc-media")
os.makedirs(dest, exist_ok=True)
items = json.load(open(os.path.join(REPO, "data", "manifest", "cc-media.json"), encoding="utf-8"))["items"]
ua = "RareCaseEducationalApp/1.0 (non-commercial university project; github.com/gkdmsgus/rarecase)"
bad = 0
for it in items:
    path = os.path.join(dest, it["file"])
    if not os.path.exists(path):
        req = urllib.request.Request(it["originalUrl"], headers={"User-Agent": ua})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
    ok = digest == it["sha256"]
    bad += not ok
    print(f"{'OK  ' if ok else 'HASH MISMATCH'} {it['file']}  ({it['license']}, {it['author']})")
sys.exit(1 if bad else 0)

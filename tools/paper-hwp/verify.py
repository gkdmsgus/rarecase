# 만든 hwp(→PDF)를 검사한다. 항목: 쪽수, 본문 일치, 양식 잔여물, 빨간 글자, 그림 크기, 저자·이메일·머리글, hwp 재열기
import fitz, json, re, sys, os, difflib
import win32com.client as win32
D = sys.argv[1]
C = json.load(open(os.path.join(D, "content.json"), encoding="utf-8"))
doc = fitz.open(os.path.join(D, "out.pdf"))
res = []
def check(name, ok, detail=""): res.append((ok, name, detail))
check("쪽수 2", len(doc) == 2, len(doc))
text = "".join(p.get_text() for p in doc)
norm = lambda s: re.sub(r"\s+", "", s)
T = norm(text)
pieces = [C["title_ko"], C["authors_ko"], C["affil_ko"], C["emails"], C["title_en"], C["authors_en"], C["affil_en"][1:], C["abstract"], C["keywords"],
          *C["intro"], C["fig1_caption"], C["body1"], C["fig2_caption"], C["fig3_caption"], C["fig4_caption"], *C["body2"], C["table_caption"],
          *[c for r in C["table"] for c in r], C["conclusion"], *C["refs"], "Ⅰ.서론", "Ⅱ.본론", "Ⅴ.결론", "참고문헌"]
missing = [p[:30] for p in pieces if norm(p) not in T]
check("전사본 문장 전부 포함", not missing, missing)
for bad in ["ZigBee", "~~", "신명조,", "성춘향", "Hankuk", "감사의글", "혁신사업", "AODV", "중고딕,"]:
    check(f"양식 잔여물 없음: {bad}", bad not in T)
reds = [s["text"] for p in doc for b in p.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"] if s["color"] == 0xFF0000 and s["text"].strip()]
check("빨간 글자 없음", not reds, reds[:3])
want = {(142, 129), (170, 128), (136, 79), (136, 103)}
got = [(round(p.get_image_bbox(i).width), round(p.get_image_bbox(i).height)) for p in doc for i in p.get_images(full=True)]
ok = len(got) == 4 and all(any(abs(g[0]-w[0]) <= 2 and abs(g[1]-w[1]) <= 2 for w in want) for g in got)
check("그림 4장, 최종본 크기와 2pt 이내", ok, got)
spans = {"".join(s["text"] for s in l["spans"]): l["spans"][0]["size"] for b in doc[0].get_text("dict")["blocks"] for l in b.get("lines", [])}
au = [v for k, v in spans.items() if k.startswith("김민정")]
check("국문 저자 순서·글자 10pt", bool(au) and abs(au[0]-10) < 0.2 and "김민정,박다윗,하은현,황선희" in T, au)
check("이메일 순서", norm(C["emails"]) in T)
check("머리글 두 쪽 모두", all("2026년한국실천공학교육학회학술발표대회논문집.Vol.1,No.1,2026" in norm(p.get_text()) for p in doc))
order = [T.find(norm(x)) for x in ["Ⅰ.서론", "Ⅱ.본론", C["fig1_caption"], C["fig2_caption"], C["fig4_caption"], C["table_caption"], "Ⅴ.결론", "참고문헌"]]
check("절·그림·표 순서", order == sorted(order) and -1 not in order, order)
hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
try:
    hwp.XHwpWindows.Item(0).Visible = False
    hwp.SetMessageBoxMode(0x2FFF1)
    try: hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception: pass
    import shutil; cp = os.path.join(D, "verify_copy.hwp"); shutil.copy(os.path.join(D, "out.hwp"), cp)
    ok = hwp.Open(cp, "HWP", "forceopen:true"); pc = hwp.PageCount
finally:
    hwp.Clear(1); hwp.Quit()
check("hwp 다시 열기·2쪽", ok and pc == 2, (ok, pc))
for ok, n, d in res: print("PASS" if ok else "FAIL", n, "" if ok else d)
print("ALL_PASS" if all(r[0] for r in res) else "SOME_FAIL")

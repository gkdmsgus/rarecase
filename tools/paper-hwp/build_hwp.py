# 학회 양식 hwp(2026 논문양식.hwp) 사본에 최종본 논문 내용을 채워 hwp로 저장한다.
# 내용: content.json (최종 PDF에서 전사, OCR 대조), 그림: fig1~4.png (최종 PDF 내장 이미지)
# 문단 번호는 template_map.json 기준. 번호가 밀리지 않게 아래쪽 문단부터 고친다.
import win32com.client as win32, sys, os, json, shutil
SP = sys.argv[1]; OUT_HWP = sys.argv[2]; OUT_PDF = sys.argv[3]
C = json.load(open(os.path.join(SP, "content.json"), encoding="utf-8"))
work = os.path.join(SP, "build_work.hwp"); shutil.copy(r"C:\Users\gkdmsgus\Downloads\2026 논문양식.hwp", work)
hwp = win32.gencache.EnsureDispatch("HWPFrame.HwpObject")
A = hwp.HAction; P = hwp.HParameterSet

def ins(text):
    A.GetDefault("InsertText", P.HInsertText.HSet); P.HInsertText.Text = text; A.Execute("InsertText", P.HInsertText.HSet)
def char(**kw):
    A.GetDefault("CharShape", P.HCharShape.HSet)
    for k, v in kw.items(): setattr(P.HCharShape, k, v)
    A.Execute("CharShape", P.HCharShape.HSet)
def para_shape(**kw):
    A.GetDefault("ParagraphShape", P.HParaShape.HSet)
    for k, v in kw.items(): setattr(P.HParaShape, k, v)
    A.Execute("ParagraphShape", P.HParaShape.HSet)
def sel_para(i, start=0):
    assert hwp.SetPos(0, i, start), f"SetPos fail {i}"
    hwp.Run("MoveSelParaEnd")
def replace(i, text, start=0, black=True):
    if para_text(i, start):
        sel_para(i, start); hwp.Run("Delete")
    else:
        hwp.SetPos(0, i, start)
    ins(text)
    if black:
        sel_para(i, start); char(TextColor=0); hwp.Run("Cancel")
def para_text(i, start=0):
    sel_para(i, start); t = hwp.GetTextFile("UNICODE", "saveblock:true") or ""; hwp.Run("Cancel"); return t.strip()
def delete(i):
    # 내용이 있으면 지우고, 빈 문단은 앞 문단에 합친다(앞 문단 모양 유지).
    # 빈 선택에서 Delete를 부르면 다음 문단 경계를 지우므로 쓰지 않는다.
    if para_text(i):
        sel_para(i); hwp.Run("Delete")
    hwp.SetPos(0, i, 0); hwp.Run("DeleteBack")
def add_after(i, text):
    hwp.SetPos(0, i, 0); hwp.Run("MoveParaEnd"); hwp.Run("BreakPara")
    if text: ins(text)
    return i + 1
def center():
    para_shape(AlignType=3, Indentation=0, LeftMargin=0)
def picture(path, w_mm, h_mm):
    ctrl = hwp.InsertPicture(path, True, 1, False, False, 0, w_mm, h_mm)
    ps = ctrl.Properties; ps.SetItem("TreatAsChar", True); ctrl.Properties = ps
    return ctrl
def find_ctrls(cid, desc=None):
    out, c = [], hwp.HeadCtrl
    while c:
        if c.CtrlID == cid and (desc is None or c.UserDesc == desc): out.append(c)
        c = c.Next
    return out
PT2MM = 25.4 / 72
try:
    hwp.XHwpWindows.Item(0).Visible = False
    hwp.SetMessageBoxMode(0x2FFF1)
    try: hwp.RegisterModule("FilePathCheckDLL", "FilePathCheckerModule")
    except Exception: pass
    assert hwp.Open(work, "HWP", "forceopen:true")

    # 0) 제목 위 안내 상자(사각형) 삭제
    for c in find_ctrls("gso", "사각형"): hwp.DeleteCtrl(c)

    # 1) 참고문헌 (50~55): 4건으로
    delete(55); delete(54)
    for n in (3, 2, 1, 0): replace(50 + n, C["refs"][n], start=6)   # "[ 1 ] " 6글자(고정 공백 포함)는 양식 그대로
    # 2) 감사의 글(46~48) 삭제 — 최종본에 없음
    delete(48); delete(47); delete(46)
    delete(45)          # 참고문헌 앞 빈 줄(제목 위 간격으로 충분)
    # 3) 결론
    replace(44, C["conclusion"])
    delete(42); delete(41)   # 결론 앞 빈 줄 2개
    # 4) 소제목 예시(39,40) 삭제, 표 아래·위 빨간 안내(37,35) 삭제
    delete(40); delete(39); delete(38); delete(37)   # 38: 표 뒤 빈 줄
    # 5) 표 1: 양식 표 지우고 4행 3열로 새로 만든다 (문단 36)
    for c in find_ctrls("tbl"): hwp.DeleteCtrl(c)
    hwp.SetPos(0, 36, 0)
    A.GetDefault("TableCreate", P.HTableCreation.HSet)
    t = P.HTableCreation; t.Rows = 4; t.Cols = 3; t.WidthType = 2; t.HeightType = 0
    widths = [13, 28, 36]
    t.WidthValue = hwp.MiliToHwpUnit(sum(widths)); t.CreateItemArray("ColWidth", 3)
    for k, w in enumerate(widths): t.ColWidth.SetItem(k, hwp.MiliToHwpUnit(w))
    t.TableProperties.TreatAsChar = 1
    A.Execute("TableCreate", t.HSet)
    for r, row in enumerate(C["table"]):
        for k, cell in enumerate(row):
            char(Bold=1 if r == 0 else 0, TextColor=0, Height=850)
            ins(cell)
            if not (r == 3 and k == 2): hwp.Run("TableRightCell")
    hwp.Run("Cancel"); hwp.MovePos(3)   # 표 밖으로
    delete(35)
    replace(34, C["table_caption"])
    # 6) 표 위 빈 문단(30~33) 삭제
    for i in (33, 32, 31, 30): delete(i)
    # 7) 본론 본문: 28 소제목 삭제, 29 → body1, 그 뒤에 그림 2~4와 본문 3문단
    delete(28)          # 이제 기존 29가 28
    replace(28, C["body1"])
    for body in reversed(C["body2"]):
        add_after(28, body)
    figs = [("fig2.png", 170.1, 128.2, C["fig2_caption"]), ("fig3.png", 135.9, 79.4, C["fig3_caption"]), ("fig4.png", 136.5, 102.7, C["fig4_caption"])]
    add_after(28, "")                                   # 캡션 4와 본문 사이 빈 줄
    for f, w, h, cap in reversed(figs):
        j = add_after(28, cap); center(); sel_para(j); char(TextColor=0, Bold=0); hwp.Run("Cancel")
        hwp.SetPos(0, 28, 0); hwp.Run("MoveParaEnd"); hwp.Run("BreakPara"); center()
        picture(os.path.join(SP, f), w * PT2MM, h * PT2MM)
    # 8) 그림 1 (문단 25): 양식 그림 지우고 새 그림, 캡션 26, 빈 문단 21~24 정리
    for c in find_ctrls("gso", "그림"):
        a = c.GetAnchorPos(0)
        if a.Item("Para") == 25: hwp.DeleteCtrl(c)
    hwp.SetPos(0, 25, 0); picture(os.path.join(SP, "fig1.png"), 141.9 * PT2MM, 129.1 * PT2MM)
    replace(26, C["fig1_caption"]); sel_para(26); char(Bold=0); hwp.Run("Cancel")
    for k in (24, 23, 22, 21): delete(k)
    # 9) 서론: 18(빨간 안내) 삭제, 17 → intro[0], 그 뒤 intro[1]
    delete(19)          # 본론 제목 앞 빈 줄
    delete(18)
    replace(17, C["intro"][0]); add_after(17, C["intro"][1])
    replace(16, "Ⅰ. 서 론", start=32)
    # 10) 제목 블록
    replace(14, C["keywords"])
    replace(12, C["abstract"])
    replace(10, "요  약")
    replace(8, C["affil_en"][1:], start=1)        # 앞의 위첨자 * 유지
    sel_para(8); char(TextColor=0); hwp.Run("Cancel")   # 위첨자 * 도 검은색
    replace(7, C["authors_en"]); sel_para(7); char(Height=1000, SuperScript=0); hwp.Run("Cancel"); replace(6, C["title_en"]); sel_para(6); char(Height=1100, Bold=1); para_shape(LineSpacingType=0, LineSpacing=110); hwp.Run("Cancel")   # 최종본: 영문 제목 굵게·작게·좁은 줄 간격
    replace(4, C["emails"]); replace(3, C["affil_ko"]); replace(2, C["authors_ko"]); sel_para(2); char(Height=1000, SuperScript=0); hwp.Run("Cancel")
    replace(0, C["title_ko"], start=16)           # secd·cold 개체(0~15) 뒤부터
    delete(1)           # 최종본: 국문 제목과 저자 사이 빈 줄 없음
    print("pages:", hwp.PageCount)
    hwp.SaveAs(OUT_HWP, "HWP", ""); hwp.SaveAs(OUT_PDF, "PDF", "")
    print("saved")
finally:
    hwp.Clear(1); hwp.Quit()

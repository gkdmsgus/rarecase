# 논문 그림 생성: 그림 1 시스템 구조, 그림 2 학습 흐름
# 실행: python tools/draw-figures.py
# 상자 밖으로 글자가 넘치지 않도록, 글자 폭을 재서 상자 크기를 정한다.
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib import font_manager

for name in ["Malgun Gothic", "NanumGothic", "Gulim"]:
    try:
        font_manager.findfont(name, fallback_to_default=False)
        plt.rcParams["font.family"] = name
        break
    except Exception:
        continue
plt.rcParams["axes.unicode_minus"] = False

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "figures")
INK = "#14202b"; LINE = "#5c6b7a"; SOFT = "#eaf0f5"; WARM = "#f6efe3"; PLAIN = "#f5f6f7"


def draw_box(ax, x, y, w, h, title, lines, fc=SOFT, title_size=7.2, body_size=6.2):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.35,rounding_size=1.0",
                                linewidth=0.9, edgecolor=LINE, facecolor=fc, zorder=2))
    cx = x + w / 2
    ax.text(cx, y + h - 2.0, title, ha="center", va="top", fontsize=title_size,
            color=INK, fontweight="bold", zorder=3)
    for i, t in enumerate(lines):
        ax.text(cx, y + h - 6.3 - i * 4.3, t, ha="center", va="top",
                fontsize=body_size, color=INK, zorder=3)


def arrow(ax, p1, p2, label="", side="right", rad=0.0, size=6.5):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=7, linewidth=0.9,
                                 color=LINE, connectionstyle="arc3,rad=%.2f" % rad, zorder=1))
    if not label:
        return
    mx, my = (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2
    if side == "right":
        ax.text(mx + 1.4, my, label, ha="left", va="center", fontsize=size, color=LINE, zorder=3)
    elif side == "left":
        ax.text(mx - 1.4, my, label, ha="right", va="center", fontsize=size, color=LINE, zorder=3)
    else:  # top
        ax.text(mx, my + 1.6, label, ha="center", va="bottom", fontsize=size, color=LINE, zorder=3)


def fig_architecture(path):
    """그림 1. 시스템 구조 — 화면 / 서버 / 생성형 AI / 데이터"""
    fig, ax = plt.subplots(figsize=(3.5, 3.2), dpi=320)
    ax.set_xlim(0, 100); ax.set_ylim(0, 92); ax.axis("off")

    draw_box(ax, 6, 70, 58, 18, "학습자 화면 (웹)",
             ["문진 · 진찰 · 영상 관찰", "근거보고서 작성"])
    draw_box(ax, 6, 40, 58, 20, "애플리케이션 서버",
             ["증례 제공 · 응답 중계", "기록 저장 · 기준 대조"])
    draw_box(ax, 70, 40, 26, 20, "생성형 AI", ["환자 응답 생성", "기록 구조화"], fc=WARM)
    draw_box(ax, 6, 6, 58, 22, "데이터",
             ["증례 지식베이스 (검수)", "교육용 영상 · 검토 기준", "학습 기록"], fc=PLAIN)

    arrow(ax, (30, 70), (30, 60), "행동 전송", side="left")
    arrow(ax, (42, 60), (42, 70), "화면 자료", side="right")
    arrow(ax, (64, 52), (70, 52), "")
    arrow(ax, (70, 46), (64, 46), "")
    arrow(ax, (36, 40), (36, 28), "저장 · 조회", side="left")

    ax.text(83, 37, "진단 판정 · 치료 지시 제외", ha="center", va="top",
            fontsize=5.8, color="#8a5c0e")
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def fig_flow(path):
    """그림 2. 학습 흐름 — 증례 정의부터 디브리핑까지"""
    fig, ax = plt.subplots(figsize=(3.5, 2.6), dpi=320)
    ax.set_xlim(0, 100); ax.set_ylim(0, 74); ax.axis("off")

    w, h = 28, 20
    draw_box(ax, 4, 50, w, h, "① 증례 정의", ["전문가 검수 사실", "검토 기준"])
    draw_box(ax, 36, 50, w, h, "② 가상환자 문진", ["자유 문장 질문", "범위 내 응답"])
    draw_box(ax, 68, 50, w, h, "③ 진찰 · 관찰", ["핵심 신체 진찰", "교육용 영상"])
    draw_box(ax, 20, 12, w, h, "④ 근거보고서", ["검사 선택 이유", "판단과 근거"])
    draw_box(ax, 52, 12, w, h, "⑤ 디브리핑", ["기준과 대조", "누락 단서 확인"])

    arrow(ax, (32, 60), (36, 60))
    arrow(ax, (64, 60), (68, 60))
    arrow(ax, (82, 50), (48, 32), rad=0.16)
    arrow(ax, (48, 22), (52, 22))
    fig.savefig(path, bbox_inches="tight", facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    fig_architecture(os.path.join(OUT, "architecture.png"))
    fig_flow(os.path.join(OUT, "flow.png"))
    print("saved architecture.png, flow.png")

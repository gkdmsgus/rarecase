# 스크린캐스트 프레임(docs/demo/raw/frames)을 30fps 시간축에 맞춰 MP4로 만든다.
# 출력 k번째 프레임(시각 k/30초)에는 그 시각까지 받은 가장 최근 프레임을 쓴다 → 길이가 녹화 시간과 정확히 같다.
# 실행: python tools/demo/build-video.py   (먼저 node tools/demo/record-demo.mjs)
# 결과: docs/demo/clinical-checkpoint-demo.mp4
import bisect, json, math, os, subprocess, sys

FPS = 30
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "docs", "demo")
FR = os.path.join(OUT, "raw", "frames")
tl = json.load(open(os.path.join(OUT, "timeline.json"), encoding="utf-8"))
frames = sorted(tl["frames"], key=lambda f: f["ts"])
start, end = tl["t0"], tl["end"]
if not frames:
    sys.exit("프레임이 없습니다")
ts = [f["ts"] for f in frames]
total = int(math.floor((end - start) * FPS))

mp4 = os.path.join(OUT, "clinical-checkpoint-demo.mp4")
cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-",
       "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xf3f6fa",
       "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), "-movflags", "+faststart", mp4]
p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
cache = {}
used = set()
for k in range(total):
    t = start + k / FPS
    i = max(0, bisect.bisect_right(ts, t) - 1)   # t 이전에 받은 마지막 프레임 (처음엔 첫 프레임)
    name = frames[i]["file"]
    if name not in cache:
        cache.clear()
        cache[name] = open(os.path.join(FR, name), "rb").read()
    used.add(name)
    p.stdin.write(cache[name])
p.stdin.close()
if p.wait() != 0:
    sys.exit("ffmpeg 실패")
print(json.dumps({"mp4": mp4, "output_frames": total, "seconds": round(total / FPS, 2),
                  "source_frames": len(frames), "source_frames_used": len(used)}, ensure_ascii=False))

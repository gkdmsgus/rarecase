// Clinical Checkpoint 시연 영상 녹화 (docs/demo-video-scenario.md 컷 1~10).
// 실행: 개발 서버(npm run dev, 5173)를 켠 상태에서  node tools/demo/record-demo.mjs
// 결과: docs/demo/raw/frames/*.jpg (Chrome 스크린캐스트 프레임과 시각), docs/demo/timeline.json (컷 시각·오류).
// 영상 합치기: python tools/demo/build-video.py
// 자막은 화면 안에 그려 녹화한다 (한글 글꼴을 브라우저가 그리므로 깨지지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(REPO, 'docs', 'demo');
const RAW = path.join(OUT, 'raw');
const APP = process.env.CC_URL || 'http://127.0.0.1:5173/#cc';
const VIEW = { width: 1536, height: 864 };     // 화면 배율 1.25 → 프레임 1920×1080
fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(path.join(RAW, 'frames'), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fig2 = 'data:image/png;base64,' + fs.readFileSync(path.join(REPO, 'tools', 'paper-hwp', 'fig2.png')).toString('base64');

// 가짜 커서 + 클릭 표시 + 자막 상자. 문서가 바뀔 때마다 다시 붙인다.
const OVERLAY = `
(() => {
  if (document.getElementById('__cap')) return;
  const add = () => {
    if (document.getElementById('__cap')) return;
    const st = document.createElement('style');
    st.textContent = '#__cur{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(37,99,235,.28);border:2px solid #2563eb;z-index:2147483646;pointer-events:none;transition:transform .08s}'
      + '#__cur.down{transform:scale(.7);background:rgba(37,99,235,.55)}'
      + '.__ripple{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid #2563eb;z-index:2147483645;pointer-events:none;animation:__r .6s ease-out forwards}'
      + '@keyframes __r{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}'
      + '#__cap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%);max-width:78%;padding:12px 22px;border-radius:12px;background:rgba(15,23,42,.86);color:#fff;font:600 22px/1.5 "Malgun Gothic","Apple SD Gothic Neo",sans-serif;text-align:center;z-index:2147483647;pointer-events:none;box-shadow:0 6px 24px rgba(0,0,0,.25)}'
      + '#__cap:empty{display:none}';
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id = '__cur'; document.body.appendChild(c);
    const cap = document.createElement('div'); cap.id = '__cap'; document.body.appendChild(cap);
    if (window.__lastXY) { c.style.left = window.__lastXY[0] + 'px'; c.style.top = window.__lastXY[1] + 'px'; }
    if (!document.__ccEvents) {   // document.open()이 창의 이벤트를 지우므로 문서마다 붙인다
      document.__ccEvents = true;
      const cur = () => document.getElementById('__cur');
      document.addEventListener('mousemove', (e) => { window.__lastXY = [e.clientX, e.clientY]; const k = cur(); if (k) { k.style.left = e.clientX + 'px'; k.style.top = e.clientY + 'px'; } }, true);
      document.addEventListener('mousedown', (e) => { const k = cur(); if (k) k.classList.add('down'); const r = document.createElement('div'); r.className = '__ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
      document.addEventListener('mouseup', () => { const k = cur(); if (k) k.classList.remove('down'); }, true);
    }
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();`;

const CARD = (inner) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#f3f6fa;font-family:"Malgun Gothic",sans-serif;color:#1f2937}
  .box{background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:56px 72px;max-width:1080px;text-align:center;box-shadow:0 10px 30px rgba(15,23,42,.06)}
  .logo{display:inline-flex;align-items:center;gap:14px;font-size:40px;margin-bottom:26px}
  .logo i{width:46px;height:46px;border-radius:12px;background:#2563eb;color:#fff;display:grid;place-items:center;font-style:normal;font-weight:700;font-size:32px}
  .logo b{color:#2563eb}
  h1{font-size:30px;line-height:1.5;margin:0 0 18px;font-weight:700}
  p{margin:6px 0;color:#64748b;font-size:20px}
  .warn{display:inline-block;margin-top:22px;color:#b45309;background:#fff7ed;border:1px solid #fed7aa;border-radius:999px;padding:6px 18px;font-size:17px}
</style></head><body>${inner}</body></html>`;

const TITLE = CARD(`<div class="box"><div class="logo"><i>+</i><span>Clinical</span><b>Checkpoint</b></div>
  <h1>생성형 AI 기반 가상환자 문진과 근거보고서형 디브리핑을 결합한<br>임상추론 교육 시뮬레이터</h1>
  <p>시연 영상 · 증례 CC-001 급성 비외상성 두통</p>
  <span class="warn">교육용 시뮬레이터 · 가상 환자 · 의학 내용 검수 전(확인 필요)</span></div>`);

// 그림 2(학습 흐름) — 다섯 상자를 차례로 강조한다. 상자 좌표는 fig2.png(932×704) 기준
const BOXES = [[64, 63, 312, 241], [341, 63, 590, 241], [619, 63, 868, 241], [203, 392, 451, 570], [481, 392, 729, 570]];
const FLOW = CARD(`<div class="box" style="padding:36px 48px"><h1 style="margin-bottom:10px">학습 흐름</h1>
  <div id="fig" style="position:relative;width:820px;margin:0 auto"><img src="${fig2}" style="width:100%;display:block">
  ${BOXES.map(([x1, y1, x2, y2], i) => `<div class="hl" id="hl${i}" style="position:absolute;left:${(x1 / 932) * 100}%;top:${(y1 / 704) * 100}%;width:${((x2 - x1) / 932) * 100}%;height:${((y2 - y1) / 704) * 100}%;border:5px solid #2563eb;border-radius:12px;box-shadow:0 0 0 6px rgba(37,99,235,.18);opacity:0;transition:opacity .4s"></div>`).join('')}
  </div></div>`);

const END = CARD(`<div class="box"><div class="logo"><i>+</i><span>Clinical</span><b>Checkpoint</b></div>
  <h1>AI는 진단 도구가 아니라<br>상호작용과 학습 근거를 정리하는 도구로만 쓰입니다</h1>
  <p>김민정, 박다윗, 하은현, 황선희</p><p>동양미래대학교 컴퓨터소프트웨어공학과</p>
  <span class="warn">본 시스템은 교육용 시뮬레이터이며 실제 진단에 사용하지 않습니다</span></div>`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1.25, locale: 'ko-KR' });
await context.addInitScript(OVERLAY);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// Chrome 스크린캐스트: 화면이 바뀔 때마다 JPEG 프레임과 시각을 받는다
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on('Page.screencastFrame', async (f) => {
  const file = String(frames.length).padStart(6, '0') + '.jpg';
  fs.writeFileSync(path.join(RAW, 'frames', file), Buffer.from(f.data, 'base64'));
  frames.push({ file, ts: f.metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

const t0 = Date.now();
const timeline = [];
const cut = async (n, text) => {
  timeline.push({ cut: n, t: (Date.now() - t0) / 1000, text });
  await page.evaluate(OVERLAY);
  await page.evaluate((s) => { const c = document.getElementById('__cap'); if (c) c.textContent = s; }, text);
};
const mouseTo = async (loc) => {
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await sleep(250);
};
const click = async (loc) => { await loc.scrollIntoViewIfNeeded(); await mouseTo(loc); await loc.click(); await sleep(400); };
const type = async (loc, text, delay = 55) => { await click(loc); await loc.pressSequentially(text, { delay }); };
// 카드 화면: 오버레이가 붙은 뒤 커서를 오른쪽 아래 구석으로 치운다
// (카드는 document.open으로 그려 이벤트가 지워지므로 커서를 숨긴다. 카드에는 클릭 동작이 없다)
const park = async () => { await page.evaluate(() => { const c = document.getElementById('__cur'); if (c) c.style.display = 'none'; }); };
const until = async (sec) => { const ms = t0 + sec * 1000 - Date.now(); if (ms > 0) await sleep(ms); };

// 컷 1 — 제목 (0:00–0:12)
await page.setContent(TITLE);
await cut(1, '생성형 AI 기반 가상환자 문진과 근거보고서형 디브리핑을 결합한 임상추론 교육 시뮬레이터, Clinical Checkpoint입니다.');
await park();
await until(12);

// 컷 2 — 학습 흐름 (0:12–0:27)
await page.setContent(FLOW);
await cut(2, '학습자는 증례를 받아 문진하고, 진찰과 영상을 관찰한 뒤, 판단 근거를 보고서로 제출합니다. 마지막으로 전문가 기준과 비교해 디브리핑을 받습니다.');
await park();
for (let i = 0; i < 5; i++) {
  await page.evaluate((k) => { document.querySelectorAll('.hl').forEach((h, j) => { h.style.opacity = j === k ? 1 : 0; }); }, i);
  await sleep(2600);
}
await until(27);

// 컷 3 — 증례 시작 (0:27–0:40)
await page.goto(APP, { waitUntil: 'networkidle' });
await page.locator('.cc-chat .cc-msg.pt').first().waitFor();
await cut(3, '이번 증례는 갑자기 시작된 두통으로 내원한 52세 여성 환자입니다. 이름은 가명이며 가상 환자입니다.');
await mouseTo(page.locator('.cc-patient .name'));
await sleep(1500);
await mouseTo(page.locator('.cc-vitals'));
await sleep(1500);
await mouseTo(page.locator('.cc-chat .cc-msg.pt').first());
await until(40);

// 컷 4 — 자유 입력 문진 (0:40–1:15)
await cut(4, '선택지를 고르는 대신, 학습자가 필요한 질문을 직접 입력합니다. 응답은 검수된 증례 정보 범위 안에서만 만들어집니다.');
const input = page.getByLabel('환자에게 할 질문');
for (const q of ['두통이 언제부터 어떻게 시작됐나요?', '지금까지 겪은 두통 중에 얼마나 심한가요?', '토하거나 목이 뻣뻣한 느낌이 있나요?', '최근에 머리를 다치신 적이 있나요?']) {
  const before = await page.locator('.cc-chat .cc-msg.pt').count();
  await type(input, q, 60);
  await sleep(300);
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('.cc-chat .cc-msg.pt:not(.typing)').length > n, before);
  await sleep(2600);
}
await until(75);

// 컷 5 — 메모 (1:15–1:30)
await cut(5, '대화 중 확인한 위험 신호는 메모로 남깁니다.');
await type(page.locator('.cc-memo textarea'), '갑자기 시작, 평생 최악의 두통, 구토, 목 뻣뻣함, 외상 없음', 70);
await until(90);

// 컷 6 — 진찰·검사 선택 (1:30–1:50)
await cut(6, '확인한 정보를 바탕으로 필요한 신체 진찰과 검사를 학습자가 직접 선택합니다.');
await click(page.locator('.cc-next'));
for (const name of ['의식 수준 평가', '경부 강직 확인', '동공 반사', '사지 근력·감각']) {
  await click(page.getByRole('button', { name, exact: true }));
  await sleep(500);
}
await click(page.locator('.cc-next'));
await click(page.getByRole('button', { name: '비조영 두부 CT', exact: true }));
await type(page.getByPlaceholder('이 검사를 고른 이유').first(), '출혈 여부 먼저 확인', 60);
await click(page.getByRole('button', { name: '혈액검사 (혈구·응고·전해질)', exact: true }));
await until(110);

// 컷 7 — CT 관찰 (1:50–2:10)
await cut(7, '선택한 교육용 영상을 직접 관찰하고 소견을 기록합니다. 지금 보이는 CT는 시스템 시연을 위한 합성 교육용 도식 이미지입니다.');
await click(page.locator('.cc-next'));
await page.locator('.cc-ct canvas').waitFor();
const canvas = page.locator('.cc-ct canvas');
const cb = await canvas.boundingBox();
await page.mouse.move(cb.x + cb.width * 0.3, cb.y + cb.height * 0.35, { steps: 20 }); await sleep(700);
await page.mouse.move(cb.x + cb.width * 0.7, cb.y + cb.height * 0.4, { steps: 20 }); await sleep(700);
await click(page.locator('.cc-pinbtn'));
await page.mouse.move(cb.x + cb.width * 0.5, cb.y + cb.height * 0.542, { steps: 22 }); await sleep(400);
await page.mouse.click(cb.x + cb.width * 0.5, cb.y + cb.height * 0.542); await sleep(600);
await type(page.locator('.cc-memo textarea'), '기저조 주변에 밝은(고음영) 영역이 보임', 60);
await until(130);

// 컷 8 — 근거보고서 (2:10–2:22)
await cut(8, '문진에서 얻은 단서, 검사를 고른 이유, 영상 소견을 하나의 보고서로 모아 제출합니다.');
await click(page.locator('.cc-next'));
await page.locator('#r-judgement').waitFor();
await type(page.locator('#r-judgement'), '갑작스러운 최악의 두통·구토·경부 강직이 있고 외상이 없어 CT로 출혈을 먼저 확인했다.', 35);
await mouseTo(page.locator('.cc-next'));
await until(141.5);

// 컷 9 — 디브리핑 (2:22–2:35)
await page.locator('.cc-next').click();
await page.locator('.cc-sum').waitFor();
await page.evaluate(() => window.scrollTo({ top: 0 }));
await cut(9, '디브리핑은 AI가 정답을 판정하는 것이 아니라, 미리 정한 기준과 비교해 놓친 단서와 근거를 되돌아보는 과정입니다.');
await mouseTo(page.locator('.cc-sum'));
await sleep(3000);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await sleep(700); }
await until(155);

// 컷 10 — 마무리 (2:35–2:45)
await page.setContent(END);
await cut(10, 'AI는 진단 도구가 아니라 상호작용과 학습 근거를 정리하는 도구로만 쓰입니다. 감사합니다.');
await park();
await until(165);

const endWall = Date.now() / 1000;
await sleep(300);
await cdp.send('Page.stopScreencast');
await context.close();
await browser.close();
fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ t0: t0 / 1000, end: endWall, seconds: endWall - t0 / 1000, frames, timeline, errors }, null, 2));
console.log(JSON.stringify({ seconds: Math.round(endWall - t0 / 1000), frames: frames.length, cuts: timeline.map((c) => [c.cut, Math.round(c.t)]), errors }, null, 1));

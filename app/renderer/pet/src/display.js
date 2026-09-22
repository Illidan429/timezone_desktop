// 角色呈现：分层渲染（立绘/视线/眨眼/口型）与视线跟随调度
import { assetUrl } from './manifest.js';
import { MOUTH_THRESHOLD_HALF, MOUTH_THRESHOLD_FULL } from '../../../shared/constants.js';

export class Stage {
  constructor(manifest, images) {
    this.m = manifest;
    this.images = images; // url -> HTMLImageElement
    this.el = {
      pose: document.getElementById('poseImg'),
      gaze: document.getElementById('gazeImg'),
      blink: document.getElementById('blinkImg'),
      mouth: document.getElementById('mouthImg'),
      stack: document.getElementById('charStack'),
      fx: document.getElementById('fxCanvas')
    };
    this.poseId = 'idle';
    this.gazeEnabled = Boolean(manifest.gaze?.srcPattern);
    this.blinkEnabled = Boolean(manifest.blink?.frames?.length);
    this.mouthEnabled = Boolean(manifest.mouth?.frames?.length);
    this.gazeCell = null;      // {c,r}
    this.gazeOffset = [0, 0];  // 微位移目标
    this.blinkLevel = 0;       // 0开 1半 2闭
    this.mouthLevel = 0;       // 0闭 1半 2全
  }

  img(url) { return this.images.get(assetUrl(url)); }

  applyPose(poseId) {
    const pose = (this.m.poses || []).find(p => p.id === poseId) || this.m.poses?.[0];
    if (!pose) return;
    this.poseId = pose.id;
    const img = this.img(pose.src);
    if (img) this.el.pose.src = img.src;
  }

  // 视线：按光标相对角色中心的位置映射到方向网格
  gazeCellFor(cursorScreen) {
    if (!this.gazeEnabled) return null;
    const cols = this.m.gaze.cols, rows = this.m.gaze.rows;
    const rect = this.el.stack.getBoundingClientRect();
    const cx = window.screenX + rect.left + rect.width / 2;
    const cy = window.screenY + rect.top + rect.height / 2;
    const dx = cursorScreen.x - cx, dy = cursorScreen.y - cy;
    const dead = 70, range = 320;
    const midC = (cols - 1) / 2, midR = (rows - 1) / 2;
    if (Math.hypot(dx, dy) < dead) return { c: Math.round(midC), r: Math.round(midR) };
    const c = Math.max(0, Math.min(cols - 1, Math.round((dx / range) * midC + midC)));
    const r = Math.max(0, Math.min(rows - 1, Math.round((dy / range) * midR + midR)));
    return { c, r };
  }

  setGaze(cell) {
    this.gazeCell = cell;
    if (!this.gazeEnabled || !cell) { this.el.gaze.removeAttribute('src'); return; }
    const active = this.gazeAppliesToPose();
    if (!active) { this.el.gaze.removeAttribute('src'); return; }
    const src = this.m.gaze.srcPattern.replace('{c}', cell.c).replace('{r}', cell.r);
    const img = this.img(src);
    if (img) { this.el.gaze.src = img.src; this.el.gaze.style.display = ''; }
    else this.el.gaze.removeAttribute('src');
  }

  gazeAppliesToPose() {
    // 方向帧是按默认姿态录制的；其他姿态不叠加视线帧
    return !this.m.gaze?.pose || this.m.gaze.pose === this.poseId;
  }

  setBlinkLevel(level) {
    this.blinkLevel = level;
    if (!this.blinkEnabled || !level) { this.el.blink.removeAttribute('src'); return; }
    const frame = (this.m.blink.frames || []).find(f => f.level === level);
    const img = frame && this.img(frame.src);
    if (img) this.el.blink.src = img.src;
    else this.el.blink.removeAttribute('src');
  }

  setMouthLevel(level) {
    this.mouthLevel = level;
    if (!this.mouthEnabled || !level) { this.el.mouth.removeAttribute('src'); return; }
    const frame = (this.m.mouth.frames || []).find(f => f.level === level);
    const img = frame && this.img(frame.src);
    if (img) this.el.mouth.src = img.src;
    else this.el.mouth.removeAttribute('src');
  }

  // 每帧刷新：视线帧 + 微位移（平滑趋近目标）
  tick(dt, cursorScreen) {
    if (cursorScreen) {
      const cell = this.gazeCellFor(cursorScreen);
      if (!this.gazeCell || cell.c !== this.gazeCell.c || cell.r !== this.gazeCell.r) {
        this.setGaze(cell);
      }
      // 微位移：整组轻微朝向光标
      const rect = this.el.stack.getBoundingClientRect();
      const cx = window.screenX + rect.left + rect.width / 2;
      const cy = window.screenY + rect.top + rect.height / 2;
      const tx = Math.max(-4, Math.min(4, (cursorScreen.x - cx) * 0.012));
      const ty = Math.max(-3, Math.min(3, (cursorScreen.y - cy) * 0.008));
      this.gazeOffset[0] += (tx - this.gazeOffset[0]) * Math.min(1, dt * 8);
      this.gazeOffset[1] += (ty - this.gazeOffset[1]) * Math.min(1, dt * 8);
      this.el.stack.style.translate = `${this.gazeOffset[0]}px ${this.gazeOffset[1]}px`;
    }
  }

  // 命中检测：光标是否在角色/控件区域内（决定穿透开关）
  hitTest(cursorScreen) {
    const pts = [this.el.stack, document.getElementById('controls'), document.getElementById('subtitle')];
    for (const el of pts) {
      if (!el || el.style.pointerEvents === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const x = cursorScreen.x - window.screenX, y = cursorScreen.y - window.screenY;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
    return false;
  }
}

// ---------- 眨眼调度 ----------
export class BlinkScheduler {
  constructor(stage) {
    this.stage = stage;
    this.timer = null;
    this.running = false;
  }
  start() {
    if (!this.stage.blinkEnabled || this.running) return;
    this.running = true;
    this.schedule();
  }
  schedule() {
    if (!this.running) return;
    // 随机间隔 2.5s–6.5s，避免机械周期感
    this.timer = setTimeout(() => this.play(), 2500 + Math.random() * 4000);
  }
  play() {
    if (!this.running) return;
    const seq = [[1, 80], [2, 110], [1, 80], [0, 0]];
    let i = 0;
    const step = () => {
      if (i >= seq.length) { this.stage.setBlinkLevel(0); this.schedule(); return; }
      const [level, dur] = seq[i++];
      this.stage.setBlinkLevel(level);
      if (dur) setTimeout(step, dur);
      else step();
    };
    step();
  }
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.stage.setBlinkLevel(0);
  }
}

// ---------- 口型：响度 → 档位 ----------
export function mouthLevelFromRms(rms) {
  if (rms >= MOUTH_THRESHOLD_FULL) return 2;
  if (rms >= MOUTH_THRESHOLD_HALF) return 1;
  return 0;
}

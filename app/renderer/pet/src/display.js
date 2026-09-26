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
    this.currentPoseImg = null; // 当前姿态的底图（视线层显示时底图隐藏）
    this.gazeOffset = [0, 0];  // 微位移目标
    this.blinkLevel = 0;       // 0开 1半 2闭
    this.mouthLevel = 0;       // 0闭 1半 2全
    this.bottomOffsets = new Map(); // url -> 画布像素的垂直对齐偏移（底缘归位）
    this._bottomScale = 1;     // 画布像素 → CSS 像素的换算
  }

  img(url) { return this.images.get(assetUrl(url)); }

  // 底缘归位：测每张帧最低不透明行，以默认立绘为基准计算垂直偏移，
  // 消除各帧生成时裙摆下缘的细微垂直偏差（切方向时角色不再上下跳动）
  async normalizeBottoms() {
    const cw = this.m.canvas?.width, ch = this.m.canvas?.height;
    if (!cw || !ch) return;
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const bottomY = (img) => {
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      const a = ctx.getImageData(0, 0, cw, ch).data;
      for (let y = ch - 1; y >= 0; y--) {
        for (let x = 0; x < cw; x++) {
          if (a[(y * cw + x) * 4 + 3] > 16) return y;
        }
      }
      return ch;
    };
    const poseUrl = this.m.poses?.[0]?.src && assetUrl(this.m.poses[0].src);
    const poseImg = poseUrl && this.images.get(poseUrl);
    if (!poseImg) return;
    const baseline = bottomY(poseImg);
    const urls = [...this.images.keys()];
    for (const url of urls) {
      const img = this.images.get(url);
      if (!img) continue;
      this.bottomOffsets.set(url, baseline - bottomY(img));
    }
    this.bottomOffsets.set(poseUrl, 0);
  }

  // 应用某一帧的垂直对齐偏移（覆盖层与所属方向帧同偏移，保持叠合关系）
  _applyBottomAlign(el, url) {
    const off = (this.bottomOffsets.get(url) || 0) * this._bottomScale;
    el.style.translate = `0px ${off}px`;
  }

  _updateBottomScale() {
    const cw = this.m.canvas?.width;
    if (!cw) return;
    this._bottomScale = this.el.stack.getBoundingClientRect().width / cw;
  }

  applyPose(poseId) {
    const pose = (this.m.poses || []).find(p => p.id === poseId) || this.m.poses?.[0];
    if (!pose) return;
    this.poseId = pose.id;
    this.currentPoseImg = this.img(pose.src) || null;
    this.currentPoseUrl = this.currentPoseImg ? assetUrl(pose.src) : null;
    // 重新评估视线层：姿态变化后视线帧可能不再适用（或恢复适用），统一在 setGaze 里同步底图
    this.setGaze(this.gazeCell);
  }

  // 图层赋值统一走 background-image：加载失败只会不绘制，绝不出现占位框
  _setLayer(el, img) {
    el.style.backgroundImage = img ? `url("${img.src}")` : 'none';
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
    let gazeImg = null, gazeUrl = null;
    if (this.gazeEnabled && cell && this.gazeAppliesToPose()) {
      gazeUrl = assetUrl(this.m.gaze.srcPattern.replace('{c}', cell.c).replace('{r}', cell.r));
      gazeImg = this.images.get(gazeUrl) || null;
    }
    this._setLayer(this.el.gaze, gazeImg);
    // 视线帧是完整角色帧且带身体微动：显示视线层时必须隐藏底图，否则两帧轮廓叠影
    this._setLayer(this.el.pose, gazeImg ? null : this.currentPoseImg);
    // 底缘归位：视线帧与其同方向覆盖层共用同一偏移，底图用自身偏移（正前帧即基准）
    this._updateBottomScale();
    this._applyBottomAlign(this.el.gaze, gazeUrl);
    this._applyBottomAlign(this.el.blink, gazeUrl);
    this._applyBottomAlign(this.el.mouth, gazeUrl);
    this._applyBottomAlign(this.el.pose, gazeImg ? null : this.currentPoseUrl);
    // 视线方向变化时，眨眼/口型覆盖层必须立即换到新方向的对应帧，
    // 否则旧方向的闭眼/张嘴会叠在新方向的睁眼画面上（眨眼中移动鼠标的重影）
    if (this.blinkLevel) this.setBlinkLevel(this.blinkLevel);
    if (this.mouthLevel) this.setMouthLevel(this.mouthLevel);
  }

  gazeAppliesToPose() {
    // 方向帧是按默认姿态录制的；其他姿态不叠加视线帧
    return !this.m.gaze?.pose || this.m.gaze.pose === this.poseId;
  }

  setBlinkLevel(level) {
    this.blinkLevel = level;
    if (!this.blinkEnabled || !level) { this._setLayer(this.el.blink, null); return; }
    // 每方向眨眼帧（perGaze）优先：按当前视线格位取对应闭眼帧；缺图回退全局帧
    if (this.m.blink.perGaze && this.gazeCell && this.gazeAppliesToPose()) {
      const p = this.m.blink.patterns || {};
      const pat = p[String(level)];
      if (pat) {
        const src = pat.replace('{c}', this.gazeCell.c).replace('{r}', this.gazeCell.r);
        const img = this.img(src);
        if (img) { this._setLayer(this.el.blink, img); return; }
      }
    }
    const frame = (this.m.blink.frames || []).find(f => f.level === level);
    this._setLayer(this.el.blink, frame && this.img(frame.src));
  }

  setMouthLevel(level) {
    this.mouthLevel = level;
    if (!this.mouthEnabled || !level) { this._setLayer(this.el.mouth, null); return; }
    // 每方向口型帧（perGaze）优先：按当前视线格位取对应口型帧；缺图回退全局帧
    if (this.m.mouth.perGaze && this.gazeCell && this.gazeAppliesToPose()) {
      const pat = (this.m.mouth.patterns || {})[String(level)];
      if (pat) {
        const src = pat.replace('{c}', this.gazeCell.c).replace('{r}', this.gazeCell.r);
        const img = this.img(src);
        if (img) { this._setLayer(this.el.mouth, img); return; }
      }
    }
    const frame = (this.m.mouth.frames || []).find(f => f.level === level);
    this._setLayer(this.el.mouth, frame && this.img(frame.src));
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

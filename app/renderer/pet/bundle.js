(() => {
  // app/renderer/pet/src/manifest.js
  var ASSET_BASE = "app://assets/default/";
  async function loadManifest() {
    const result = { ok: false, manifest: null, missing: [], broken: [] };
    let raw;
    try {
      const res = await fetch(ASSET_BASE + "manifest.json");
      if (!res.ok) throw new Error(`manifest.json \u52A0\u8F7D\u5931\u8D25 (${res.status})`);
      raw = await res.json();
    } catch (e) {
      result.missing.push("manifest.json \u65E0\u6CD5\u52A0\u8F7D\uFF1A" + e.message);
      return result;
    }
    const m = raw;
    if (!Array.isArray(m.poses) || m.poses.length === 0) result.missing.push("poses\uFF08\u7ACB\u7ED8\u5217\u8868\u7F3A\u5931\uFF09");
    if (m.gaze) {
      if (!m.gaze.cols || !m.gaze.rows) result.missing.push("gaze.cols / gaze.rows");
      if (!m.gaze.srcPattern) result.missing.push("gaze.srcPattern");
    }
    if (m.blink && !Array.isArray(m.blink.frames)) result.missing.push("blink.frames");
    if (m.mouth && !Array.isArray(m.mouth.frames)) result.missing.push("mouth.frames");
    result.manifest = m;
    result.ok = result.missing.length === 0;
    return result;
  }
  function assetUrl(src) {
    return ASSET_BASE + src;
  }
  async function preloadImages(urls) {
    return Promise.all(urls.map(async (u) => {
      try {
        const res = await fetch(u);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = objectUrl;
        });
        return { url: u, ok: true, img };
      } catch {
        return { url: u, ok: false };
      }
    }));
  }
  function collectImageUrls(m) {
    const urls = [];
    for (const p of m.poses || []) urls.push(assetUrl(p.src));
    if (m.gaze?.srcPattern) {
      for (let r = 0; r < m.gaze.rows; r++)
        for (let c = 0; c < m.gaze.cols; c++)
          urls.push(assetUrl(m.gaze.srcPattern.replace("{c}", c).replace("{r}", r)));
    }
    for (const f of m.blink?.frames || []) urls.push(assetUrl(f.src));
    for (const f of m.mouth?.frames || []) urls.push(assetUrl(f.src));
    for (const [group, g] of [["blink", m.blink], ["mouth", m.mouth]]) {
      if (g?.perGaze && g.patterns) {
        const cols = m.gaze?.cols || 3, rows = m.gaze?.rows || 3;
        for (const pat of Object.values(g.patterns))
          for (let r = 0; r < rows; r++)
            for (let c = 0; c < cols; c++)
              urls.push(assetUrl(pat.replace("{c}", c).replace("{r}", r)));
      }
    }
    return urls;
  }

  // app/renderer/pet/src/display.js
  var Stage = class {
    constructor(manifest, images) {
      this.m = manifest;
      this.images = images;
      this.el = {
        pose: document.getElementById("poseImg"),
        gaze: document.getElementById("gazeImg"),
        blink: document.getElementById("blinkImg"),
        mouth: document.getElementById("mouthImg"),
        stack: document.getElementById("charStack"),
        fx: document.getElementById("fxCanvas")
      };
      this.poseId = "idle";
      this.gazeEnabled = Boolean(manifest.gaze?.srcPattern);
      this.blinkEnabled = Boolean(manifest.blink?.frames?.length);
      this.mouthEnabled = Boolean(manifest.mouth?.frames?.length);
      this.gazeCell = null;
      this.currentPoseImg = null;
      this.gazeOffset = [0, 0];
      this.blinkLevel = 0;
      this.mouthLevel = 0;
      this.bottomOffsets = /* @__PURE__ */ new Map();
      this._bottomScale = 1;
    }
    img(url) {
      return this.images.get(assetUrl(url));
    }
    // 底缘归位：测每张帧最低不透明行，以默认立绘为基准计算垂直偏移，
    // 消除各帧生成时裙摆下缘的细微垂直偏差（切方向时角色不再上下跳动）
    async normalizeBottoms() {
      const cw = this.m.canvas?.width, ch = this.m.canvas?.height;
      if (!cw || !ch) return;
      const cv = document.createElement("canvas");
      cv.width = cw;
      cv.height = ch;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
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
      const pose = (this.m.poses || []).find((p) => p.id === poseId) || this.m.poses?.[0];
      if (!pose) return;
      this.poseId = pose.id;
      this.currentPoseImg = this.img(pose.src) || null;
      this.currentPoseUrl = this.currentPoseImg ? assetUrl(pose.src) : null;
      this.setGaze(this.gazeCell);
    }
    // 图层赋值统一走 background-image：加载失败只会不绘制，绝不出现占位框
    _setLayer(el, img) {
      el.style.backgroundImage = img ? `url("${img.src}")` : "none";
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
      const c = Math.max(0, Math.min(cols - 1, Math.round(dx / range * midC + midC)));
      const r = Math.max(0, Math.min(rows - 1, Math.round(dy / range * midR + midR)));
      return { c, r };
    }
    setGaze(cell) {
      this.gazeCell = cell;
      let gazeImg = null, gazeUrl = null;
      if (this.gazeEnabled && cell && this.gazeAppliesToPose()) {
        gazeUrl = assetUrl(this.m.gaze.srcPattern.replace("{c}", cell.c).replace("{r}", cell.r));
        gazeImg = this.images.get(gazeUrl) || null;
      }
      this._setLayer(this.el.gaze, gazeImg);
      this._setLayer(this.el.pose, gazeImg ? null : this.currentPoseImg);
      this._updateBottomScale();
      this._applyBottomAlign(this.el.gaze, gazeUrl);
      this._applyBottomAlign(this.el.blink, gazeUrl);
      this._applyBottomAlign(this.el.mouth, gazeUrl);
      this._applyBottomAlign(this.el.pose, gazeImg ? null : this.currentPoseUrl);
      if (this.blinkLevel) this.setBlinkLevel(this.blinkLevel);
      if (this.mouthLevel) this.setMouthLevel(this.mouthLevel);
    }
    gazeAppliesToPose() {
      return !this.m.gaze?.pose || this.m.gaze.pose === this.poseId;
    }
    setBlinkLevel(level) {
      this.blinkLevel = level;
      if (!this.blinkEnabled || !level) {
        this._setLayer(this.el.blink, null);
        return;
      }
      if (this.m.blink.perGaze && this.gazeCell && this.gazeAppliesToPose()) {
        const p = this.m.blink.patterns || {};
        const pat = p[String(level)];
        if (pat) {
          const src = pat.replace("{c}", this.gazeCell.c).replace("{r}", this.gazeCell.r);
          const img = this.img(src);
          if (img) {
            this._setLayer(this.el.blink, img);
            return;
          }
        }
      }
      const frame = (this.m.blink.frames || []).find((f) => f.level === level);
      this._setLayer(this.el.blink, frame && this.img(frame.src));
    }
    setMouthLevel(level) {
      this.mouthLevel = level;
      if (!this.mouthEnabled || !level) {
        this._setLayer(this.el.mouth, null);
        return;
      }
      if (this.m.mouth.perGaze && this.gazeCell && this.gazeAppliesToPose()) {
        const pat = (this.m.mouth.patterns || {})[String(level)];
        if (pat) {
          const src = pat.replace("{c}", this.gazeCell.c).replace("{r}", this.gazeCell.r);
          const img = this.img(src);
          if (img) {
            this._setLayer(this.el.mouth, img);
            return;
          }
        }
      }
      const frame = (this.m.mouth.frames || []).find((f) => f.level === level);
      this._setLayer(this.el.mouth, frame && this.img(frame.src));
    }
    // 每帧刷新：视线帧 + 微位移（平滑趋近目标）
    tick(dt, cursorScreen) {
      if (cursorScreen) {
        const cell = this.gazeCellFor(cursorScreen);
        if (!this.gazeCell || cell.c !== this.gazeCell.c || cell.r !== this.gazeCell.r) {
          this.setGaze(cell);
        }
        const rect = this.el.stack.getBoundingClientRect();
        const cx = window.screenX + rect.left + rect.width / 2;
        const cy = window.screenY + rect.top + rect.height / 2;
        const tx = Math.max(-4, Math.min(4, (cursorScreen.x - cx) * 0.012));
        const ty = Math.max(-3, Math.min(3, (cursorScreen.y - cy) * 8e-3));
        this.gazeOffset[0] += (tx - this.gazeOffset[0]) * Math.min(1, dt * 8);
        this.gazeOffset[1] += (ty - this.gazeOffset[1]) * Math.min(1, dt * 8);
        this.el.stack.style.translate = `${this.gazeOffset[0]}px ${this.gazeOffset[1]}px`;
      }
    }
    // 命中检测：光标是否在角色/控件区域内（决定穿透开关）
    hitTest(cursorScreen) {
      const pts = [this.el.stack, document.getElementById("controls"), document.getElementById("subtitle")];
      for (const el of pts) {
        if (!el || el.style.pointerEvents === "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const x = cursorScreen.x - window.screenX, y = cursorScreen.y - window.screenY;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
      }
      return false;
    }
  };
  var BlinkScheduler = class {
    constructor(stage2) {
      this.stage = stage2;
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
      this.timer = setTimeout(() => this.play(), 2500 + Math.random() * 4e3);
    }
    play() {
      if (!this.running) return;
      const seq = [[1, 80], [2, 110], [1, 80], [0, 0]];
      let i = 0;
      const step = () => {
        if (i >= seq.length) {
          this.stage.setBlinkLevel(0);
          this.schedule();
          return;
        }
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
  };

  // app/renderer/pet/src/ui.js
  var Ui = class {
    constructor(manifest) {
      this.themes = manifest?.themes || {};
      this.nightStars = 0;
      this.el = { fx: document.getElementById("fxCanvas") };
      this._fxLoop = this._fxLoop.bind(this);
      requestAnimationFrame(this._fxLoop);
    }
    setTheme(name) {
      document.body.classList.toggle("night", name === "night");
      const t = this.themes[name];
      this.nightStars = name === "night" ? t?.starCount ?? 60 : 0;
    }
    // 夜间星光粒子
    _fxLoop() {
      const canvas = this.el.fx;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (canvas.width !== canvas.clientWidth * dpr) {
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
      }
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (this.nightStars > 0) {
        if (!this._stars || this._stars.length !== this.nightStars) {
          this._stars = Array.from({ length: this.nightStars }, () => ({
            x: Math.random(),
            y: Math.random() * 0.85,
            r: 0.6 + Math.random() * 1.6,
            ph: Math.random() * Math.PI * 2,
            sp: 5e-4 + Math.random() * 1e-3
          }));
        }
        const t = performance.now();
        for (const s of this._stars) {
          const a = 0.25 + 0.55 * Math.abs(Math.sin(t * s.sp + s.ph));
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.beginPath();
          ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      requestAnimationFrame(this._fxLoop);
    }
  };

  // app/renderer/pet/src/main.js
  window.__PET_STATE__ = { ready: false, errors: [], manifest: null, degrade: [] };
  var state = window.__PET_STATE__;
  var stage;
  var blinker;
  var ui;
  var lastCursor = null;
  var ignoreMouse = true;
  var dragging = null;
  async function boot() {
    try {
      const mres = await loadManifest();
      state.manifest = mres.manifest;
      state.degrade = mres.missing;
      if (!mres.manifest) {
        state.errors.push("\u7D20\u6750\u6E05\u5355\u4E0D\u53EF\u7528\uFF1A" + mres.missing.join("\uFF1B"));
        return;
      }
      const urls = collectImageUrls(mres.manifest);
      const loaded = await preloadImages(urls);
      const images = /* @__PURE__ */ new Map();
      for (const r of loaded) {
        if (r.ok) images.set(r.url, r.img);
        else state.degrade.push("\u56FE\u7247\u52A0\u8F7D\u5931\u8D25\uFF08\u5DF2\u964D\u7EA7\u8DF3\u8FC7\uFF09: " + r.url);
      }
      stage = new Stage(mres.manifest, images);
      await stage.normalizeBottoms();
      stage._updateBottomScale();
      blinker = new BlinkScheduler(stage);
      ui = new Ui(mres.manifest);
      const { prefs } = await window.petAPI.settingsGet();
      applyPrefs(prefs);
      wireCursorAndDrag();
      window.petAPI.onPrefsChanged(applyPrefs);
      blinker.start();
      state.ready = true;
      window.__SMOKE_READY__ = true;
    } catch (e) {
      state.errors.push("\u542F\u52A8\u5931\u8D25\uFF1A" + (e?.stack || e));
      console.error(e);
    }
  }
  function applyPrefs(prefs = {}) {
    if (!stage) return;
    if (prefs.theme) ui.setTheme(prefs.theme);
    if (prefs.pose) stage.applyPose(prefs.pose);
  }
  function wireCursorAndDrag() {
    window.petAPI.onCursor((pt) => {
      lastCursor = pt;
      const hit = stage.hitTest(pt);
      if (hit !== !ignoreMouse || hit && ignoreMouse) {
        const shouldIgnore = !hit && !dragging;
        if (shouldIgnore !== ignoreMouse) {
          ignoreMouse = shouldIgnore;
          window.petAPI.windowSetIgnoreMouse(shouldIgnore);
        }
      }
      if (dragging) {
        const dx = pt.x - dragging.lastX, dy = pt.y - dragging.lastY;
        dragging.lastX = pt.x;
        dragging.lastY = pt.y;
        dragging.moved += Math.abs(dx) + Math.abs(dy);
        if (dx || dy) window.petAPI.windowMoveBy(dx, dy);
      }
      stage.tick(1 / 60, pt);
    });
    stage.el.stack.addEventListener("mousedown", (e) => {
      if (!lastCursor) return;
      dragging = { lastX: lastCursor.x, lastY: lastCursor.y, moved: 0, downAt: Date.now() };
      stage.el.stack.classList.add("dragging");
      const up = () => {
        window.removeEventListener("mouseup", up);
        stage.el.stack.classList.remove("dragging");
        const wasClick = dragging.moved < 6 && Date.now() - dragging.downAt < 500;
        dragging = null;
        if (wasClick) blinker.play();
      };
      window.addEventListener("mouseup", up);
    });
  }
  window.__PET_SMOKE_CHECKS__ = async function() {
    const checks = {};
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const rect = stage.el.stack.getBoundingClientRect();
      const cx = window.screenX + rect.left + rect.width / 2;
      const cy = window.screenY + rect.top + rect.height / 2;
      const c1 = stage.gazeCellFor({ x: cx, y: cy });
      const c2 = stage.gazeCellFor({ x: cx + 500, y: cy });
      checks.gazeCenter = c1 && c1.c === 1 && c1.r === 1;
      checks.gazeRight = c2 && c2.c === 2;
      stage.setGaze(c1);
      blinker.play();
      await sleep(120);
      const blinkMid = stage.blinkLevel > 0;
      await sleep(500);
      checks.blink = blinkMid && stage.blinkLevel === 0;
      checks.hitChar = stage.hitTest({ x: cx, y: cy });
      checks.hitEmpty = stage.hitTest({ x: window.screenX + 4, y: window.screenY + 4 }) === false;
      checks.dbg = `screenX=${window.screenX},screenY=${window.screenY},rect=${JSON.stringify(stage.el.stack.getBoundingClientRect())},outerW=${window.outerWidth}`;
      const poses = stage.m.poses || [];
      const target = poses[poses.length - 1];
      stage.applyPose(target.id);
      checks.poseSwitch = stage.poseId === target.id && (stage.el.pose.style.backgroundImage.includes("blob:") || stage.el.gaze.style.backgroundImage.includes("blob:"));
      stage.applyPose(poses[0].id);
      ui.setTheme("night");
      checks.themeNight = document.body.classList.contains("night");
      ui.setTheme("day");
      checks.themeRestore = !document.body.classList.contains("night");
    } catch (e) {
      checks.fatal = String(e && e.stack || e);
    }
    checks.allOk = Object.entries(checks).every(([k, v]) => k === "fatal" || k === "dbg" || k.endsWith("Dbg") || v === true);
    return checks;
  };
  window.__PET_DEBUG__ = { get stage() {
    return stage;
  }, get ui() {
    return ui;
  } };
  boot();
})();

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

  // app/shared/constants.js
  var CHAT_MODES = {
    PUSH: "push",
    // 按键说话
    HANDSFREE: "handsfree",
    // 免提监听
    TEXT: "text"
    // 文字输入
  };
  var MODE_LABELS = {
    push: "\u6309\u952E\u8BF4\u8BDD",
    handsfree: "\u514D\u63D0\u76D1\u542C",
    text: "\u6587\u5B57\u8F93\u5165"
  };
  var VAD_START_THRESHOLD = 0.03;
  var VAD_SILENCE_MS = 800;

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

  // app/renderer/pet/src/player.js
  var Player = class {
    constructor() {
      this.ctx = null;
      this.gain = null;
      this.analyser = null;
      this.queue = [];
      this.playing = false;
      this.currentSource = null;
      this.onLevel = () => {
      };
      this.onStart = () => {
      };
      this.onEnd = () => {
      };
      this.onOneEnd = () => {
      };
      this._level = 0;
      this._releaseTimer = null;
    }
    ensureCtx() {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.gain = this.ctx.createGain();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.gain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    setVolume(v) {
      if (this.gain) this.gain.gain.value = Math.max(0, Math.min(1, v));
      this._volume = v;
    }
    // 入队任意容器支持的音频格式（mp3/wav）；返回预计队列长度
    enqueue(arrayBuffer) {
      this.ensureCtx();
      this.queue.push(arrayBuffer);
      if (!this.playing) this.playNext();
      return this.queue.length;
    }
    async playNext() {
      const next = this.queue.shift();
      if (next === void 0) {
        this.playing = false;
        this.onEnd();
        return;
      }
      this.playing = true;
      try {
        const buf = await this.ensureCtx().decodeAudioData(next.slice(0));
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.gain);
        src.onended = () => {
          this.currentSource = null;
          this.onOneEnd();
          this.playNext();
        };
        this.currentSource = src;
        this.onStart();
        this.startLevelLoop();
        src.start();
      } catch (e) {
        console.warn("[player] \u97F3\u9891\u89E3\u7801\u5931\u8D25\uFF0C\u8DF3\u8FC7\uFF1A", e);
        this.playNext();
      }
    }
    startLevelLoop() {
      const data = new Float32Array(this.analyser.fftSize);
      const loop = () => {
        if (!this.playing) {
          this.pushLevel(0);
          return;
        }
        this.analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        this.pushLevel(rms);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    // 响度 → 口型档位（释放有 150ms 防抖，避免嘴部抖动）
    pushLevel(rms) {
      let target = 0;
      if (rms >= 0.08) target = 2;
      else if (rms >= 0.02) target = 1;
      if (target < this._level) {
        if (this._releaseTimer) return;
        this._releaseTimer = setTimeout(() => {
          this._releaseTimer = null;
          this._level = target;
          this.onLevel(target);
        }, 150);
        return;
      }
      clearTimeout(this._releaseTimer);
      this._releaseTimer = null;
      if (target !== this._level) {
        this._level = target;
        this.onLevel(target);
      }
    }
    // 停止并清空：立即静默、口型归位
    stopAndClear() {
      this.queue = [];
      if (this.currentSource) {
        try {
          this.currentSource.onended = null;
          this.currentSource.stop();
        } catch {
        }
        this.currentSource = null;
      }
      this.playing = false;
      clearTimeout(this._releaseTimer);
      this._releaseTimer = null;
      this._level = 0;
      this.onLevel(0);
      this.onEnd();
    }
  };

  // app/renderer/pet/src/recorder.js
  var Recorder = class {
    constructor() {
      this.stream = null;
      this.analyser = null;
      this.recorder = null;
      this.chunks = [];
      this.recording = false;
      this.vadRunning = false;
    }
    async ensureStream() {
      if (this.stream) return this.stream;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(this.analyser);
      return this.stream;
    }
    micRms() {
      if (!this.analyser) return 0;
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / data.length);
    }
    async start() {
      await this.ensureStream();
      if (this.recording) return;
      this.chunks = [];
      this.recorder = new MediaRecorder(this.stream);
      this.recorder.ondataavailable = (e) => {
        if (e.data.size) this.chunks.push(e.data);
      };
      this.recorder.start(200);
      this.recording = true;
    }
    // 停止并返回 WAV ArrayBuffer（webm 解码后重编码，规避 ASR 服务兼容性）
    async stop() {
      if (!this.recording) return null;
      const rec = this.recorder;
      this.recording = false;
      const stopped = new Promise((resolve) => {
        rec.onstop = resolve;
      });
      rec.stop();
      await stopped;
      if (!this.chunks.length) return null;
      const blob = new Blob(this.chunks, { type: this.chunks[0].type || "audio/webm" });
      const raw = await blob.arrayBuffer();
      try {
        const ctx = new AudioContext();
        const audio = await ctx.decodeAudioData(raw);
        return encodeWav(audio);
      } catch (e) {
        console.warn("[recorder] \u5F55\u97F3\u89E3\u7801\u5931\u8D25\uFF1A", e);
        return null;
      }
    }
    // 免提监听：能量 VAD 自动分段，每段完成回调 WAV
    startVad(onUtterance) {
      if (this.vadRunning) return;
      this.vadRunning = true;
      const loop = async () => {
        while (this.vadRunning) {
          await this.waitRmsAbove(VAD_START_THRESHOLD, 50);
          if (!this.vadRunning) break;
          await this.start();
          let silent = 0;
          while (this.vadRunning && silent < VAD_SILENCE_MS) {
            await sleep(60);
            silent = this.micRms() < VAD_START_THRESHOLD * 0.8 ? silent + 60 : 0;
          }
          const wav = await this.stop();
          if (this.vadRunning && wav) onUtterance(wav);
        }
      };
      loop();
    }
    waitRmsAbove(threshold, interval) {
      return new Promise((resolve) => {
        const check = () => {
          if (!this.vadRunning) return resolve();
          if (this.micRms() >= threshold) return resolve();
          setTimeout(check, interval);
        };
        check();
      });
    }
    stopVad() {
      this.vadRunning = false;
      if (this.recording) this.stop();
    }
    release() {
      this.stopVad();
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      this.analyser = null;
    }
  };
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function encodeWav(audioBuffer) {
    const numCh = Math.min(1, audioBuffer.numberOfChannels);
    const rate = audioBuffer.sampleRate;
    const len = audioBuffer.length;
    const data = new DataView(new ArrayBuffer(len * 2));
    const ch = audioBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      data.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    const header = new ArrayBuffer(44);
    const h = new DataView(header);
    const str = (off, s) => {
      for (let i = 0; i < s.length; i++) h.setUint8(off + i, s.charCodeAt(i));
    };
    str(0, "RIFF");
    h.setUint32(4, 36 + len * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    h.setUint32(16, 16, true);
    h.setUint16(20, 1, true);
    h.setUint16(22, numCh, true);
    h.setUint32(24, rate, true);
    h.setUint32(28, rate * 2, true);
    h.setUint16(32, 2, true);
    h.setUint16(34, 16, true);
    str(36, "data");
    h.setUint32(40, len * 2, true);
    const out = new Uint8Array(44 + len * 2);
    out.set(new Uint8Array(header), 0);
    out.set(new Uint8Array(data.buffer), 44);
    return out.buffer;
  }

  // app/renderer/pet/src/pipeline.js
  var ChatPipeline = class {
    constructor({ player: player2, recorder: recorder2, ui: ui2 }) {
      this.player = player2;
      this.recorder = recorder2;
      this.ui = ui2;
      this.mode = CHAT_MODES.PUSH;
      this.state = "idle";
      this.hasAsr = false;
      this._gen = 0;
    }
    setMode(mode) {
      this.mode = mode;
      if (mode === CHAT_MODES.HANDSFREE) {
        this.recorder.startVad((wav) => this.onUtterance(wav));
      } else {
        this.recorder.stopVad();
      }
      this.ui.setMode(MODE_LABELS[mode], mode === CHAT_MODES.TEXT);
      window.petAPI.prefsSet({ mode });
    }
    async onTalkPress() {
      if (this.mode !== CHAT_MODES.PUSH || this.state === "recognizing") return;
      this.ui.talkRecording(true);
      await this.recorder.start();
    }
    async onTalkRelease() {
      if (this.mode !== CHAT_MODES.PUSH || !this.recorder.recording) return;
      this.ui.talkRecording(false);
      const wav = await this.recorder.stop();
      if (wav) this.onUtterance(wav);
    }
    async onUtterance(wav) {
      if (!this.hasAsr) {
        this.ui.status("\u672A\u914D\u7F6E\u8BED\u97F3\u8BC6\u522B\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E");
        return;
      }
      this.setState("recognizing");
      this.ui.status("\u8BC6\u522B\u4E2D\u2026");
      try {
        const { text } = await window.petAPI.chatAsr(wav);
        if (!text) {
          this.ui.status("\uFF08\u6CA1\u6709\u542C\u6E05\uFF0C\u8BF7\u518D\u8BF4\u4E00\u6B21\uFF09");
          this.setState("idle");
          return;
        }
        await this.send(text, "\u8BED\u97F3");
      } catch (e) {
        this.ui.status("\u8BC6\u522B\u5931\u8D25\uFF1A" + e.message);
        this.setState("idle");
      }
    }
    // 文本入口：新输入自动打断当前播放（规格：打断）
    async send(text, sourceLabel = "\u8F93\u5165") {
      this._interruptIfSpeaking();
      const gen = ++this._gen;
      this.ui.showUser(`${sourceLabel}\uFF1A${text}`);
      this.setState("thinking");
      this.ui.startThinking();
      let reply;
      try {
        ({ text: reply } = await window.petAPI.chatLlm(text));
      } catch (e) {
        this.ui.status("\u56DE\u590D\u5931\u8D25\uFF1A" + e.message);
        this.setState("idle");
        return;
      }
      if (gen !== this._gen) return;
      this.ui.stopThinking();
      this.ui.typeReply(reply);
      this.setState("speaking");
      this.ui.status("");
      try {
        const { audio } = await window.petAPI.chatTts(reply);
        if (gen !== this._gen) return;
        this.player.enqueue(audio);
      } catch (e) {
        this.ui.status("\u8BED\u97F3\u5408\u6210\u5931\u8D25\uFF1A" + e.message);
        this.setState("idle");
      }
    }
    // 点击角色或新输入时打断：停止播放、清队列、终止外部请求与界面动画
    interrupt() {
      const wasSpeaking = this.state === "speaking";
      this._gen++;
      this.ui.stopThinking();
      this.ui.stopTypewriter();
      this.player.stopAndClear();
      window.petAPI.chatCancel();
      this.setState("idle");
      if (wasSpeaking) this.ui.status("\uFF08\u5DF2\u6253\u65AD\uFF09");
    }
    _interruptIfSpeaking() {
      if (this.state === "speaking" || this.state === "thinking") {
        this._gen++;
        this.ui.stopThinking();
        this.ui.stopTypewriter();
        this.player.stopAndClear();
        window.petAPI.chatCancel();
      }
    }
    clearHistory() {
      window.petAPI.chatClear();
      this.ui.clearSubtitle();
      this.ui.status("\uFF08\u5BF9\u8BDD\u5DF2\u6E05\u7A7A\uFF09");
    }
    setState(s) {
      this.state = s;
      this.ui.setState(s);
    }
  };

  // app/renderer/pet/src/ui.js
  var THINKING_DOT_INTERVAL_MS = 400;
  var TYPE_INTERVAL_MS = 20;
  var REPLY_RETENTION_MS = 3e4;
  var REPLY_FADE_MS = 800;
  var Ui = class {
    constructor(manifest) {
      this.el = {
        subtitle: document.getElementById("subtitle"),
        user: document.getElementById("subtitleUser"),
        reply: document.getElementById("subtitleReply"),
        status: document.getElementById("subtitleStatus"),
        close: document.getElementById("subtitleClose"),
        controls: document.getElementById("controls"),
        modeBtn: document.getElementById("modeBtn"),
        talkBtn: document.getElementById("talkBtn"),
        input: document.getElementById("textInput"),
        send: document.getElementById("sendBtn"),
        settings: document.getElementById("settingsBtn"),
        fx: document.getElementById("fxCanvas")
      };
      this.themes = manifest?.themes || {};
      this.controlsVisible = true;
      this.el.hideBar = document.getElementById("hideBar");
      this.nightStars = 0;
      this._fadeTimer = null;
      this._thinkingTimer = null;
      this._thinkingDots = 0;
      this._typeTimer = null;
      this._typeUnits = [];
      this._typeIndex = 0;
      this._retentionTimer = null;
      this.el.close.addEventListener("click", () => this.clearSubtitle());
      this._fxLoop = this._fxLoop.bind(this);
      requestAnimationFrame(this._fxLoop);
    }
    setTheme(name) {
      document.body.classList.toggle("night", name === "night");
      const t = this.themes[name];
      this.nightStars = name === "night" ? t?.starCount ?? 60 : 0;
    }
    showUser(text) {
      this.el.subtitle.style.display = "block";
      this.el.user.textContent = text;
    }
    showReply(text) {
      this.el.subtitle.style.display = "block";
      this.el.reply.textContent = text;
    }
    status(text) {
      this.el.status.textContent = text || "";
      if (text) this.el.subtitle.style.display = "block";
    }
    // 思考动画：状态行点点跳动（参照参考项目 startMidoriReplyThinking）
    startThinking(prefix = "\u601D\u8003\u4E2D") {
      this.stopThinking();
      this._thinkingDots = 0;
      const tick = () => {
        this.status(`${prefix}${".".repeat(this._thinkingDots + 1)}`);
        this._thinkingDots = (this._thinkingDots + 1) % 3;
        this._thinkingTimer = setTimeout(tick, THINKING_DOT_INTERVAL_MS);
      };
      tick();
    }
    stopThinking() {
      if (this._thinkingTimer) clearTimeout(this._thinkingTimer);
      this._thinkingTimer = null;
    }
    // 打字机：逐字符渲染回复，完成后定时淡出（参照 typeNextMidoriReplyGrapheme + scheduleMidoriReplyExpiry）
    typeReply(text, onDone) {
      this.stopTypewriter();
      this.el.subtitle.classList.remove("is-fading");
      this.showReply("");
      this._typeUnits = Array.from(text || "");
      this._typeIndex = 0;
      const step = () => {
        this._typeTimer = null;
        if (this._typeIndex >= this._typeUnits.length) {
          this._scheduleExpiry();
          if (onDone) onDone();
          return;
        }
        this.el.reply.textContent += this._typeUnits[this._typeIndex++];
        this._typeTimer = setTimeout(step, TYPE_INTERVAL_MS);
      };
      step();
    }
    stopTypewriter() {
      if (this._typeTimer) clearTimeout(this._typeTimer);
      this._typeTimer = null;
      if (this._retentionTimer) clearTimeout(this._retentionTimer);
      this._retentionTimer = null;
      this.el.subtitle.classList.remove("is-fading");
    }
    _scheduleExpiry() {
      if (this._retentionTimer) clearTimeout(this._retentionTimer);
      this._retentionTimer = setTimeout(() => {
        this._retentionTimer = null;
        this.el.subtitle.classList.add("is-fading");
        this._fadeTimer = setTimeout(() => this.clearSubtitle(), REPLY_FADE_MS);
      }, REPLY_RETENTION_MS);
    }
    clearSubtitle() {
      this.stopThinking();
      this.stopTypewriter();
      this.el.user.textContent = "";
      this.el.reply.textContent = "";
      this.el.status.textContent = "";
      this.el.subtitle.style.display = "none";
    }
    setMode(label, textMode) {
      this.el.modeBtn.textContent = label;
      const voiceMode = !textMode;
      this.el.talkBtn.style.display = voiceMode ? "" : "none";
      this.el.input.placeholder = textMode ? "\u6253\u5B57\u804A\u5929\u2026" : "\uFF08\u4E5F\u53EF\u76F4\u63A5\u6253\u5B57\uFF09";
    }
    talkRecording(on) {
      this.el.talkBtn.classList.toggle("recording", on);
      this.el.talkBtn.textContent = on ? "\u{1F534} \u677E\u5F00\u7ED3\u675F" : "\u{1F3A4} \u6309\u4F4F\u8BF4\u8BDD";
    }
    setState(state2) {
      this.el.send.disabled = state2 === "thinking";
      this.el.talkBtn.disabled = state2 === "recognizing";
    }
    // 操作栏整体开关（用户偏好）：隐藏时 display:none，不占命中区域
    setControlsVisible(v) {
      this.controlsVisible = v;
      this.el.controls.style.display = v ? "flex" : "none";
      if (v) this.el.controls.classList.remove("hidden");
    }
    // 控制条自动显隐：光标在窗口内常显，离开 5 秒后淡出
    updateControlsVisibility(cursorScreen) {
      if (this.controlsVisible === false) return;
      const inside = cursorScreen && cursorScreen.x >= window.screenX && cursorScreen.x <= window.screenX + window.outerWidth && cursorScreen.y >= window.screenY && cursorScreen.y <= window.screenY + window.outerHeight;
      clearTimeout(this._fadeTimer);
      if (inside) {
        this.el.controls.classList.remove("hidden");
      } else {
        this._fadeTimer = setTimeout(() => this.el.controls.classList.add("hidden"), 5e3);
      }
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
  var player;
  var recorder;
  var pipeline;
  var ui;
  var lastCursor = null;
  var ignoreMouse = true;
  var passthrough = false;
  var hoverOpacityOn = false;
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
      player = new Player();
      recorder = new Recorder();
      ui = new Ui(mres.manifest);
      pipeline = new ChatPipeline({ player, recorder, ui });
      player.onLevel = (lvl) => stage.setMouthLevel(lvl);
      player.onEnd = () => {
        if (pipeline.state === "speaking") pipeline.setState("idle");
      };
      const { prefs, apis } = await window.petAPI.settingsGet();
      applyPrefs(prefs);
      pipeline.hasAsr = Boolean(apis?.asr?.baseUrl && apis?.asr?.hasKey);
      wireControls();
      wireCursorAndDrag();
      window.petAPI.onPrefsChanged(applyPrefs);
      window.petAPI.onSettingsChanged((view) => {
        pipeline.hasAsr = Boolean(view?.apis?.asr?.baseUrl && view?.apis?.asr?.hasKey);
      });
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
    if (typeof prefs.volume === "number") player.setVolume(prefs.volume);
    if (prefs.controlsVisible !== void 0) ui.setControlsVisible(!!prefs.controlsVisible);
    if (prefs.passthrough !== void 0) {
      passthrough = !!prefs.passthrough;
      hoverOpacityOn = false;
      if (passthrough) {
        dragging = null;
        window.petAPI.windowSetIgnoreMouse(true);
      } else {
        window.petAPI.windowSetOpacity(1);
      }
    }
    if (prefs.mode && pipeline && prefs.mode !== pipeline.mode) {
      pipeline.mode = prefs.mode;
      pipeline.setMode(prefs.mode);
    }
    if (prefs.topmost !== void 0) {
    }
  }
  function wireControls() {
    const { modeBtn, talkBtn, input, send, settings } = ui.el;
    modeBtn.addEventListener("click", () => {
      const order = [CHAT_MODES.PUSH, CHAT_MODES.HANDSFREE, CHAT_MODES.TEXT];
      const next = order[(order.indexOf(pipeline.mode) + 1) % order.length];
      pipeline.setMode(next);
    });
    talkBtn.addEventListener("mousedown", () => pipeline.onTalkPress());
    window.addEventListener("mouseup", () => pipeline.onTalkRelease());
    const submit = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      pipeline.send(text, "\u6587\u5B57");
    };
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") submit();
    });
    settings.addEventListener("click", () => window.petAPI.windowOpenSettings());
    ui.el.hideBar.addEventListener("click", () => window.petAPI.prefsSet({ controlsVisible: false }));
    ui.setMode(
      /** @type {any} */
      pipeline.mode && modeBtn.textContent,
      pipeline.mode === CHAT_MODES.TEXT
    );
  }
  function wireCursorAndDrag() {
    window.petAPI.onCursor((pt) => {
      lastCursor = pt;
      if (passthrough) {
        const hover = stage.hitTest(pt);
        if (hover !== hoverOpacityOn) {
          hoverOpacityOn = hover;
          window.petAPI.windowSetOpacity(hover ? 0.4 : 1);
        }
        stage.tick(1 / 60, pt);
        ui.updateControlsVisibility(pt);
        return;
      }
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
      ui.updateControlsVisibility(pt);
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
        if (wasClick && pipeline.state === "speaking") pipeline.interrupt();
        else if (wasClick) blinker.play();
      };
      window.addEventListener("mouseup", up);
    });
  }
  window.__PET_SMOKE_CHECKS__ = async function() {
    const checks = {};
    const sleep2 = (ms) => new Promise((r) => setTimeout(r, ms));
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
      await sleep2(120);
      const blinkMid = stage.blinkLevel > 0;
      await sleep2(500);
      checks.blink = blinkMid && stage.blinkLevel === 0;
      player.pushLevel(0.09);
      checks.mouthHigh = stage.mouthLevel === 2;
      player.pushLevel(0);
      await sleep2(250);
      checks.mouthRelease = stage.mouthLevel === 0;
      player.ensureCtx();
      player.setVolume(0);
      let started = false;
      player.onStart = () => {
        started = true;
      };
      const wav = await (await fetch("app://assets/default/audio/test.wav")).arrayBuffer();
      player.enqueue(wav);
      player.enqueue(wav);
      player.enqueue(wav);
      await sleep2(600);
      checks.audioPlays = started && player.playing;
      await sleep2(1800);
      checks.audioSequential = player.playing;
      player.stopAndClear();
      checks.audioStops = !player.playing;
      player.setVolume(0.9);
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
      const pushMode = pipeline.mode;
      pipeline.setMode("text");
      checks.modeText = ui.el.talkBtn.style.display === "none";
      pipeline.setMode(pushMode === "text" ? "push" : pushMode);
      await pipeline.clearHistory();
      checks.chatClear = true;
      pipeline.state = "speaking";
      pipeline.interrupt();
      checks.interrupt = pipeline.state === "idle";
    } catch (e) {
      checks.fatal = String(e && e.stack || e);
    }
    checks.allOk = Object.entries(checks).every(([k, v]) => k === "fatal" || k === "dbg" || k.endsWith("Dbg") || v === true);
    return checks;
  };
  window.__PET_DEBUG__ = { get stage() {
    return stage;
  }, get player() {
    return player;
  }, get recorder() {
    return recorder;
  }, get pipeline() {
    return pipeline;
  }, get ui() {
    return ui;
  } };
  boot();
})();

// 音频播放：队列依序播放、音量、AnalyserNode 响度输出
export class Player {
  constructor() {
    this.ctx = null;
    this.gain = null;
    this.analyser = null;
    this.queue = [];
    this.playing = false;
    this.currentSource = null;
    this.onLevel = () => {};
    this.onStart = () => {};
    this.onEnd = () => {};   // 队列全部播完
    this.onOneEnd = () => {}; // 单条播完
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
    if (this.ctx.state === 'suspended') this.ctx.resume();
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
    if (next === undefined) {
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
      // 单条解码失败：跳过继续队列
      console.warn('[player] 音频解码失败，跳过：', e);
      this.playNext();
    }
  }

  startLevelLoop() {
    const data = new Float32Array(this.analyser.fftSize);
    const loop = () => {
      if (!this.playing) { this.pushLevel(0); return; }
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
      try { this.currentSource.onended = null; this.currentSource.stop(); } catch { /* 已停止 */ }
      this.currentSource = null;
    }
    this.playing = false;
    clearTimeout(this._releaseTimer);
    this._releaseTimer = null;
    this._level = 0;
    this.onLevel(0);
    this.onEnd();
  }
}

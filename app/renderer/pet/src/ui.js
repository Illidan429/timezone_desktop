// 界面辅助：字幕（思考动画/打字机/自动淡出）、控制条显隐、夜间星光
// 聊天交互逻辑参照 reference/midori-companion-avatar-main 的 app.js 实现

const THINKING_DOT_INTERVAL_MS = 400;   // 思考点跳动间隔
const TYPE_INTERVAL_MS = 20;            // 打字机逐字间隔
const REPLY_RETENTION_MS = 30_000;      // 回复完成后保留时长
const REPLY_FADE_MS = 800;              // 淡出时长

export class Ui {
  constructor(manifest) {
    this.el = {
      subtitle: document.getElementById('subtitle'),
      user: document.getElementById('subtitleUser'),
      reply: document.getElementById('subtitleReply'),
      status: document.getElementById('subtitleStatus'),
      close: document.getElementById('subtitleClose'),
      controls: document.getElementById('controls'),
      modeBtn: document.getElementById('modeBtn'),
      talkBtn: document.getElementById('talkBtn'),
      input: document.getElementById('textInput'),
      send: document.getElementById('sendBtn'),
      settings: document.getElementById('settingsBtn'),
      fx: document.getElementById('fxCanvas')
    };
    this.themes = manifest?.themes || {};
    this.controlsVisible = true;
    this.el.hideBar = document.getElementById('hideBar');
    this.nightStars = 0;
    this._fadeTimer = null;
    this._thinkingTimer = null;
    this._thinkingDots = 0;
    this._typeTimer = null;
    this._typeUnits = [];
    this._typeIndex = 0;
    this._retentionTimer = null;
    this.el.close.addEventListener('click', () => this.clearSubtitle());
    this._fxLoop = this._fxLoop.bind(this);
    requestAnimationFrame(this._fxLoop);
  }

  setTheme(name) {
    document.body.classList.toggle('night', name === 'night');
    const t = this.themes[name];
    this.nightStars = name === 'night' ? (t?.starCount ?? 60) : 0;
  }

  showUser(text) {
    this.el.subtitle.style.display = 'block';
    this.el.user.textContent = text;
  }

  showReply(text) {
    this.el.subtitle.style.display = 'block';
    this.el.reply.textContent = text;
  }

  status(text) {
    this.el.status.textContent = text || '';
    if (text) this.el.subtitle.style.display = 'block';
  }

  // 思考动画：状态行点点跳动（参照参考项目 startMidoriReplyThinking）
  startThinking(prefix = '思考中') {
    this.stopThinking();
    this._thinkingDots = 0;
    const tick = () => {
      this.status(`${prefix}${'.'.repeat(this._thinkingDots + 1)}`);
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
    this.el.subtitle.classList.remove('is-fading');
    this.showReply('');
    this._typeUnits = Array.from(text || '');
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
    this.el.subtitle.classList.remove('is-fading');
  }

  _scheduleExpiry() {
    if (this._retentionTimer) clearTimeout(this._retentionTimer);
    this._retentionTimer = setTimeout(() => {
      this._retentionTimer = null;
      this.el.subtitle.classList.add('is-fading');
      this._fadeTimer = setTimeout(() => this.clearSubtitle(), REPLY_FADE_MS);
    }, REPLY_RETENTION_MS);
  }

  clearSubtitle() {
    this.stopThinking();
    this.stopTypewriter();
    this.el.user.textContent = '';
    this.el.reply.textContent = '';
    this.el.status.textContent = '';
    this.el.subtitle.style.display = 'none';
  }

  setMode(label, textMode) {
    this.el.modeBtn.textContent = label;
    const voiceMode = !textMode;
    this.el.talkBtn.style.display = voiceMode ? '' : 'none';
    this.el.input.placeholder = textMode ? '打字聊天…' : '（也可直接打字）';
  }

  talkRecording(on) {
    this.el.talkBtn.classList.toggle('recording', on);
    this.el.talkBtn.textContent = on ? '🔴 松开结束' : '🎤 按住说话';
  }

  setState(state) {
    this.el.send.disabled = state === 'thinking';
    this.el.talkBtn.disabled = state === 'recognizing';
  }

  // 操作栏整体开关（用户偏好）：隐藏时 display:none，不占命中区域
  setControlsVisible(v) {
    this.controlsVisible = v;
    this.el.controls.style.display = v ? 'flex' : 'none';
    if (v) this.el.controls.classList.remove('hidden');
  }

  // 控制条自动显隐：光标在窗口内常显，离开 5 秒后淡出
  updateControlsVisibility(cursorScreen) {
    if (this.controlsVisible === false) return;
    const inside = cursorScreen
      && cursorScreen.x >= window.screenX && cursorScreen.x <= window.screenX + window.outerWidth
      && cursorScreen.y >= window.screenY && cursorScreen.y <= window.screenY + window.outerHeight;
    clearTimeout(this._fadeTimer);
    if (inside) {
      this.el.controls.classList.remove('hidden');
    } else {
      this._fadeTimer = setTimeout(() => this.el.controls.classList.add('hidden'), 5000);
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
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (this.nightStars > 0) {
      if (!this._stars || this._stars.length !== this.nightStars) {
        this._stars = Array.from({ length: this.nightStars }, () => ({
          x: Math.random(), y: Math.random() * 0.85,
          r: 0.6 + Math.random() * 1.6, ph: Math.random() * Math.PI * 2,
          sp: 0.0005 + Math.random() * 0.001
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
}

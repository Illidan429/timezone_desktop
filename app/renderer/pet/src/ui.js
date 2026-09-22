// 界面辅助：字幕、控制条显隐、夜间星光
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
    this.nightStars = 0;
    this._fadeTimer = null;
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

  clearSubtitle() {
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

  // 控制条自动显隐：光标在窗口内常显，离开 5 秒后淡出
  updateControlsVisibility(cursorScreen) {
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

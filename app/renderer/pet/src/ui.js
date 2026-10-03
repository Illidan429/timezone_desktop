// 界面辅助：主题切换与夜间星光（语音聊天 UI 已暂停移除，本模块仅保留形象相关呈现）
export class Ui {
  constructor(manifest) {
    this.themes = manifest?.themes || {};
    this.nightStars = 0;
    this.el = { fx: document.getElementById('fxCanvas') };
    this._fxLoop = this._fxLoop.bind(this);
    requestAnimationFrame(this._fxLoop);
  }

  setTheme(name) {
    document.body.classList.toggle('night', name === 'night');
    const t = this.themes[name];
    this.nightStars = name === 'night' ? (t?.starCount ?? 60) : 0;
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

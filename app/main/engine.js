// GPT-SoVITS 本地语音引擎：引擎包下载安装 + api_v2 子进程监督
// 状态机：absent → downloading → installed → starting → ready → error
// 引擎包契约见 docs/voice-engine-spec.md（ZIP + engine.json，桌宠不硬编码引擎内部布局）
import { app } from 'electron';
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import yauzl from 'yauzl';

const PING_INTERVAL_MS = 500;
const PING_TIMEOUT_MS = 90_000;      // 覆盖引擎首次加载模型的 10~60 秒
const RESTART_LIMIT = 3;
const TTS_TIMEOUT_MS = 120_000;      // 纯 CPU 推理 5~15 秒/句，留足余量
const DEFAULT_PORT = 9880;

function isPortFree(port) {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

// 短超时 GET，仅用于探活判断（引擎未就绪时连接会被拒绝）
function httpReachable(url, timeoutMs = 1500) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: timeoutMs }, r => { r.resume(); resolve(r.statusCode === 200); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// GET 并返回 ArrayBuffer（引擎 /tts 合成用），强超时避免 CPU 推理慢时无限挂起
// 返回精确大小的 ArrayBuffer（而非 Buffer）：Buffer 经 IPC 到渲染端会变成 Uint8Array，
// 而 AudioContext.decodeAudioData 只接受 ArrayBuffer
function httpGetBuffer(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, r => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error(`引擎返回 HTTP ${r.statusCode}`)); }
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => {
        const b = Buffer.concat(chunks);
        resolve(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      });
      r.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error(`引擎响应超时（${Math.round(timeoutMs / 1000)}秒）`)); });
    req.on('error', reject);
  });
}

export class EngineManager {
  constructor({ rootDir, onUpdate } = {}) {
    this.rootDir = rootDir || path.join(app.getPath('userData'), 'voice-engine');
    this.onUpdate = onUpdate || (() => {});
    this.state = 'absent';        // absent | downloading | installed | starting | ready | error
    this.detail = '';
    this.progress = null;         // { received, total } 下载进度（字节）
    this.version = '';
    this.port = 0;
    this.contract = null;         // 解析后的 engine.json
    this.child = null;
    this.restartCount = 0;
    this._stopping = false;
    this._startPromise = null;
  }

  _setState(state, detail = '') {
    this.state = state;
    this.detail = detail;
    this.onUpdate(this.status());
  }

  status() {
    return {
      state: this.state,
      detail: this.detail,
      progress: this.progress,
      version: this.version,
      port: this.port
    };
  }

  // 引擎是否已安装（目录存在且 engine.json 可解析）
  async checkInstalled() {
    try {
      const c = await this._readContract();
      this.version = c.version || '';
      this._setState('installed');
      return true;
    } catch {
      this._setState('absent');
      return false;
    }
  }

  async _readContract() {
    const raw = await fsp.readFile(path.join(this.rootDir, 'engine.json'), 'utf8');
    const c = JSON.parse(raw);
    for (const k of ['version', 'runtime', 'api', 'pingPath', 'ttsPath']) {
      if (!c[k]) throw new Error(`engine.json 缺少字段 ${k}`);
    }
    if (c.runtime === 'python' && !c.python) throw new Error('engine.json 缺少字段 python');
    return c;
  }

  // ---------- 下载安装 ----------

  async download(url) {
    if (this.state === 'downloading') throw new Error('引擎包正在下载中');
    url = String(url || '').trim();
    if (!url) throw new Error('请先在设置中填写引擎包下载地址');
    await fsp.mkdir(this.rootDir + '.tmp', { recursive: true });
    this.progress = { received: 0, total: 0 };
    this._setState('downloading', '连接下载源…');
    const zipPath = this.rootDir + '.download.zip';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`下载源返回 HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      this.progress.total = total;
      let received = 0;
      let lastEmit = 0;
      const file = fs.createWriteStream(zipPath);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        this.progress.received = received;
        if (total && received - lastEmit > 512 * 1024) {
          lastEmit = received;
          this._setState('downloading', '下载中');
        }
        file.write(Buffer.from(value));
      }
      file.end();
      await new Promise((res, rej) => { file.on('finish', res); file.on('error', rej); });
      // 完整性：Content-Length 比对 + 可选 .sha256 sidecar
      if (total && received !== total) throw new Error(`下载不完整（${received}/${total} 字节），可重新下载`);
      await this._verifySha256(url, zipPath);
      this._setState('downloading', '解压安装中…');
      await this._unzipTo(zipPath);
      const c = await this._readContract();
      this.version = c.version || '';
      this.restartCount = 0;
      this.progress = null;
      this._setState('installed');
      return true;
    } catch (e) {
      this.progress = null;
      this._setState('error', `引擎包下载失败：${e.message}`);
      await fsp.rm(zipPath, { force: true }).catch(() => {});
      throw e;
    }
  }

  async _verifySha256(url, zipPath) {
    let expected = '';
    try {
      const r = await fetch(url + '.sha256');
      if (r.ok) {
        // 常见格式：<hex>  <文件名>，取第一段
        expected = (await r.text()).trim().split(/\s+/)[0].toLowerCase();
      }
    } catch { /* 无 sidecar 则跳过 */ }
    if (!/^[0-9a-f]{64}$/.test(expected)) return;
    const digest = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
    if (digest !== expected) throw new Error('SHA-256 校验不一致，下载文件已损坏，请重新下载');
  }

  async _unzipTo(zipPath) {
    const tmp = this.rootDir + '.tmp';
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.mkdir(tmp, { recursive: true });
    await new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
        if (err) return reject(new Error('引擎包不是有效的 ZIP 文件'));
        zipfile.readEntry();
        zipfile.on('entry', entry => {
          const target = path.join(tmp, entry.fileName);
          // zip-slip 防护：解压目标必须仍在临时目录内
          if (!path.resolve(target).startsWith(path.resolve(tmp))) { zipfile.readEntry(); return; }
          if (/\/$/.test(entry.fileName)) {
            fsp.mkdir(target, { recursive: true }).then(() => zipfile.readEntry(), reject);
            return;
          }
          fsp.mkdir(path.dirname(target), { recursive: true }).then(() => {
            zipfile.openReadStream(entry, (err2, rs) => {
              if (err2) return reject(err2);
              const ws = fs.createWriteStream(target);
              rs.pipe(ws);
              ws.on('finish', () => zipfile.readEntry());
              ws.on('error', reject);
            });
          }, reject);
        });
        zipfile.on('end', resolve);
        zipfile.on('error', reject);
      });
    });
    // 归位：engine.json 可能在解压根或唯一顶层目录内
    let engineRoot = tmp;
    if (!fs.existsSync(path.join(tmp, 'engine.json'))) {
      const tops = (await fsp.readdir(tmp, { withFileTypes: true })).filter(d => d.isDirectory());
      if (tops.length === 1 && fs.existsSync(path.join(tmp, tops[0].name, 'engine.json'))) {
        engineRoot = path.join(tmp, tops[0].name);
      } else {
        throw new Error('引擎包内未找到 engine.json（请核对包制作规范）');
      }
    }
    await this.stop().catch(() => {});
    await fsp.rm(this.rootDir, { recursive: true, force: true });
    await fsp.rename(engineRoot, this.rootDir);
    if (engineRoot === tmp) await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    else await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(zipPath, { force: true }).catch(() => {});
  }

  // ---------- 子进程监督 ----------

  // 懒启动：就绪则直接返回；未启动/已退出则拉起并探活（幂等，并发调用共享同一次启动）
  async ensureStarted(modelPaths = {}) {
    if (this.state === 'ready') return;
    if (this._startPromise) return this._startPromise;
    this._stopping = false;
    this._startPromise = this._start(modelPaths).finally(() => { this._startPromise = null; });
    return this._startPromise;
  }

  async _start(modelPaths) {
    let c;
    try {
      c = await this._readContract();
    } catch (e) {
      this._setState('error', '引擎未安装或 engine.json 无效，请先下载引擎包');
      throw e;
    }
    this.contract = c;
    this.version = c.version || '';
    this._setState('starting', '引擎启动中（首次加载模型可能需要 10~60 秒）…');

    // 端口选择：默认端口被占用则向上顺延
    let port = DEFAULT_PORT;
    for (let i = 0; i < 20 && !(await isPortFree(port)); i++) port++;
    this.port = port;

    const args = (c.args || ['-p', '{port}']).map(a => String(a)
      .replace('{port}', String(port))
      .replace('{gpt}', modelPaths.gpt || '')
      .replace('{sovits}', modelPaths.sovits || ''));
    const entry = path.join(this.rootDir, c.api);
    let cmd, spawnArgs, spawnOpts;
    if (c.runtime === 'node') {
      // 冒烟桩引擎：用 Electron 的 Node 运行时执行脚本
      cmd = process.execPath;
      spawnArgs = [entry, ...args];
      spawnOpts = { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } };
    } else {
      cmd = path.join(this.rootDir, c.python);
      spawnArgs = [entry, ...args];
      spawnOpts = { windowsHide: true };
    }
    const child = spawn(cmd, spawnArgs, spawnOpts);
    this.child = child;
    let exited = false;
    child.on('exit', code => {
      exited = true;
      this.child = null;
      if (this._stopping) return;
      // 崩溃自动重启（有限次），超过后进入错误态防雪崩
      if (this.state !== 'error' && this.restartCount < RESTART_LIMIT) {
        this.restartCount++;
        this._setState('starting', `引擎进程退出（code=${code}），自动重启 ${this.restartCount}/${RESTART_LIMIT}…`);
        setTimeout(() => { if (!this._stopping) this.ensureStarted(modelPaths).catch(() => {}); }, 1000);
      } else if (this.state !== 'error') {
        this._setState('error', `引擎进程退出（code=${code}）且已达重启上限`);
      }
    });

    // 就绪探活：每 500ms ping 一次，上限 90 秒
    const pingUrl = `http://127.0.0.1:${port}${c.pingPath}`;
    const deadline = Date.now() + PING_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (exited) throw new Error('引擎进程在启动期间退出');
      if (await httpReachable(pingUrl)) {
        this._setState('ready', `引擎就绪（端口 ${port}）`);
        return;
      }
      await new Promise(r => setTimeout(r, PING_INTERVAL_MS));
    }
    this._setState('error', '引擎启动超时（90 秒未就绪）');
    throw new Error('引擎启动超时');
  }

  async stop() {
    this._stopping = true;
    const child = this.child;
    if (!child) return;
    if (process.platform === 'win32') {
      // 终止整个进程树（python 可能再拉起子进程）
      await new Promise(resolve => {
        execFile('taskkill', ['/T', '/F', '/PID', String(child.pid)], () => resolve());
      });
    } else {
      child.kill('SIGTERM');
    }
    await new Promise(resolve => {
      if (!this.child) return resolve();
      const t = setTimeout(resolve, 3000);
      this.child.once('exit', () => { clearTimeout(t); resolve(); });
    });
    this.child = null;
    if (this.state === 'ready' || this.state === 'starting') this._setState('installed');
  }

  // ---------- 合成 ----------

  // 经引擎 api_v2 合成一句文本，返回 WAV ArrayBuffer。参数契约见 docs/voice-engine-spec.md
  async tts({ text, refAudioPath, promptText, promptLang = 'zh', textLang = 'zh' }) {
    if (this.state !== 'ready') throw new Error('引擎未就绪');
    const q = new URLSearchParams({
      text: String(text || ''),
      text_lang: textLang,
      ref_audio_path: refAudioPath || '',
      prompt_text: promptText || '',
      prompt_lang: promptLang
    });
    const buf = await httpGetBuffer(`http://127.0.0.1:${this.port}${this.contract.ttsPath}?${q}`, TTS_TIMEOUT_MS);
    if (buf.byteLength < 100) throw new Error('引擎返回音频为空');
    return buf;
  }
}

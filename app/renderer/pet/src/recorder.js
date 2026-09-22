// 录音：按键说话 + 免提 VAD，统一输出 WAV
import { VAD_START_THRESHOLD, VAD_SILENCE_MS } from '../../../shared/constants.js';

export class Recorder {
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
    this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(200);
    this.recording = true;
  }

  // 停止并返回 WAV ArrayBuffer（webm 解码后重编码，规避 ASR 服务兼容性）
  async stop() {
    if (!this.recording) return null;
    const rec = this.recorder;
    this.recording = false;
    const stopped = new Promise(resolve => { rec.onstop = resolve; });
    rec.stop();
    await stopped;
    if (!this.chunks.length) return null;
    const blob = new Blob(this.chunks, { type: this.chunks[0].type || 'audio/webm' });
    const raw = await blob.arrayBuffer();
    try {
      const ctx = new AudioContext();
      const audio = await ctx.decodeAudioData(raw);
      return encodeWav(audio);
    } catch (e) {
      console.warn('[recorder] 录音解码失败：', e);
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
        // 持续录制直到静默 VAD_SILENCE_MS
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
    return new Promise(resolve => {
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
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.analyser = null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// AudioBuffer → 16bit PCM WAV
export function encodeWav(audioBuffer) {
  const numCh = Math.min(1, audioBuffer.numberOfChannels); // 单声道足够
  const rate = audioBuffer.sampleRate;
  const len = audioBuffer.length;
  const data = new DataView(new ArrayBuffer(len * 2));
  const ch = audioBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, ch[i]));
    data.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const header = new ArrayBuffer(44);
  const h = new DataView(header);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) h.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); h.setUint32(4, 36 + len * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, numCh, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true);
  h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  str(36, 'data'); h.setUint32(40, len * 2, true);
  const out = new Uint8Array(44 + len * 2);
  out.set(new Uint8Array(header), 0);
  out.set(new Uint8Array(data.buffer), 44);
  return out.buffer;
}

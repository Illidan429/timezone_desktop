// 语音聊天管线：模式切换、ASR→LLM→TTS 链路、打断与状态呈现
import { CHAT_MODES, MODE_LABELS } from '../../../shared/constants.js';

export class ChatPipeline {
  constructor({ player, recorder, ui }) {
    this.player = player;
    this.recorder = recorder;
    this.ui = ui;
    this.mode = CHAT_MODES.PUSH;
    this.state = 'idle'; // idle | recognizing | thinking | speaking
    this.hasAsr = false; // 由设置注入：ASR 是否已配置
    this._gen = 0;       // 打断代际：自增使旧链路失效
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === CHAT_MODES.HANDSFREE) {
      this.recorder.startVad(wav => this.onUtterance(wav));
    } else {
      this.recorder.stopVad();
    }
    this.ui.setMode(MODE_LABELS[mode], mode === CHAT_MODES.TEXT);
    window.petAPI.prefsSet({ mode });
  }

  async onTalkPress() {
    if (this.mode !== CHAT_MODES.PUSH || this.state === 'recognizing') return;
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
    if (!this.hasAsr) { this.ui.status('未配置语音识别，请在设置中配置'); return; }
    this.setState('recognizing');
    this.ui.status('识别中…');
    try {
      const { text } = await window.petAPI.chatAsr(wav);
      if (!text) { this.ui.status('（没有听清，请再说一次）'); this.setState('idle'); return; }
      await this.send(text, '语音');
    } catch (e) {
      this.ui.status('识别失败：' + e.message);
      this.setState('idle');
    }
  }

  // 文本入口：新输入自动打断当前播放（规格：打断）
  async send(text, sourceLabel = '输入') {
    this._interruptIfSpeaking();
    const gen = ++this._gen;
    this.ui.showUser(`${sourceLabel}：${text}`);
    this.setState('thinking');
    this.ui.status('思考中…');
    let reply;
    try {
      ({ text: reply } = await window.petAPI.chatLlm(text));
    } catch (e) {
      this.ui.status('回复失败：' + e.message);
      this.setState('idle');
      return;
    }
    if (gen !== this._gen) return; // 已被打断
    this.ui.showReply(reply);
    this.setState('speaking');
    this.ui.status('');
    try {
      const { audio } = await window.petAPI.chatTts(reply);
      if (gen !== this._gen) return;
      this.player.enqueue(audio);
    } catch (e) {
      // TTS 失败：文字回复保留（规格要求），提示原因
      this.ui.status('语音合成失败：' + e.message);
      this.setState('idle');
    }
  }

  // 点击角色或新输入时打断：停止播放、清队列、终止外部请求
  interrupt() {
    const wasSpeaking = this.state === 'speaking';
    this._gen++;
    this.player.stopAndClear();
    window.petAPI.chatCancel();
    this.setState('idle');
    if (wasSpeaking) this.ui.status('（已打断）');
  }

  _interruptIfSpeaking() {
    if (this.state === 'speaking' || this.state === 'thinking') {
      this._gen++;
      this.player.stopAndClear();
      window.petAPI.chatCancel();
    }
  }

  clearHistory() {
    window.petAPI.chatClear();
    this.ui.clearSubtitle();
    this.ui.status('（对话已清空）');
  }

  setState(s) {
    this.state = s;
    this.ui.setState(s);
  }
}

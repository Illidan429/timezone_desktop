// 全局共享常量：主进程与渲染端都可引用
export const APP_NAME = '桌宠伴侣';

// 语音聊天输入模式
export const CHAT_MODES = {
  PUSH: 'push',           // 按键说话
  HANDSFREE: 'handsfree', // 免提监听
  TEXT: 'text'            // 文字输入
};

export const MODE_LABELS = {
  push: '按键说话',
  handsfree: '免提监听',
  text: '文字输入'
};

// 三类可配置 API
export const API_TYPES = ['asr', 'llm', 'tts'];

export const API_LABELS = {
  asr: '语音识别 (ASR)',
  llm: '大模型 (LLM)',
  tts: '语音合成 (TTS)'
};

// 口型档位阈值（RMS）
export const MOUTH_THRESHOLD_HALF = 0.02;
export const MOUTH_THRESHOLD_FULL = 0.08;

// 免提模式 VAD 参数
export const VAD_START_THRESHOLD = 0.03;
export const VAD_SILENCE_MS = 800;

// 对话历史保留轮数
export const MAX_HISTORY_ROUNDS = 20;

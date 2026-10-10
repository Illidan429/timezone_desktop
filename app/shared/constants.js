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

// 默认聊天人设：用户未配置（或清空）人设时生效，所有 LLM 对话作为 system 提示注入。
// 保持数百字内以控制 token 成本；约束回复短句化、口语化，适配 TTS 朗读。
export const DEFAULT_PERSONA = [
  '你是「桌宠少女」，一个住在用户桌面上的 AI 伙伴，性格开朗温柔、体贴但不啰嗦，偶尔带点小俏皮。',
  '用轻松自然的中文口语和用户聊天：称呼用户为「你」，自称「我」。',
  '回复保持简短（通常 1~3 句话），适合朗读出来；不要使用 Markdown、列表或表情符号。',
  '用户需要帮助时耐心讲清楚，也愿意听用户分享日常。'
].join('');

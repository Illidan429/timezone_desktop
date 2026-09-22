// 主进程网络代理：所有外部 AI 请求从这里发出，Key 不进渲染端
import { net } from 'electron';
import { getApiKey, loadSettings } from './store.js';

const controllers = new Set();

function joinUrl(base, p) {
  return base.replace(/\/+$/, '') + p;
}

function cfg(type) {
  const s = loadSettings();
  return {
    baseUrl: (s.apis[type]?.baseUrl || '').trim(),
    model: (s.apis[type]?.model || '').trim(),
    voice: (s.apis[type]?.voice || 'alloy').trim(),
    key: getApiKey(type)
  };
}

function assertConfig(type) {
  const c = cfg(type);
  if (!c.baseUrl || !c.key) {
    const miss = [!c.baseUrl && '服务地址', !c.key && 'API Key'].filter(Boolean).join(' 和 ');
    throw new Error(`${type.toUpperCase()} 未配置：缺少${miss}，请在设置中填写`);
  }
  return c;
}

async function request(type, url, init = {}) {
  const ctrl = new AbortController();
  controllers.add(ctrl);
  const started = Date.now();
  try {
    const res = await net.fetch(url, { ...init, signal: ctrl.signal });
    const latency = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) detail += '（鉴权失败：检查 API Key）';
      else if (res.status === 404) detail += '（接口不存在：检查服务地址/模型名）';
      else if (res.status === 429) detail += '（配额或频率超限）';
      else if (res.status >= 500) detail += '（服务端错误）';
      if (body) detail += `：${body.slice(0, 200)}`;
      const err = new Error(detail);
      err.category = res.status === 401 || res.status === 403 ? 'auth' : 'http';
      throw err;
    }
    return { res, latency };
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    if (!e.category) {
      e.category = 'network';
      e.message = `网络错误：${e.message}（检查服务地址与网络）`;
    }
    throw e;
  } finally {
    controllers.delete(ctrl);
  }
}

// 生成 1 秒 16kHz 单声道静音 WAV（ASR 测试用）
function silenceWav() {
  const rate = 16000, seconds = 1;
  const data = Buffer.alloc(rate * seconds * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// 各类 API 的连通性测试：发一次最小真实请求
export async function testApi(type) {
  try {
    const c = assertConfig(type);
    if (type === 'llm') {
      const { latency } = await request(type, joinUrl(c.baseUrl, '/chat/completions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
        body: JSON.stringify({
          model: c.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false
        })
      });
      return { ok: true, detail: `连接成功（${latency}ms）` };
    }
    if (type === 'asr') {
      const form = new FormData();
      form.append('file', new Blob([silenceWav()], { type: 'audio/wav' }), 'test.wav');
      form.append('model', c.model);
      const { latency } = await request(type, joinUrl(c.baseUrl, '/audio/transcriptions'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.key}` },
        body: form
      });
      return { ok: true, detail: `连接成功（${latency}ms）` };
    }
    if (type === 'tts') {
      const { res, latency } = await request(type, joinUrl(c.baseUrl, '/audio/speech'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
        body: JSON.stringify({ model: c.model, input: '你好', voice: c.voice, response_format: 'mp3' })
      });
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 100) return { ok: false, detail: '服务返回内容异常（音频为空）' };
      return { ok: true, detail: `连接成功，返回 ${Math.round(buf.byteLength / 1024)}KB 音频（${latency}ms）` };
    }
    return { ok: false, detail: `未知类型 ${type}` };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

// LLM 对话（非流式）：messages 由调用方组织（含历史）
export async function chatComplete(messages) {
  const c = assertConfig('llm');
  const { res } = await request('llm', joinUrl(c.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
    body: JSON.stringify({ model: c.model, messages, stream: false })
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('模型响应格式异常：未找到回复文本');
  return text.trim();
}

// ASR 转写：wav 字节流 → 文本
export async function transcribe(wavBuffer) {
  const c = assertConfig('asr');
  const form = new FormData();
  form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'recording.wav');
  form.append('model', c.model);
  const { res } = await request('asr', joinUrl(c.baseUrl, '/audio/transcriptions'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.key}` },
    body: form
  });
  const data = await res.json();
  const text = data?.text;
  if (typeof text !== 'string') throw new Error('识别响应格式异常');
  return text.trim();
}

// TTS 合成：文本 → 音频字节（mp3）
export async function synthesize(text) {
  const c = assertConfig('tts');
  const { res } = await request('tts', joinUrl(c.baseUrl, '/audio/speech'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
    body: JSON.stringify({ model: c.model, input: text, voice: c.voice, response_format: 'mp3' })
  });
  return res.arrayBuffer();
}

// 打断：终止所有进行中的外部请求
export function cancelAll() {
  for (const c of controllers) c.abort();
  controllers.clear();
}

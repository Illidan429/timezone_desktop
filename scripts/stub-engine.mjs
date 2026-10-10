// 冒烟/联调桩引擎：模拟 GPT-SoVITS api_v2 的最小 HTTP 契约（/ping、/tts）
// 用法：node stub-engine.mjs --port 9880 [--record <argv记录文件>]
// 环境变量 STUB_CRASH_MS=<毫秒> 启动指定毫秒后以非零码退出（验证崩溃自动重启）
// 环境变量 STUB_TTS_FAIL=1 时 /tts 返回 500（验证合成失败提示）
import http from 'node:http';
import fs from 'node:fs';

const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 9880);

// 记录启动参数（验证 -g/-s 权重路径占位符替换）
const recIdx = process.argv.indexOf('--record');
if (recIdx > 0 && process.argv[recIdx + 1]) {
  try { fs.writeFileSync(process.argv[recIdx + 1], JSON.stringify(process.argv.slice(2))); } catch { /* 记录失败不致命 */ }
}

// 最小合法 WAV：44 字节头 + 8000 个采样点的静音（单声道 16bit 8kHz ≈ 16KB）
function wavBytes() {
  const data = Buffer.alloc(8000 * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24); h.writeUInt32LE(16000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const WAV = wavBytes();

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname === '/ping') { res.writeHead(200); res.end('ok'); return; }
  if (u.pathname === '/tts') {
    if (process.env.STUB_TTS_FAIL) { res.writeHead(500); res.end('stub tts failure'); return; }
    res.writeHead(200, { 'Content-Type': 'audio/wav' });
    res.end(WAV);
    return;
  }
  res.writeHead(404); res.end();
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[stub-engine] listening on ${port}`);
});

if (process.env.STUB_CRASH_MS) {
  setTimeout(() => process.exit(1), Number(process.env.STUB_CRASH_MS));
}

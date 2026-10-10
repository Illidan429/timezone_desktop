// 冒烟辅助：把桩引擎打成 ZIP 并以本地 HTTP 服务暴露为下载源（仅 --smoke 使用，不打进发行包逻辑）
// 桩脚本本体复用 scripts/stub-engine.mjs（单一事实源）；scripts/ 不随包分发，打包后跳过引擎冒烟
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

// 制作假音色目录（importModel 可接受的最低结构），返回目录路径
export async function makeFakeVoiceModel(name) {
  const dir = path.join(os.tmpdir(), 'pet-smoke-voice-' + Date.now(), name);
  await fsp.mkdir(path.join(dir, 'model'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'ref'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'model', 'gpt.ckpt'), 'stub-gpt');
  await fsp.writeFile(path.join(dir, 'model', 'sovits.pth'), 'stub-sovits');
  await fsp.writeFile(path.join(dir, 'ref', 'default.wav'), Buffer.alloc(200, 1));
  await fsp.writeFile(path.join(dir, 'ref', 'prompt.txt'), '冒烟参考音频。', 'utf8');
  return dir;
}

export async function startStubSource(stubScriptPath) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pet-smoke-engine-'));
  const pkg = path.join(dir, 'pkg');
  await fsp.mkdir(pkg, { recursive: true });
  await fsp.copyFile(stubScriptPath, path.join(pkg, 'stub-engine.mjs'));
  await fsp.writeFile(path.join(pkg, 'engine.json'), JSON.stringify({
    version: 'smoke-stub-1.0.0',
    runtime: 'node',
    api: 'stub-engine.mjs',
    args: ['--port', '{port}'],
    pingPath: '/ping',
    ttsPath: '/tts'
  }, null, 2));
  const zip = path.join(dir, 'pack.zip');
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${pkg}\\*' -DestinationPath '${zip}' -Force"`);
  const bytes = await fsp.readFile(zip);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const server = http.createServer((req, res) => {
    if (req.url === '/pack.zip') { res.writeHead(200, { 'Content-Length': bytes.length }); res.end(bytes); return; }
    if (req.url === '/pack.zip.sha256') { res.writeHead(200); res.end(sha + '  pack.zip'); return; }
    res.writeHead(404); res.end();
  });
  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
  return {
    url: `http://127.0.0.1:${port}/pack.zip`,
    cleanup: async () => {
      server.close();
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

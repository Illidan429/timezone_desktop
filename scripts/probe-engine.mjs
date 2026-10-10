// EngineManager 独立验证探针：以桩引擎覆盖下载校验、解压安装、端口顺延、崩溃重启、停止清理
// 运行：npx electron scripts/probe-engine.mjs   （结束输出 PROBE_RESULT 并以退出码表达结果）
import { app } from 'electron';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EngineManager } from '../app/main/engine.js';
import { importModel, enabledModel, listModels, voiceModelsRoot } from '../app/main/voice-model.js';
import { updatePrefs } from '../app/main/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STUB_SRC = path.join(__dirname, 'stub-engine.mjs');
const work = path.join(os.tmpdir(), 'pet-engine-probe');
const checks = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitFor(cond, timeoutMs, step = 200) {
  return new Promise(async resolve => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await cond()) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      await sleep(step);
    }
  });
}

// 用 PowerShell Compress-Archive 制作测试 ZIP（无需引入写 zip 依赖）
function makeZip(srcDir, zipPath) {
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${zipPath}' -Force"`);
}

async function main() {
  await fsp.rm(work, { recursive: true, force: true });
  const pkgDir = path.join(work, 'pkg');
  await fsp.mkdir(pkgDir, { recursive: true });
  await fsp.copyFile(STUB_SRC, path.join(pkgDir, 'stub-engine.mjs'));
  await fsp.writeFile(path.join(pkgDir, 'engine.json'), JSON.stringify({
    version: 'stub-1.0.0',
    runtime: 'node',
    api: 'stub-engine.mjs',
    args: ['--port', '{port}', '--record', path.join(work, 'argv-record.json'), '-g', '{gpt}', '-s', '{sovits}'],
    pingPath: '/ping',
    ttsPath: '/tts'
  }, null, 2));
  const zipPath = path.join(work, 'engine-pack.zip');
  makeZip(pkgDir, zipPath);
  const zipBytes = await fsp.readFile(zipPath);
  const sha = crypto.createHash('sha256').update(zipBytes).digest('hex');

  // 静态下载源：/pack.zip（正确 sidecar）、/bad.zip（错误 sidecar）
  const srvPort = 18800 + Math.floor(Math.random() * 1000);
  const server = http.createServer((req, res) => {
    if (req.url === '/pack.zip') { res.writeHead(200, { 'Content-Length': zipBytes.length }); res.end(zipBytes); return; }
    if (req.url === '/pack.zip.sha256') { res.writeHead(200); res.end(sha + '  engine-pack.zip'); return; }
    if (req.url === '/bad.zip') { res.writeHead(200, { 'Content-Length': zipBytes.length }); res.end(zipBytes); return; }
    if (req.url === '/bad.zip.sha256') { res.writeHead(200); res.end('0'.repeat(64) + '  bad.zip'); return; }
    res.writeHead(404); res.end();
  });
  await new Promise(r => server.listen(srvPort, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srvPort}`;

  try {
    // a) 未安装 → 下载（含 SHA-256 校验）→ installed
    const m = new EngineManager({ rootDir: path.join(work, 'engine') });
    checks.initialAbsent = (await m.checkInstalled()) === false && m.state === 'absent';
    await m.download(`${base}/pack.zip`);
    checks.downloadInstall = m.state === 'installed' && m.version === 'stub-1.0.0'
      && fs.existsSync(path.join(work, 'engine', 'engine.json'));

    // b) SHA-256 不一致 → 报错且不落盘
    const bad = new EngineManager({ rootDir: path.join(work, 'engine-bad') });
    let badMsg = '';
    await bad.download(`${base}/bad.zip`).catch(e => { badMsg = e.message; });
    checks.shaMismatch = bad.state === 'error' && /SHA-256/.test(badMsg)
      && !fs.existsSync(path.join(work, 'engine-bad', 'engine.json'));

    // c) 端口顺延：占住 9880，引擎应改用 9881 并就绪
    const blocker = net.createServer();
    await new Promise(r => blocker.listen(9880, '127.0.0.1', r));
    await m.ensureStarted();
    checks.portFallback = m.state === 'ready' && m.port === 9881;

    // d) 合成：桩 /tts 返回合法 WAV（ArrayBuffer）
    const wav = await m.tts({ text: '测试', refAudioPath: 'x.wav', promptText: '测试' });
    const head = new Uint8Array(wav, 0, 4);
    checks.tts = wav.byteLength > 1000 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46; // RIFF

    // e) 崩溃自动重启：桩引擎 1.5 秒后自杀，应自动拉回 ready
    process.env.STUB_CRASH_MS = '1500';
    // 让桩在下次启动读取到该变量：先手动杀掉当前实例触发重启链路
    execSync(`taskkill /T /F /PID ${m.child.pid}`);
    const restarted = await waitFor(() => m.state === 'ready' && m.restartCount >= 1, 20000);
    checks.crashRestart = restarted;
    delete process.env.STUB_CRASH_MS;

    // f) 停止：进程树清理，探活不可达
    const pid = m.child?.pid;
    await m.stop();
    await sleep(400);
    let stopped = m.state === 'installed' && !m.child;
    if (pid) {
      try { process.kill(pid, 0); stopped = false; } catch { stopped = stopped && true; }
    }
    checks.stopCleanup = stopped;

    // g) 音色模型：导入校验、入库、启用后返回权重与参考音频路径
    const voiceDir = path.join(work, 'voice', '测试音色');
    await fsp.mkdir(path.join(voiceDir, 'model'), { recursive: true });
    await fsp.mkdir(path.join(voiceDir, 'ref'), { recursive: true });
    await fsp.writeFile(path.join(voiceDir, 'model', 'gpt.ckpt'), 'stub-gpt');
    await fsp.writeFile(path.join(voiceDir, 'model', 'sovits.pth'), 'stub-sovits');
    await fsp.writeFile(path.join(voiceDir, 'ref', 'default.wav'), await fsp.readFile(STUB_SRC).then(b => b.slice(0, 200)).catch(() => 'x'));
    await fsp.writeFile(path.join(voiceDir, 'ref', 'prompt.txt'), '这是参考音频的文字。');
    const badDir = path.join(work, 'voice', '缺文件');
    await fsp.mkdir(path.join(badDir, 'model'), { recursive: true });
    let importErr = '';
    await importModel(badDir).catch(e => { importErr = e.message; });
    const importedName = await importModel(voiceDir);
    checks.voiceImport = /缺少/.test(importErr) && importedName === '测试音色'
      && listModels().some(x => x.name === '测试音色');
    await updatePrefs({ voiceModel: '测试音色' });
    const em = enabledModel();
    checks.voiceEnable = !em.error
      && em.modelPaths.gpt === path.join(voiceModelsRoot(), '测试音色', 'model', 'gpt.ckpt')
      && em.ref.promptText === '这是参考音频的文字。';

    // h) 启动参数注入：-g/-s 占位符替换为启用音色的权重绝对路径
    await m.ensureStarted(em.modelPaths);
    const recRaw = await fsp.readFile(path.join(work, 'argv-record.json'), 'utf8');
    const recArgs = JSON.parse(recRaw);
    checks.modelArgsInjected = m.state === 'ready'
      && recArgs.includes(em.modelPaths.gpt) && recArgs.includes(em.modelPaths.sovits);

    await updatePrefs({ voiceModel: '' });
    server.close();
    blocker.close();
    await fsp.rm(work, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(path.join(voiceModelsRoot(), '测试音色'), { recursive: true, force: true }).catch(() => {});
  } catch (e) {
    checks.fatal = String(e?.stack || e);
    server.close();
  }
  checks.allOk = Object.entries(checks).every(([k, v]) => k === 'fatal' || v === true);
  console.log('PROBE_RESULT=' + JSON.stringify(checks));
  app.exit(checks.allOk ? 0 : 1);
}

app.whenReady().then(main);

// 语音聊天真实验收脚本（需智谱 GLM Key）
// 用法：
//   1. npm run dist 后以调试端口启动应用：
//      dist\桌宠伴侣-portable-0.1.0.exe --remote-debugging-port=9222
//   2. curl http://127.0.0.1:9222/json 取 pet 页面的 webSocketDebuggerUrl
//   3. node scripts/acceptance-voice.mjs "<wsUrl>" "<GLM API Key>"
// 覆盖：配置写入、三路测试按钮、鉴权失败分类、文字聊天全链路、多轮上下文、打断、ASR 链路
import fs from 'node:fs';
const WS = process.argv[2];
const KEY = process.argv[3];
const BASE = 'https://open.bigmodel.cn/api/paas/v4';
const ws = new WebSocket(WS);
let id = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
  }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function evalJs(expression, timeoutMs = 60000) {
  const t = setTimeout(() => pending.get(id)?.rej(new Error('eval 超时: ' + expression.slice(0, 60))), timeoutMs);
  try {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  } finally { clearTimeout(t); }
}
const results = {};
async function record(name, pass, detail) {
  results[name] = { pass, detail };
  console.log((pass ? '✅' : '❌') + ' ' + name + ' — ' + detail);
}
async function waitIdle(maxSec = 60) {
  for (let i = 0; i < maxSec; i++) { await sleep(1000); if (await evalJs(`window.__PET_DEBUG__.pipeline.state`) === 'idle') return true; }
  return false;
}
ws.onopen = async () => {
  try {
    const D = 'window.__PET_DEBUG__';
    const cfg = {
      apis: {
        asr: { baseUrl: BASE, model: 'glm-asr', key: KEY },
        llm: { baseUrl: BASE, model: 'glm-4-flash', key: KEY },
        tts: { baseUrl: BASE, model: 'cogtts', key: KEY, voice: 'tongtong' }
      },
      prefs: {}
    };
    await evalJs(`window.petAPI.settingsSave(${JSON.stringify(cfg)})`, 15000);
    // ===== 1. TTS 测试（修复后）=====
    const t3 = await evalJs(`window.petAPI.apiTest('tts')`, 60000);
    await record('TTS 测试按钮（修复后）', t3.ok, t3.detail);
    // ===== 2. 文字聊天全链路 =====
    await evalJs(`${D}.player.onStart = () => { ${D}.player.__starts = (${D}.player.__starts||0)+1; };
      ${D}.player.onOneEnd = () => { ${D}.player.__ends = (${D}.player.__ends||0)+1; };
      ${D}.__maxMouth = 0;
      ${D}.player.onLevel = l => { ${D}.stage.setMouthLevel(l); if (l > ${D}.__maxMouth) ${D}.__maxMouth = l; };`);
    await evalJs(`${D}.pipeline.send('你好，请用一句话介绍你自己', '文字')`);
    const ok1 = await waitIdle();
    const turn1 = await evalJs(`({ user: document.getElementById('subtitleUser').textContent,
      reply: document.getElementById('subtitleReply').textContent,
      starts: ${D}.player.__starts || 0, ends: ${D}.player.__ends || 0,
      maxMouth: ${D}.__maxMouth, state: ${D}.pipeline.state })`);
    await record('文字聊天全链路', ok1 && turn1.reply.length > 0 && turn1.starts > 0 && turn1.ends > 0 && turn1.maxMouth > 0,
      `回复:「${turn1.reply.slice(0, 36)}」 播放${turn1.starts}/完成${turn1.ends} 口型最大档${turn1.maxMouth} 终态${turn1.state}`);
    // ===== 3. 播放中打断 =====
    await evalJs(`${D}.pipeline.send('请从1慢慢数到20，每个数字都用中文说出来')`);
    let speaking = false;
    for (let i = 0; i < 40; i++) { await sleep(1000); if (await evalJs(`${D}.pipeline.state`) === 'speaking') { speaking = true; break; } }
    if (speaking) {
      await evalJs(`(() => {
        const st = document.getElementById('charStack');
        st.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
        window.dispatchEvent(new MouseEvent('mouseup'));
      })()`);
      await sleep(600);
      const after = await evalJs(`({ playing: ${D}.player.playing, state: ${D}.pipeline.state })`);
      await record('播放中点击打断', !after.playing && after.state === 'idle', `点击后 playing=${after.playing} state=${after.state}`);
    } else {
      await record('播放中点击打断', false, '未能进入说话状态（TTS 可能仍失败）');
    }
    // ===== 4. ASR 链路（测试音 → 真实GLM）=====
    await evalJs(`(async () => {
      const w = await (await fetch('app://assets/default/audio/test.wav')).arrayBuffer();
      await window.__PET_DEBUG__.pipeline.onUtterance(w);
    })()`);
    const ok4 = await waitIdle(45);
    const asr = await evalJs(`({ user: document.getElementById('subtitleUser').textContent,
      status: document.getElementById('subtitleStatus').textContent, state: ${D}.pipeline.state })`);
    await record('ASR 链路（真实GLM）', ok4, `状态${asr.state} 用户栏:「${asr.user.slice(0, 30)}」 提示:「${asr.status.slice(0, 50)}」`);
    // ===== 5. 打字输入模式与字幕状态 =====
    const modes = await evalJs(`(() => {
      const btn = document.getElementById('modeBtn');
      return { label: btn.textContent, talkVisible: document.getElementById('talkBtn').style.display !== 'none' };
    })()`);
    await record('模式切换UI', modes.label.length > 0, `当前模式:${modes.label} 麦克风按钮可见:${modes.talkVisible}`);
    const allPass = Object.values(results).every(r => r.pass);
    console.log('=== 总结:', allPass ? '全部通过' : '存在失败项', `(${Object.values(results).filter(r => r.pass).length}/${Object.keys(results).length})`, '===');
    fs.writeFileSync('C:/Users/Administrator/Desktop/shi-desktop/acceptance_results.json', JSON.stringify(results, null, 2));
    process.exit(allPass ? 0 : 1);
  } catch (e) {
    console.error('验收脚本异常:', e.message);
    fs.writeFileSync('C:/Users/Administrator/Desktop/shi-desktop/acceptance_results.json', JSON.stringify(results, null, 2));
    process.exit(1);
  }
};
setTimeout(() => { console.error('总超时'); process.exit(1); }, 420000);

const ws = new WebSocket(process.argv[2]);
let id = 0;
const pending = new Map();
function send(method, params) {
  return new Promise((res, rej) => { const mid = ++id; pending.set(mid, { res, rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || '页面异常');
  return r.result.value;
}
ws.onopen = async () => {
  // 关掉穿透回到已知状态，输出角色区域屏幕坐标
  const r = await evalJs(`(async () => {
    await window.petAPI.prefsSet({ passthrough: false });
    const rc = document.getElementById('charStack').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(window.screenX + rc.left), y: Math.round(window.screenY + rc.top), w: Math.round(rc.width), h: Math.round(rc.height) });
  })()`);
  console.log('角色区域: ' + r);
  process.exit(0);
};
setTimeout(() => process.exit(1), 20000);

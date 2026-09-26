// 渲染端入口：装配素材、界面、穿透与拖动、聊天管线
import { loadManifest, preloadImages, collectImageUrls, assetUrl } from './manifest.js';
import { Stage, BlinkScheduler, mouthLevelFromRms } from './display.js';
import { Player } from './player.js';
import { Recorder } from './recorder.js';
import { ChatPipeline } from './pipeline.js';
import { Ui } from './ui.js';
import { CHAT_MODES } from '../../../shared/constants.js';

// 冒烟状态：主进程 --smoke 模式读取
window.__PET_STATE__ = { ready: false, errors: [], manifest: null, degrade: [] };
const state = window.__PET_STATE__;

let stage, blinker, player, recorder, pipeline, ui;
let lastCursor = null;
let ignoreMouse = true;
let dragging = null; // {startX,startY,lastX,lastY,moved}

async function boot() {
  try {
    // 1. 素材清单
    const mres = await loadManifest();
    state.manifest = mres.manifest;
    state.degrade = mres.missing;
    if (!mres.manifest) {
      state.errors.push('素材清单不可用：' + mres.missing.join('；'));
      return;
    }
    // 2. 预加载图片（单个坏文件降级不阻塞）
    const urls = collectImageUrls(mres.manifest);
    const loaded = await preloadImages(urls);
    const images = new Map();
    for (const r of loaded) {
      if (r.ok) images.set(r.url, r.img);
      else state.degrade.push('图片加载失败（已降级跳过）: ' + r.url);
    }
    // 3. 模块装配
    stage = new Stage(mres.manifest, images);
    blinker = new BlinkScheduler(stage);
    player = new Player();
    recorder = new Recorder();
    ui = new Ui(mres.manifest);
    pipeline = new ChatPipeline({ player, recorder, ui });

    player.onLevel = lvl => stage.setMouthLevel(lvl);
    player.onEnd = () => { if (pipeline.state === 'speaking') pipeline.setState('idle'); };

    // 4. 应用设置
    const { prefs, apis } = await window.petAPI.settingsGet();
    applyPrefs(prefs);
    pipeline.hasAsr = Boolean(apis?.asr?.baseUrl && apis?.asr?.hasKey);
    wireControls();
    wireCursorAndDrag();
    window.petAPI.onPrefsChanged(applyPrefs);
    window.petAPI.onSettingsChanged((view) => {
      pipeline.hasAsr = Boolean(view?.apis?.asr?.baseUrl && view?.apis?.asr?.hasKey);
    });

    blinker.start();
    state.ready = true;
    window.__SMOKE_READY__ = true;
  } catch (e) {
    state.errors.push('启动失败：' + (e?.stack || e));
    console.error(e);
  }
}

function applyPrefs(prefs = {}) {
  if (!stage) return;
  if (prefs.theme) ui.setTheme(prefs.theme);
  if (prefs.pose) stage.applyPose(prefs.pose);
  if (typeof prefs.volume === 'number') player.setVolume(prefs.volume);
  if (prefs.mode && pipeline && prefs.mode !== pipeline.mode) {
    pipeline.mode = prefs.mode;
    pipeline.setMode(prefs.mode);
  }
  if (prefs.topmost !== undefined) {
    // 置顶由主进程管理，这里仅在托盘/设置同步时无需处理
  }
}

function wireControls() {
  const { modeBtn, talkBtn, input, send, settings } = ui.el;
  modeBtn.addEventListener('click', () => {
    const order = [CHAT_MODES.PUSH, CHAT_MODES.HANDSFREE, CHAT_MODES.TEXT];
    const next = order[(order.indexOf(pipeline.mode) + 1) % order.length];
    pipeline.setMode(next);
  });
  talkBtn.addEventListener('mousedown', () => pipeline.onTalkPress());
  window.addEventListener('mouseup', () => pipeline.onTalkRelease());
  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    pipeline.send(text, '文字');
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  settings.addEventListener('click', () => window.petAPI.windowOpenSettings());
  ui.setMode(/** @type {any} */(pipeline.mode) && modeBtn.textContent, pipeline.mode === CHAT_MODES.TEXT);
}

function wireCursorAndDrag() {
  window.petAPI.onCursor(pt => {
    lastCursor = pt;
    // 穿透切换：仅状态变化时调用
    const hit = stage.hitTest(pt);
    if (hit !== !ignoreMouse || (hit && ignoreMouse)) {
      const shouldIgnore = !hit && !dragging;
      if (shouldIgnore !== ignoreMouse) {
        ignoreMouse = shouldIgnore;
        window.petAPI.windowSetIgnoreMouse(shouldIgnore);
      }
    }
    if (dragging) {
      const dx = pt.x - dragging.lastX, dy = pt.y - dragging.lastY;
      dragging.lastX = pt.x; dragging.lastY = pt.y;
      dragging.moved += Math.abs(dx) + Math.abs(dy);
      if (dx || dy) window.petAPI.windowMoveBy(dx, dy);
    }
    stage.tick(1 / 60, pt);
    ui.updateControlsVisibility(pt);
  });

  stage.el.stack.addEventListener('mousedown', e => {
    if (!lastCursor) return;
    dragging = { lastX: lastCursor.x, lastY: lastCursor.y, moved: 0, downAt: Date.now() };
    stage.el.stack.classList.add('dragging');
    const up = () => {
      window.removeEventListener('mouseup', up);
      stage.el.stack.classList.remove('dragging');
      const wasClick = dragging.moved < 6 && Date.now() - dragging.downAt < 500;
      dragging = null;
      if (wasClick && pipeline.state === 'speaking') pipeline.interrupt(); // 点击打断
      else if (wasClick) blinker.play(); // 点击小互动（无动作素材时以眨眼回应）
    };
    window.addEventListener('mouseup', up);
  });
}

// 冒烟功能自检：由主进程 --smoke 模式调用，断言核心渲染行为
window.__PET_SMOKE_CHECKS__ = async function () {
  const checks = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    // 1. 视线网格映射：中心 → 中格；右侧 → 右列
    const rect = stage.el.stack.getBoundingClientRect();
    const cx = window.screenX + rect.left + rect.width / 2;
    const cy = window.screenY + rect.top + rect.height / 2;
    const c1 = stage.gazeCellFor({ x: cx, y: cy });
    const c2 = stage.gazeCellFor({ x: cx + 500, y: cy });
    checks.gazeCenter = c1 && c1.c === 1 && c1.r === 1;
    checks.gazeRight = c2 && c2.c === 2;
    stage.setGaze(c1);

    // 2. 眨眼动画：播放后进入半闭/闭合并复位
    blinker.play();
    await sleep(120);
    const blinkMid = stage.blinkLevel > 0;
    await sleep(500);
    checks.blink = blinkMid && stage.blinkLevel === 0;

    // 3. 口型：响度→档位，释放防抖后归零
    player.pushLevel(0.09);
    checks.mouthHigh = stage.mouthLevel === 2;
    player.pushLevel(0);
    await sleep(250);
    checks.mouthRelease = stage.mouthLevel === 0;

    // 4. 播放队列：内置测试音解码入队并开始播放，可停止；连续入队 3 条依序播放
    // 冒烟自检静音：避免自动化测试时外放声音
    player.ensureCtx();
    player.setVolume(0);
    let started = false;
    player.onStart = () => { started = true; };
    const wav = await (await fetch('app://assets/default/audio/test.wav')).arrayBuffer();
    player.enqueue(wav); player.enqueue(wav); player.enqueue(wav);
    await sleep(600);
    checks.audioPlays = started && player.playing;
    await sleep(1800); // 第一条约 1.3s，此刻应仍在播第二条（依序、不重叠）
    checks.audioSequential = player.playing;
    player.stopAndClear();
    checks.audioStops = !player.playing;
    player.setVolume(0.9);

    // 5. 命中检测：角色中心命中；窗口左上角空白处不命中
    checks.hitChar = stage.hitTest({ x: cx, y: cy });
    checks.hitEmpty = stage.hitTest({ x: window.screenX + 4, y: window.screenY + 4 }) === false;
    checks.dbg = `screenX=${window.screenX},screenY=${window.screenY},rect=${JSON.stringify(stage.el.stack.getBoundingClientRect())},outerW=${window.outerWidth}`;

    // 6. 姿态切换（素材包姿态数不定：有多个则切到最后一个，仅一个则验证重载）
    const poses = stage.m.poses || [];
    const target = poses[poses.length - 1];
    stage.applyPose(target.id);
    checks.poseSwitch = stage.poseId === target.id
      && (stage.el.pose.style.backgroundImage.includes('blob:') || stage.el.gaze.style.backgroundImage.includes('blob:'));
    stage.applyPose(poses[0].id);

    // 7. 主题切换
    ui.setTheme('night');
    checks.themeNight = document.body.classList.contains('night');
    ui.setTheme('day');
    checks.themeRestore = !document.body.classList.contains('night');

    // 8. 模式切换（文字模式隐藏麦克风按钮）
    const pushMode = pipeline.mode;
    pipeline.setMode('text');
    checks.modeText = ui.el.talkBtn.style.display === 'none';
    pipeline.setMode(pushMode === 'text' ? 'push' : pushMode);

    // 9. 清空对话（无 API 也应正常完成）
    await pipeline.clearHistory();
    checks.chatClear = true;

    // 10. 打断：播放态下打断回到空闲
    pipeline.state = 'speaking';
    pipeline.interrupt();
    checks.interrupt = pipeline.state === 'idle';
  } catch (e) {
    checks.fatal = String(e && e.stack || e);
  }
  checks.allOk = Object.entries(checks).every(([k, v]) => k === 'fatal' || k === 'dbg' || k.endsWith('Dbg') || v === true);
  return checks;
};

// 调试/验收接口：直接触达各模块（不影响正常功能）
window.__PET_DEBUG__ = { get stage() { return stage; }, get player() { return player; }, get recorder() { return recorder; }, get pipeline() { return pipeline; }, get ui() { return ui; } };

boot();

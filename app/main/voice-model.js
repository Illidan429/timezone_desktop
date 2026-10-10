// 固定目标音色：预训练模型导入/启用，为引擎提供启动权重与合成参考音频
// 目录约定见 docs/voice-engine-spec.md §6：<音色名>/model/{gpt.ckpt,sovits.pth} + ref/{default.wav,prompt.txt}
import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { loadSettings, updatePrefs } from './store.js';

export function voiceModelsRoot() {
  return path.join(app.getPath('userData'), 'voice-models');
}

// 校验音色目录结构，返回缺失项列表（空数组 = 合法）
function missingParts(dir) {
  const need = ['model/gpt.ckpt', 'model/sovits.pth', 'ref/default.wav', 'ref/prompt.txt'];
  return need.filter(rel => {
    try { return !fs.statSync(path.join(dir, rel)).isFile(); } catch { return true; }
  });
}

// 导入：校验源目录结构后复制入库（同名覆盖），写 voice.json
export async function importModel(sourceDir) {
  const missing = missingParts(sourceDir);
  if (missing.length) {
    throw new Error(`所选目录不是有效的音色目录，缺少：${missing.join('、')}`);
  }
  const name = path.basename(sourceDir);
  const dest = path.join(voiceModelsRoot(), name);
  await fsp.rm(dest, { recursive: true, force: true });
  await fsp.mkdir(dest, { recursive: true });
  await fsp.cp(sourceDir, dest, { recursive: true });
  const promptText = (await fsp.readFile(path.join(dest, 'ref', 'prompt.txt'), 'utf8')).trim();
  await fsp.writeFile(path.join(dest, 'voice.json'), JSON.stringify({
    name,
    importedAt: new Date().toISOString(),
    refAudio: 'ref/default.wav',
    promptText
  }, null, 2), 'utf8');
  return name;
}

export function listModels() {
  const root = voiceModelsRoot();
  let names = [];
  try {
    names = fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'voice.json')))
      .map(d => d.name);
  } catch { /* 目录不存在 = 尚无导入 */ }
  const enabled = String(loadSettings().prefs.voiceModel || '');
  return names.map(name => ({ name, enabled: name === enabled }));
}

// 当前启用音色的完整信息；未启用/文件缺失返回 null 并带原因
export function enabledModel() {
  const name = String(loadSettings().prefs.voiceModel || '');
  if (!name) return { error: '未导入或未启用音色模型，请到设置页「音色」导入' };
  const dir = path.join(voiceModelsRoot(), name);
  const missing = missingParts(dir);
  if (missing.length) return { error: `已启用的音色「${name}」文件缺失（${missing.join('、')}），请重新导入` };
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'voice.json'), 'utf8')); } catch { /* 容错 */ }
  return {
    name,
    modelPaths: {
      gpt: path.join(dir, 'model', 'gpt.ckpt'),
      sovits: path.join(dir, 'model', 'sovits.pth')
    },
    ref: {
      refAudioPath: path.join(dir, 'ref', 'default.wav'),
      promptText: String(meta.promptText || '')
    }
  };
}

// 启用并按需重启引擎（权重在启动时载入，切换音色必须重启进程才生效）
export async function enableModel(name) {
  if (!listModels().some(m => m.name === name)) throw new Error(`音色「${name}」不存在`);
  updatePrefs({ voiceModel: name });
  return { ok: true, name };
}

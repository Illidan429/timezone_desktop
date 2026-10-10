// ttsType 迁移验证探针：分两次运行（独立 userData 避免缓存语义混淆）
//   npx electron scripts/probe-migration.mjs legacy  → 旧版设置文件（无 ttsType 字段）应迁移为 openai
//   npx electron scripts/probe-migration.mjs fresh   → 全新安装应默认 gptsovits
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const mode = process.argv[2] || 'legacy';
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'pet-migration-')));

app.whenReady().then(async () => {
  const ud = app.getPath('userData');
  if (mode === 'legacy') {
    // 旧版设置文件：prefs 存在但没有 ttsType 字段
    fs.writeFileSync(path.join(ud, 'settings.json'),
      JSON.stringify({ apis: {}, prefs: { theme: 'day', volume: 0.9 }, keys: {} }));
  }
  const { loadSettings } = await import('../app/main/store.js');
  const got = loadSettings().prefs.ttsType;
  const expect = mode === 'legacy' ? 'openai' : 'gptsovits';
  const ok = got === expect;
  console.log(`MIGRATION_RESULT=${JSON.stringify({ mode, got, expect, ok })}`);
  fs.rmSync(ud, { recursive: true, force: true });
  app.exit(ok ? 0 : 1);
});

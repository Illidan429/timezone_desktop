// 素材补充需求文档生成器：每方向眨眼/口型帧（perGaze）
// 用法：node scripts/gen-blink-addendum.mjs → docs/素材补充需求_每方向眨眼口型.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets-app', 'default');

function b64(pngPath) {
  return 'data:image/png;base64,' + fs.readFileSync(pngPath).toString('base64');
}
function frameB64(rel) {
  return b64(path.join(ASSETS, rel));
}

const GAZE_NAMES = [['左上', '正上', '右上'], ['左中', '正前', '右中'], ['左下', '正下', '右下']];
const eyeCells = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
  eyeCells.push({ name: GAZE_NAMES[r][c], file: `gaze/g${c}r${r}.png` });
  void 0;
}
const eyeGrid = eyeCells.map(({ name, file }) => `
  <figure class="cell"><img src="${frameB64(file)}" alt="${name}"><figcaption>${name}<br><code>${file}</code></figcaption></figure>`).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>素材补充需求 · 每方向眨眼/口型帧 · 桌宠伴侣</title>
<style>
  :root { --brand:#f59a3e; --ink:#2a2f3a; --sub:#5a6373; --line:#e8ecf2; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:#f6f7fb; color:var(--ink);
         font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif; font-size:15px; line-height:1.75; }
  .page { max-width:880px; margin:0 auto; }
  header.hero { background:linear-gradient(135deg,#ffb25a,#f57e3e); color:#fff; border-radius:16px; padding:28px 32px; margin-bottom:24px; }
  header.hero h1 { margin:0 0 6px; font-size:24px; }
  header.hero p { margin:0; opacity:.94; font-size:14px; }
  .meta { font-size:12px; opacity:.85; margin-top:10px; }
  section { background:#fff; border-radius:14px; padding:22px 26px; margin-bottom:18px; box-shadow:0 1px 4px rgba(20,30,60,.06); }
  h2 { font-size:18px; margin:0 0 14px; padding-left:12px; border-left:4px solid var(--brand); }
  h3 { font-size:15.5px; margin:18px 0 10px; color:#b06a2a; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; }
  th { background:#fdf3e7; color:#8a5a1e; font-weight:600; white-space:nowrap; }
  tr:nth-child(even) td { background:#fbfcfe; }
  code, pre { font-family:Consolas,"Courier New",monospace; }
  pre { background:#1f2430; color:#e8ecf2; border-radius:10px; padding:14px 16px; font-size:12.5px; overflow-x:auto; line-height:1.55; }
  pre .c { color:#8fa1b8; }
  .grid9 { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; }
  .cell { margin:0; text-align:center; }
  .cell img { width:100%; border-radius:8px; border:1px solid var(--line);
              background:repeating-conic-gradient(#ececec 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px; }
  figcaption { font-size:12.5px; color:var(--sub); margin-top:5px; }
  .callout { background:#fff8ef; border:1px solid #f5dfc0; border-radius:10px; padding:12px 16px; font-size:14px; margin:12px 0; }
  .check { list-style:none; padding-left:0; }
  .check li { padding:5px 0 5px 30px; position:relative; }
  .check li::before { content:"☐"; position:absolute; left:4px; color:var(--brand); font-size:17px; }
  .ok { color:#1a9e5c; font-weight:600; }
  .sub { color:var(--sub); font-size:13.5px; }
  .foot { text-align:center; color:var(--sub); font-size:12.5px; margin-top:8px; }
  @media print { body { background:#fff; padding:0; } section, header.hero { box-shadow:none; break-inside:avoid; } }
</style>
</head>
<body>
<div class="page">

<header class="hero">
  <h1>素材补充需求 · 每方向眨眼 / 口型帧</h1>
  <p>在已交付的九方向视线帧基础上，为每个视线方向补充对应的闭眼与张嘴帧，使眨眼和说话在任意注视方向上都完全贴合。</p>
  <div class="meta">文档版本 v1.1 · 2026-09-26 · 基于「桌宠伴侣」素材包已交付版本</div>
</header>

<section>
  <h2>一、为什么要补充</h2>
  <p>已交付的九方向视线帧中带有<b>轻微的头部倾斜与位移</b>（这个处理很好，保留了）。但目前引用的眨眼帧（<code>blink/half.png、closed.png</code>）和口型帧（<code>mouth/half.png、open.png</code>）是基于<b>正前姿势</b>录制的——当角色看向其他方向时，覆盖帧与移动后的五官位置有几像素的错位，眨眼/说话瞬间会出现轻微重影。</p>
  <div class="callout"><b>解决方式</b>：为每个视线方向各录一套眨眼、口型帧——即「视线帧 × 表情参数」的组合。录制方法与九方向帧完全相同，只是多乘一个表情参数。</div>
</section>

<section>
  <h2>二、交付清单</h2>
  <table>
    <tr><th>类别</th><th>命名规则</th><th>数量</th><th>说明</th><th>必须</th></tr>
    <tr><td>眨眼 · 全闭</td><td><code>blink/g{c}r{r}.png</code></td><td>9 张</td><td>各视线方向的闭眼整帧（对应原 closed.png 的效果）</td><td class="ok">✅</td></tr>
    <tr><td>眨眼 · 半闭</td><td><code>blink/g{c}r{r}_half.png</code></td><td>9 张</td><td>各视线方向的半闭眼整帧（对应原 half.png）</td><td>推荐</td></tr>
    <tr><td>口型 · 全开</td><td><code>mouth/g{c}r{r}.png</code></td><td>9 张</td><td>各视线方向的张嘴整帧（对应原 open.png）</td><td class="ok">✅</td></tr>
    <tr><td>口型 · 半开</td><td><code>mouth/g{c}r{r}_half.png</code></td><td>9 张</td><td>各视线方向的半张嘴整帧（对应原 half.png）</td><td>推荐</td></tr>
  </table>
  <p class="sub" style="margin-top:10px">必交 18 张（全闭 + 全开）；加半闭/半开共 36 张，过渡更柔和。<code>{c}</code>=左右列（0 左、1 中、2 右），<code>{r}</code>=上下行（0 上、1 中、2 下），与已交付的 <code>gaze/g{c}r{r}.png</code> 一一对应。</p>
</section>

<section>
  <h2>三、九方向头部姿态参照（以已交付视线帧为准）</h2>
  <p>每张补充帧的<b>头部姿态、身体位置必须与对应方向的视线帧完全一致</b>，只有眼睛（闭眼）或嘴巴（张嘴）在动。下图为已交付的九方向视线帧整帧，录制时请逐一对照：</p>
  <div class="grid9">${eyeGrid}</div>
</section>

<section>
  <h2>四、录制方法（Cubism）</h2>
  <ol>
    <li>沿用九方向帧的同一场景与画布（600×800），不要重摆模型。</li>
    <li>对每个视线格位（共 9 个）：先设置好该方向的「视线 X/Y / 头部角度」参数并<b>保持不动</b>。</li>
    <li>在此基础上仅改表情参数，各导出一张：
      <ul>
        <li>「眨眼」= 50% → <code>blink/g{c}r{r}_half.png</code>；= 100% → <code>blink/g{c}r{r}.png</code></li>
        <li>「嘴张合」= 50% → <code>mouth/g{c}r{r}_half.png</code>；= 100% → <code>mouth/g{c}r{r}.png</code></li>
      </ul></li>
    <li>全部透明背景 PNG 导出，文件名严格按上述规则（区分大小写）。</li>
  </ol>
  <div class="callout"><b>批量技巧</b>：在动画工作区把 9 个方向 × 表情参数排成序列，用「批量输出 PNG（序列帧）」一次性导出，再按规则重命名，比逐张导出快得多。</div>
</section>

<section>
  <h2>五、manifest 将改为（由接收方更新，制作者无需处理）</h2>
  <pre>{
  <span class="c">"blink"</span>: {
    "perGaze": true,
    "patterns": {
      "1": "blink/g{c}r{r}_half.png",
      "2": "blink/g{c}r{r}.png"
    }
  },
  <span class="c">"mouth"</span>: {
    "perGaze": true,
    "patterns": {
      "1": "mouth/g{c}r{r}_half.png",
      "2": "mouth/g{c}r{r}.png"
    }
  }
}</pre>
  <p class="sub">应用已内置该模式的支持：某方向的帧缺失时自动回退到已交付的全局帧，因此<b>可以分批交付</b>（先交全闭+全开 18 张即可消除重影，半闭/半开后续补充）。</p>
</section>

<section>
  <h2>六、交付前自查清单</h2>
  <ul class="check">
    <li>每张帧的头部/身体姿态与对应方向的 <code>gaze/g{c}r{r}.png</code> 完全一致（只有眼睛或嘴在动）</li>
    <li>画布 600×800、透明背景 PNG，与已交付素材一致</li>
    <li>命名严格对应：<code>{c}</code> 左中右、<code>{r}</code> 上中下，<code>_half</code> 后缀用于半闭/半开</li>
    <li>闭眼帧在该方向上完全闭合、自然（与该方向睁眼时的眼形衔接）</li>
    <li>张嘴帧在该方向上与闭口状态（视线帧本体）衔接自然</li>
    <li>打包 zip 交付，目录结构：<code>blink/</code> 与 <code>mouth/</code>（与 gaze/ 平级）</li>
  </ul>
</section>

<div class="foot">桌宠伴侣 · 素材补充需求 v1.1 · 生成于 2026-09-26 · 疑问请联系：____________</div>
</div>
</body>
</html>
`;

const out = path.join(ROOT, 'docs', '素材补充需求_每方向眨眼口型.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成:', out, `(${Math.round(html.length / 1024)}KB)`);

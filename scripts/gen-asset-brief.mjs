// 素材收集需求文档生成器：把需求 + 占位猫示意图组装成单个自包含 HTML
// 用法：node scripts/gen-asset-brief.mjs  →  docs/素材收集需求文档.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets-app', 'default');

const svg = (rel) => fs.readFileSync(path.join(ASSETS, rel), 'utf8')
  .replace(/<\?xml[^>]*\?>\s*/g, '').trim();

// 叠层帧：第一层为底图，其余绝对定位覆盖
function frame(layers, caption, opts = {}) {
  const inner = layers.map((s, i) => {
    const cls = i === 0 ? 'lyr' : 'lyr ov' + (opts.badOffset && i === 1 ? ' ov-bad' : '');
    return `<div class="${cls}">${s}</div>`;
  }).join('');
  const cap = caption ? `<figcaption>${caption}</figcaption>` : '';
  return `<figure class="frame-wrap${opts.wide ? ' wide' : ''}"><div class="frame">${inner}</div>${cap}</figure>`;
}

const GAZE_NAMES = [['左上', '正上', '右上'], ['左中', '正前', '右中'], ['左下', '正下', '右下']];
const gazeCells = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
  gazeCells.push(frame([svg(`gaze/g${c}r${r}.svg`)], GAZE_NAMES[r][c]));
}

const pose = svg('poses/idle.svg');
const blinkHalf = svg('blink/half.svg'), blinkClosed = svg('blink/closed.svg');
const mouthHalf = svg('mouth/half.svg'), mouthOpen = svg('mouth/open.svg');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>角色素材收集需求 · 桌宠伴侣</title>
<style>
  :root { --brand:#f59a3e; --ink:#2a2f3a; --sub:#5a6373; --line:#e8ecf2; }
  * { box-sizing:border-box; }
  body { margin:0; padding:28px 20px 60px; background:#f6f7fb; color:var(--ink);
         font-family:"Microsoft YaHei","PingFang SC",system-ui,sans-serif; font-size:15px; line-height:1.7; }
  .page { max-width:860px; margin:0 auto; }
  header.hero { background:linear-gradient(135deg,#ffb25a,#f57e3e); color:#fff; border-radius:16px;
                padding:30px 34px; margin-bottom:26px; }
  header.hero h1 { margin:0 0 6px; font-size:26px; }
  header.hero p { margin:0; opacity:.94; font-size:14px; }
  .meta { font-size:12px; opacity:.85; margin-top:10px; }
  section { background:#fff; border-radius:14px; padding:22px 26px; margin-bottom:20px;
            box-shadow:0 1px 4px rgba(20,30,60,.06); }
  h2 { font-size:18px; margin:0 0 14px; padding-left:12px; border-left:4px solid var(--brand); }
  h3 { font-size:15.5px; margin:20px 0 10px; color:#b06a2a; }
  p, li { color:var(--ink); }
  .sub { color:var(--sub); font-size:13.5px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; }
  th { background:#fdf3e7; color:#8a5a1e; font-weight:600; white-space:nowrap; }
  tr:nth-child(even) td { background:#fbfcfe; }
  .frame-wrap { margin:10px 12px 12px 0; display:inline-block; vertical-align:top; text-align:center; }
  .frame-wrap.wide { display:inline-flex; align-items:flex-end; }
  figure.frame-wrap { margin:10px 12px 12px 0; }
  .frame { position:relative; width:150px; aspect-ratio:3/4; border-radius:10px; overflow:hidden;
           border:1px solid var(--line);
           background:repeating-conic-gradient(#ececec 0% 25%, #ffffff 0% 50%) 0 0 / 18px 18px; }
  .frame-wrap.wide .frame { width:170px; }
  .lyr { position:absolute; inset:0; }
  .lyr svg { width:100%; height:100%; display:block; }
  .ov-bad { transform:translate(16px,12px); }
  figcaption { font-size:12.5px; color:var(--sub); margin-top:6px; }
  .gaze-grid { display:grid; grid-template-columns:repeat(3,150px); gap:12px; }
  .seq { display:flex; flex-wrap:wrap; align-items:flex-end; gap:4px; }
  .arrow { font-size:22px; color:#c2cad6; padding:0 8px 34px; }
  .panel2 { display:flex; gap:26px; flex-wrap:wrap; }
  .tag { display:inline-block; background:#fdf3e7; color:#b06a2a; border-radius:6px;
         padding:1px 8px; font-size:12.5px; margin-right:6px; }
  .ok { color:#1a9e5c; font-weight:600; } .bad { color:#d64545; font-weight:600; }
  code, pre { font-family:Consolas,"Courier New",monospace; }
  pre { background:#1f2430; color:#e8ecf2; border-radius:10px; padding:14px 16px;
        font-size:12.5px; overflow-x:auto; line-height:1.55; }
  pre .c { color:#8fa1b8; }
  .check { list-style:none; padding-left:0; }
  .check li { padding:5px 0 5px 30px; position:relative; }
  .check li::before { content:"☐"; position:absolute; left:4px; color:var(--brand); font-size:17px; }
  .callout { background:#fff8ef; border:1px solid #f5dfc0; border-radius:10px; padding:12px 16px;
             font-size:14px; margin:12px 0; }
  .foot { text-align:center; color:var(--sub); font-size:12.5px; margin-top:8px; }
  @media print {
    body { background:#fff; padding:0; }
    section, header.hero { box-shadow:none; break-inside:avoid; }
    .frame { border:1px solid #ddd; }
  }
</style>
</head>
<body>
<div class="page">

<header class="hero">
  <h1>角色素材收集需求 · 桌宠伴侣</h1>
  <p>从 Live2D 模型录制导出图片素材，用于桌面宠物应用的角色显示（眼神跟随鼠标、眨眼、说话口型）。</p>
  <div class="meta">文档版本 v1 · 2026-09-26 · 示意图使用占位猫演示，正式素材以实际角色为准</div>
</header>

<section>
  <h2>一、一分钟看懂</h2>
  <ul>
    <li><b>统一画布</b>：所有图片用同一个画布尺寸导出，角色在画布中的位置固定不动，只有目标参数（眼睛/嘴/朝向）在变。</li>
    <li><b>两类图</b>：立绘和视线方向帧是<b>完整角色帧</b>；眨眼、口型帧推荐同样导出<b>完整帧</b>（只改眼睛/嘴参数，最不容易出错）。</li>
    <li><b>照模板命名</b>：放进规定的文件夹、按模板命名并填好 manifest，交付后<b>无需改代码</b>直接生效。</li>
  </ul>
</section>

<section>
  <h2>二、交付总览</h2>
  <table>
    <tr><th>类别</th><th>存放目录</th><th>数量</th><th>内容</th><th>必须</th></tr>
    <tr><td>立绘（姿态）</td><td>poses/</td><td>1～4 张</td><td>完整角色整帧，不同姿态（待机必交，其他姿态可选）</td><td>✅ 至少 1 张</td></tr>
    <tr><td>视线方向帧</td><td>gaze/</td><td>9 张（3×3）</td><td>只动视线/头部朝向的整帧，覆盖 9 个注视方向</td><td>✅</td></tr>
    <tr><td>眨眼帧</td><td>blink/</td><td>2 张</td><td>半闭、全闭（睁开状态直接用底图，不用单独给）</td><td>✅</td></tr>
    <tr><td>口型帧</td><td>mouth/</td><td>2 张（可 4 张）</td><td>半开、全开（闭口状态直接用底图）</td><td>✅</td></tr>
    <tr><td>主题氛围元素</td><td>自定</td><td>不限</td><td>夜间装饰等，可后续补交</td><td>可选</td></tr>
  </table>
  <p class="sub" style="margin-top:10px">统一规格：透明背景 PNG-24；画布建议 600×800（竖版，也可 1024×1280）；所有帧尺寸必须完全一致；单张 ≤ 2MB。</p>
</section>

<section>
  <h2>三、各类素材详细要求（含示意图）</h2>

  <h3>1. 立绘 poses/</h3>
  <p>完整角色、透明背景，姿态自然。必交一张默认待机（<code>idle</code>）；如有其他常用姿态（开心、疑问等）一并交付，命名对应 manifest。</p>
  ${frame([pose], '待机 idle（必交）')}${frame([pose], '其他姿态示例（可选）', { badOffset: false })}
  <p class="sub">导出后会在应用中缩放显示，画布内角色尽量占满高度、四周留少量边距。</p>

  <h3>2. 视线方向帧 gaze/（3×3 共 9 张）</h3>
  <p>应用会让角色眼神跟随屏幕上的鼠标——鼠标在角色的 9 个方位时切换到对应帧。录制时<b>只改视线（和头部朝向）参数</b>，身体、表情、位置全部保持与立绘一致，否则切换时会"跳"。</p>
  <p><span class="tag">命名规则</span><code>g{c}r{r}.png</code>：g=左右列（g0 看左、g1 正中、g2 看右），r=上下行（r0 看上、r1 正中、r2 看下）。</p>
  <div class="gaze-grid">${gazeCells.join('\n')}</div>
  <p class="sub">想更顺滑可升级 5×5（25 张，g0～g4 / r0～r4），manifest 里把 cols/rows 改成 5 即可。</p>

  <h3>3. 眨眼帧 blink/（2 张）</h3>
  <p>待机时角色自动眨眼。把"眨眼（开闭）"参数分别设为约 <b>50%</b> 和 <b>100%</b> 导出两张；<b>睁开状态不需要单独导出</b>（直接显示底图）。推荐整帧导出（只动眨眼参数，其余归零）。</p>
  <div class="seq">
    ${frame([pose], '睁开 = 底图')}
    <span class="arrow">→</span>
    ${frame([pose, blinkHalf], 'half.png 半闭')}
    <span class="arrow">→</span>
    ${frame([pose, blinkClosed], 'closed.png 全闭')}
    <span class="arrow">→</span>
    ${frame([pose], '回到睁开')}
  </div>

  <h3>4. 口型帧 mouth/（2～4 张）</h3>
  <p>角色说话时口型随音量开合。把"嘴张合"参数设为约 <b>50%</b>、<b>100%</b> 导出；<b>闭口不需要单独导出</b>。若愿意多录两档（25%/75%）效果更细腻，manifest 中按 level 顺序登记。</p>
  <div class="seq">
    ${frame([pose], '闭口 = 底图')}
    <span class="arrow">→</span>
    ${frame([pose, mouthHalf], 'half.png 半开')}
    <span class="arrow">→</span>
    ${frame([pose, mouthOpen], 'open.png 全开')}
  </div>
</section>

<section>
  <h2>四、对齐规范（最重要）</h2>
  <p>应用通过<b>逐帧叠加切换</b>来实现动画：所有帧的画布、角色位置必须完全一致，只允许目标参数变化。错位会导致运行时角色<b>抖动 / 鬼影</b>。</p>
  <div class="panel2">
    ${frame([pose, blinkClosed], '<span class="ok">✓ 正确：与底图完全对齐</span>')}
    ${frame([pose, blinkClosed], '<span class="bad">✗ 错误：帧整体偏移 → 抖动</span>', { badOffset: true })}
  </div>
  <div class="callout">
    <b>自查方法</b>：把"底图 + 眨眼全闭帧"两张图放进 Photoshop/PPT 叠在一起，来回切换图层可见性——只有眼睛在变、画面其他部分纹丝不动即为合格。方向帧同理，切换 9 张时只有眼神在动。
  </div>
</section>

<section>
  <h2>五、Live2D Cubism 导出步骤</h2>
  <ol>
    <li><b>建场景</b>：动画工作区新建场景，画布设为目标尺寸（如 600×800），摆好默认姿势并固定模型位置。</li>
    <li><b>立绘</b>：所有参数归默认值，导出 <code>poses/idle.png</code>；其他姿态逐个摆好导出。</li>
    <li><b>视线 9 帧</b>：其余参数归零，仅把「视线 X / 视线 Y」（或头部角度参数）依次设到 9 个格位，逐格导出 <code>gaze/g{c}r{r}.png</code>。</li>
    <li><b>眨眼 2 帧</b>：仅把「眨眼」参数设为 50% / 100%，其余归零，导出 <code>blink/half.png</code>、<code>blink/closed.png</code>。</li>
    <li><b>口型 2 帧</b>：仅把「嘴张合」参数设为 50% / 100%，导出 <code>mouth/half.png</code>、<code>mouth/open.png</code>。</li>
    <li>全部使用<b>透明背景</b>（PNG）导出，不要带背景色。</li>
  </ol>
  <p class="sub">提示：用动画工作区的「批量输出 PNG（序列帧）」功能最方便；每帧文件名按上面规则重命名即可。</p>
</section>

<section>
  <h2>六、交付内容与方式</h2>
  <p>把以下目录打包 zip 交付（manifest.json 由制作者或接收方按模板填写均可）：</p>
  <pre><span class="c">角色素材包/</span>
├── manifest.json
├── CREDITS.md          <span class="c">（来源与授权说明：模型名、制作者、授权范围）</span>
├── poses/
│   ├── idle.png        <span class="c">（必交）</span>
│   └── happy.png       <span class="c">（可选，其他姿态同理）</span>
├── gaze/
│   ├── g0r0.png  g1r0.png  g2r0.png
│   ├── g0r1.png  g1r1.png  g2r1.png
│   └── g0r2.png  g1r2.png  g2r2.png
├── blink/
│   ├── half.png
│   └── closed.png
└── mouth/
    ├── half.png
    └── open.png</pre>

  <h3>manifest.json 模板（PNG 版）</h3>
  <pre>{
  <span class="c">"name"</span>: "角色名",
  <span class="c">"version"</span>: 1,
  <span class="c">"canvas"</span>: { "width": 600, "height": 800 },
  <span class="c">"poses"</span>: [
    { "id": "idle",  "name": "待机", "src": "poses/idle.png" },
    { "id": "happy", "name": "开心", "src": "poses/happy.png" }
  ],
  <span class="c">"gaze"</span>:   { "pose": "idle", "cols": 3, "rows": 3, "srcPattern": "gaze/g{c}r{r}.png" },
  <span class="c">"blink"</span>:  { "frames": [ { "level": 1, "src": "blink/half.png" },
                           { "level": 2, "src": "blink/closed.png" } ] },
  <span class="c">"mouth"</span>:  { "frames": [ { "level": 1, "src": "mouth/half.png" },
                           { "level": 2, "src": "mouth/open.png" } ] },
  <span class="c">"themes"</span>: { "day": { "name": "日间", "starCount": 0 },
              "night": { "name": "夜间", "starCount": 60 } },
  <span class="c">"testAudio"</span>: "audio/test.wav"
}</pre>
  <p class="sub">注：多姿态时，眨眼/口型帧基于默认姿态（idle）录制即可；若各姿态五官位置差异大，先保证 idle 效果，其余姿态后续再扩展。</p>
</section>

<section>
  <h2>七、交付前自查清单</h2>
  <ul class="check">
    <li>所有图片画布尺寸完全一致（同一场景导出）</li>
    <li>全部为透明背景 PNG，无背景色块</li>
    <li>角色在画布中位置固定：逐帧切换时只有眼睛/嘴在动</li>
    <li>视线 9 帧方向正确（g0 左 / g2 右，r0 上 / r2 下），身体与表情无变化</li>
    <li>眨眼半闭/全闭过渡自然，闭合时眼睛完全闭上</li>
    <li>口型半开/全开与底图闭口过渡自然</li>
    <li>文件命名与 manifest 模板一致（区分大小写）</li>
    <li>已附 CREDITS.md（模型来源、制作者、授权范围）</li>
  </ul>
  <div class="callout">最低可用交付：立绘 1 张 + 眨眼 2 张 + 口型 2 张也可以先跑起来（视线跟随自动停用）；但<b>完整交付</b>才能获得全部效果，建议一次录齐。</div>
</section>

<div class="foot">桌宠伴侣 · 素材收集需求文档 v1 · 生成于 2026-09-26 · 疑问请联系：____________</div>
</div>
</body>
</html>
`;

const out = path.join(ROOT, 'docs', '素材收集需求文档.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成:', out, `(${Math.round(html.length / 1024)}KB, 示意图 ${14} 张内嵌)`);

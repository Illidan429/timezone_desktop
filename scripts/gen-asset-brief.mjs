// 素材收集需求文档生成器（完整版 v1.3）：需求 + 占位猫示意图 → 单个自包含 HTML
// 工作方式：甲方提供正面参考图，画师据参考图绘制全套素材（非 Live2D 导出）
// 用法：
//   PLACEHOLDER_OUT=.tmp-brief-assets node scripts/gen-placeholder-assets.mjs   # 先生成示意图素材
//   node scripts/gen-asset-brief.mjs                                            # 再生成文档
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSETS = process.env.PLACEHOLDER_OUT
  ? path.join(ROOT, process.env.PLACEHOLDER_OUT)
  : path.join(ROOT, '.tmp-brief-assets');

const svg = (rel) => fs.readFileSync(path.join(ASSETS, rel), 'utf8')
  .replace(/<\?xml[^>]*\?>\s*/g, '').trim();

const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
// 正面参考图（存在则嵌入文档）
const REF = path.join(ROOT, 'docs', 'reference-front.png');
const refImg = fs.existsSync(REF) ? b64(REF) : null;

// 叠层帧：第一层为底图，其余绝对定位覆盖
function frame(layers, caption, opts = {}) {
  const inner = layers.map((s, i) => {
    const cls = i === 0 ? 'lyr' : 'lyr ov' + (opts.badOffset && i === 1 ? ' ov-bad' : '');
    return `<div class="${cls}">${s}</div>`;
  }).join('');
  const cap = caption ? `<figcaption>${caption}</figcaption>` : '';
  return `<figure class="frame-wrap"><div class="frame">${inner}</div>${cap}</figure>`;
}

const GAZE_NAMES = [['左上', '正上', '右上'], ['左中', '正前', '右中'], ['左下', '正下', '右下']];
const gazeCells = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
  gazeCells.push(frame([svg(`gaze/g${c}r${r}.svg`)], GAZE_NAMES[r][c]));
}

const pose = svg('poses/idle.svg');
const blinkHalf = svg('blink/half.svg'), blinkClosed = svg('blink/closed.svg');
const mouthHalf = svg('mouth/half.svg'), mouthOpen = svg('mouth/open.svg');

const refSection = refImg ? `
  <h3>正面参考图（甲方提供）</h3>
  <p>所有帧以这张正面参考图为唯一基准，保持角色脸型、发型、服装、配饰完全一致：</p>
  <figure class="ref-wrap"><img class="ref-img" src="${refImg}" alt="正面参考图">
  <figcaption>正面参考图（675×874，角色站姿）——交付帧的角色必须与之一致</figcaption></figure>` : '';

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>角色素材绘制需求（完整版）· 桌宠伴侣</title>
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
  figure.frame-wrap { margin:10px 12px 12px 0; }
  .frame { position:relative; width:150px; aspect-ratio:3/4; border-radius:10px; overflow:hidden;
           border:1px solid var(--line);
           background:repeating-conic-gradient(#ececec 0% 25%, #ffffff 0% 50%) 0 0 / 18px 18px; }
  .lyr { position:absolute; inset:0; }
  .lyr svg { width:100%; height:100%; display:block; }
  .ov-bad { transform:translate(16px,12px); }
  figcaption { font-size:12.5px; color:var(--sub); margin-top:6px; }
  .ref-wrap { margin:0; text-align:center; }
  .ref-img { max-width:320px; width:100%; border-radius:10px; border:1px solid var(--line);
             background:repeating-conic-gradient(#ececec 0% 25%, #ffffff 0% 50%) 0 0 / 18px 18px; }
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
    .frame, .ref-img { border:1px solid #ddd; }
  }
</style>
</head>
<body>
<div class="page">

<header class="hero">
  <h1>角色素材绘制需求（完整版）· 桌宠伴侣</h1>
  <p>以甲方提供的正面参考图为基准，绘制桌面宠物应用所需的整套角色图片：眼神跟随鼠标、待机眨眼、说话口型——覆盖全部视角方向。</p>
  <div class="meta">文档版本 v1.3 · 2026-09-26 · 文中示意图使用占位猫演示画法要求，正式素材以参考图角色为准 · 本文档为唯一完整需求，请勿使用旧版</div>
</header>

<section>
  <h2>一、一分钟看懂</h2>
  <ul>
    <li><b>以参考图为基准</b>：甲方提供正面参考图，全套素材的角色形象必须与参考图完全一致；建议先出九方向姿态草图给甲方确认，再细化全套。</li>
    <li><b>统一画布</b>：所有图用同一画布（建议 600×800 竖版、透明背景 PNG），角色在画布中位置稳定、不漂移。</li>
    <li><b>三类图</b>：立绘 / 视线方向帧（<b>头部与身体随方向自然变换姿态</b>，不只是动眼睛）/ 每方向的眨眼与口型帧。</li>
    <li><b>照模板命名</b>：放进规定文件夹、按模板命名并填好 manifest，交付后<b>无需改代码</b>直接生效。</li>
  </ul>
</section>

<section>
  <h2>二、交付总览</h2>
  <table>
    <tr><th>类别</th><th>存放目录</th><th>数量</th><th>内容</th><th>必须</th></tr>
    <tr><td>立绘（姿态）</td><td>poses/</td><td>1～4 张</td><td>完整角色，不同姿态（待机必交）</td><td class="ok">✅ 至少 1 张</td></tr>
    <tr><td>视线方向帧</td><td>gaze/</td><td>9 张（3×3）</td><td>头部与身体随视线方向自然变换姿态的整帧</td><td class="ok">✅</td></tr>
    <tr><td>眨眼 · 全闭</td><td>blink/</td><td>9 张</td><td>每个视线方向一张闭眼整帧 <code>g{c}r{r}.png</code></td><td class="ok">✅</td></tr>
    <tr><td>眨眼 · 半闭</td><td>blink/</td><td>9 张</td><td>每个视线方向一张半闭眼整帧 <code>g{c}r{r}_half.png</code></td><td>推荐</td></tr>
    <tr><td>口型 · 全开</td><td>mouth/</td><td>9 张</td><td>每个视线方向一张张嘴整帧 <code>g{c}r{r}.png</code></td><td class="ok">✅</td></tr>
    <tr><td>口型 · 半开</td><td>mouth/</td><td>9 张</td><td>每个视线方向一张半张嘴整帧 <code>g{c}r{r}_half.png</code></td><td>推荐</td></tr>
    <tr><td>主题氛围元素</td><td>自定</td><td>不限</td><td>夜间装饰等，可后续补交</td><td>可选</td></tr>
  </table>
  <p class="sub" style="margin-top:10px">必交合计 <b>28 张</b>（立绘1 + 视线9 + 全闭9 + 全开9）；加半闭/半开共 <b>46 张</b>，过渡更柔和。<br>
  统一规格：透明背景 PNG-24；画布 600×800（也可 1024×1280）；所有帧尺寸完全一致；单张 ≤ 2MB。</p>
</section>

<section>
  <h2>三、各类素材详细要求（含示意图）</h2>
  ${refSection}

  <h3>1. 立绘 poses/</h3>
  <p>以参考图为基准绘制，透明背景，姿态自然。必交一张默认待机（<code>idle</code>，与参考图站姿一致）；如有其他常用姿态（开心、疑问等）一并交付，命名对应 manifest。</p>
  ${frame([pose], '待机 idle（必交）')}${frame([pose], '其他姿态示例（可选）')}
  <p class="sub">应用中会缩放显示，画布内角色尽量占满高度、四周留少量边距。</p>

  <h3>2. 视线方向帧 gaze/（3×3 共 9 张）</h3>
  <p>应用会让角色眼神跟随屏幕上的鼠标——鼠标在角色的 9 个方位时切换到对应帧。<b>要求头部与身体随方向自然变换姿态</b>：头部朝向与倾斜、肩颈与上身重心随动，像真人转头看东西一样；只动眼睛会显得僵硬，不符合要求。</p>
  <ul>
    <li>姿态变化要<b>自然连贯</b>：九张帧依次切换像一段连续动作，不是九张独立的画；</li>
    <li>角色<b>整体位置稳定</b>：画布锚点一致，不能整体漂移或忽大忽小；</li>
    <li>除头部/上身随动外，服装、配饰、表情基调与参考图保持一致。</li>
  </ul>
  <p><span class="tag">命名规则</span><code>g{c}r{r}.png</code>：g=左右列（g0 看左、g1 正中、g2 看右），r=上下行（r0 看上、r1 正中、r2 看下）。<b>正中帧 g1r1 与待机立绘一致。</b></p>
  <div class="gaze-grid">${gazeCells.join('\n')}</div>
  <p class="sub">想更顺滑可升级 5×5（25 张，g0～g4 / r0～r4），manifest 里把 cols/rows 改成 5 即可。</p>

  <h3>3. 眨眼帧 blink/（每方向 1～2 张，共 9～18 张）</h3>
  <p>待机时角色自动眨眼。因为视线帧的头部/身体姿态随方向变化，眨眼帧必须<b>逐方向绘制</b>：在对应方向视线帧的画稿上，仅把眼睛画成半闭（<code>_half</code>）或全闭，其余部分与该方向视线帧完全相同。睁开状态不需要单独画（直接使用视线帧本体）。</p>
  <p><span class="tag">命名规则</span>全闭 <code>blink/g{c}r{r}.png</code>；半闭 <code>blink/g{c}r{r}_half.png</code>。例如看向左上时眨眼的全闭帧是 <code>blink/g0r0.png</code>。</p>
  <div class="seq">
    ${frame([pose], '睁开 = 视线帧本体')}
    <span class="arrow">→</span>
    ${frame([pose, blinkHalf], '半闭 _half')}
    <span class="arrow">→</span>
    ${frame([pose, blinkClosed], '全闭')}
    <span class="arrow">→</span>
    ${frame([pose], '回到睁开')}
  </div>

  <h3>4. 口型帧 mouth/（每方向 1～2 张，共 9～18 张）</h3>
  <p>角色说话时口型随音量开合，与眨眼同理<b>逐方向绘制</b>：在对应方向视线帧的画稿上，仅把嘴巴画成半张（<code>_half</code>）或全张。闭口状态不需要单独画（直接使用视线帧本体）。</p>
  <p><span class="tag">命名规则</span>全开 <code>mouth/g{c}r{r}.png</code>；半开 <code>mouth/g{c}r{r}_half.png</code>。</p>
  <div class="seq">
    ${frame([pose], '闭口 = 视线帧本体')}
    <span class="arrow">→</span>
    ${frame([pose, mouthHalf], '半开 _half')}
    <span class="arrow">→</span>
    ${frame([pose, mouthOpen], '全开')}
  </div>
  <div class="callout"><b>高效画法建议</b>：在同一源文件（PSD/Procreate 等）中分层管理——身体与头部分方向建组，眼睛（开/半闭/闭）与嘴（闭/半/全）做成可替换图层组，组合导出可批量产出全部帧，并天然保证同方向帧之间只有眼睛/嘴在动。</div>
</section>

<section>
  <h2>四、对齐规范（最重要）</h2>
  <p>应用通过<b>逐帧切换</b>实现动画，对齐分两个层面：</p>
  <ul>
    <li><b>帧间锚点一致</b>：所有帧同一画布，角色整体位置稳定——九方向视线帧切换时，姿态可以变，但角色不能整体漂移、忽大忽小或跳出画布；</li>
    <li><b>同方向覆盖帧严格对齐</b>：每方向的闭眼/张嘴帧与<b>该方向</b>的视线帧叠合时，必须只有眼睛或嘴在变，其余每一笔都重合。</li>
  </ul>
  <div class="panel2">
    ${frame([pose, blinkClosed], '<span class="ok">✓ 正确：与底图完全对齐</span>')}
    ${frame([pose, blinkClosed], '<span class="bad">✗ 错误：帧整体偏移 → 重影</span>', { badOffset: true })}
  </div>
  <div class="callout">
    <b>自查方法</b>：把「某方向视线帧 + 该方向闭眼帧」叠在一起，来回切换图层可见性——只有眼睛在变、其他纹丝不动即为合格；9 个方向逐一检查。九方向帧之间连续切换检查姿态过渡是否自然。
  </div>
</section>

<section>
  <h2>五、绘制与交付流程</h2>
  <ol>
    <li><b>确认参考</b>：以甲方正面参考图为基准建立画布（600×800，角色占满高度、四周留少量边距）。</li>
    <li><b>九方向姿态草图</b>：先画 9 个方向的姿态草图（头部+身体随动）交甲方确认，<b>确认后再细化全套</b>，避免返工。</li>
    <li><b>细化视线 9 帧</b>：按确认的草图细化，导出 <code>gaze/g{c}r{r}.png</code>。</li>
    <li><b>每方向眨眼 18 张</b>：在对应方向画稿上仅改眼睛为半闭/全闭，导出 <code>blink/g{c}r{r}_half.png</code>、<code>blink/g{c}r{r}.png</code>。</li>
    <li><b>每方向口型 18 张</b>：在对应方向画稿上仅改嘴为半张/全张，导出 <code>mouth/g{c}r{r}_half.png</code>、<code>mouth/g{c}r{r}.png</code>。</li>
    <li>全部<b>透明背景</b> PNG 导出，按命名规则命名。</li>
  </ol>
  <p class="sub">分批交付是允许的：先交「立绘 + 视线 9 帧」即可让角色上桌；眨眼/口型的每方向帧按批补交（应用对缺失帧自动回退，不会出错）。</p>
</section>

<section>
  <h2>六、交付内容与方式</h2>
  <p>把以下目录打包 zip 交付（manifest.json 由制作者或接收方按模板填写均可）：</p>
  <pre><span class="c">角色素材包/</span>
├── manifest.json
├── CREDITS.md          <span class="c">（来源与授权说明：原图作者、制作者、授权范围）</span>
├── poses/
│   ├── idle.png        <span class="c">（必交）</span>
│   └── happy.png       <span class="c">（可选，其他姿态同理）</span>
├── gaze/
│   ├── g0r0.png  g1r0.png  g2r0.png
│   ├── g0r1.png  g1r1.png  g2r1.png
│   └── g0r2.png  g1r2.png  g2r2.png
├── blink/
│   ├── g0r0.png  g1r0.png  g2r0.png   <span class="c">（全闭）</span>
│   ├── g0r1.png  g1r1.png  g2r1.png
│   ├── g0r2.png  g1r2.png  g2r2.png
│   └── *_half.png                     <span class="c">（半闭 9 张，命名如 g0r0_half.png）</span>
└── mouth/
    ├── g0r0.png  g1r0.png  g2r0.png   <span class="c">（全开）</span>
    ├── g0r1.png  g1r1.png  g2r1.png
    ├── g0r2.png  g1r2.png  g2r2.png
    └── *_half.png                     <span class="c">（半开 9 张）</span></pre>

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
  <span class="c">"blink"</span>:  {
    "perGaze": true,
    "patterns": {
      "1": "blink/g{c}r{r}_half.png",
      "2": "blink/g{c}r{r}.png"
    },
    "frames": [ { "level": 2, "src": "blink/g1r1.png" },
                { "level": 1, "src": "blink/g1r1_half.png" } ]
  },
  <span class="c">"mouth"</span>:  {
    "perGaze": true,
    "patterns": {
      "1": "mouth/g{c}r{r}_half.png",
      "2": "mouth/g{c}r{r}.png"
    },
    "frames": [ { "level": 2, "src": "mouth/g1r1.png" },
                { "level": 1, "src": "mouth/g1r1_half.png" } ]
  },
  <span class="c">"themes"</span>: { "day": { "name": "日间", "starCount": 0 },
              "night": { "name": "夜间", "starCount": 60 } },
  <span class="c">"testAudio"</span>: "audio/test.wav"
}</pre>
  <p class="sub">说明：<code>blink/mouth</code> 用 perGaze 模式逐方向加载；<code>frames</code> 引用正中方向（g1r1）的图作为兜底——某方向帧意外缺失时自动回退，不会出错。多姿态时全部表情帧基于默认姿态（idle）方向组绘制。</p>
</section>

<section>
  <h2>七、交付前自查清单</h2>
  <ul class="check">
    <li>所有图片画布尺寸完全一致，透明背景 PNG 无背景色块</li>
    <li>角色形象与参考图完全一致（脸型、发型、服装、配饰）</li>
    <li>角色在画布中位置稳定：九方向帧连续切换姿态过渡自然、不漂移不跳变</li>
    <li>视线帧的头部与身体随方向变化，不是只动眼睛</li>
    <li>视线 9 帧方向正确（g0 左 / g2 右，r0 上 / r2 下）</li>
    <li>每方向闭眼帧与该方向视线帧叠合检查通过（9 组）：只有眼睛在变</li>
    <li>每方向张嘴帧与该方向视线帧叠合检查通过（9 组）：只有嘴在变</li>
    <li>半闭/半开帧位于睁开与全闭/全开之间，无跳变</li>
    <li>文件命名与 manifest 模板一致（区分大小写，<code>_half</code> 后缀）</li>
    <li>已附 CREDITS.md（原图作者、制作者、授权范围）</li>
  </ul>
  <div class="callout">分批交付建议：第一批「立绘 + 九方向姿态草图」确认 → 第二批「视线 9 帧」（角色上桌）→ 第三批「每方向全闭 + 全开 18 张」（消除眨眼/说话重影）→ 第四批「半闭/半开 18 张」（过渡更柔和）。每批都独立可用。</div>
</section>

<div class="foot">桌宠伴侣 · 角色素材绘制需求（完整版 v1.3）· 生成于 2026-09-26 · 疑问请联系：____________</div>
</div>
</body>
</html>
`;

const out = path.join(ROOT, 'docs', '素材收集需求文档.html');
fs.writeFileSync(out, html, 'utf8');
console.log('已生成:', out, `(${Math.round(html.length / 1024)}KB)`);

// 素材清单加载与校验：缺字段给出明细，坏文件可降级
export const ASSET_BASE = 'app://assets/default/';

export async function loadManifest() {
  const result = { ok: false, manifest: null, missing: [], broken: [] };
  let raw;
  try {
    const res = await fetch(ASSET_BASE + 'manifest.json');
    if (!res.ok) throw new Error(`manifest.json 加载失败 (${res.status})`);
    raw = await res.json();
  } catch (e) {
    result.missing.push('manifest.json 无法加载：' + e.message);
    return result;
  }
  const m = raw;
  if (!Array.isArray(m.poses) || m.poses.length === 0) result.missing.push('poses（立绘列表缺失）');
  if (m.gaze) {
    if (!m.gaze.cols || !m.gaze.rows) result.missing.push('gaze.cols / gaze.rows');
    if (!m.gaze.srcPattern) result.missing.push('gaze.srcPattern');
  }
  if (m.blink && !Array.isArray(m.blink.frames)) result.missing.push('blink.frames');
  if (m.mouth && !Array.isArray(m.mouth.frames)) result.missing.push('mouth.frames');
  result.manifest = m;
  result.ok = result.missing.length === 0;
  return result;
}

export function assetUrl(src) {
  return ASSET_BASE + src;
}

// 预加载图片，单个失败不阻塞（记入 broken）
export function preloadImages(urls) {
  return Promise.all(urls.map(u => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ url: u, ok: true, img });
    img.onerror = () => resolve({ url: u, ok: false });
    img.src = u;
  })));
}

// 依清单枚举全部图片资源地址
export function collectImageUrls(m) {
  const urls = [];
  for (const p of m.poses || []) urls.push(assetUrl(p.src));
  if (m.gaze?.srcPattern) {
    for (let r = 0; r < m.gaze.rows; r++)
      for (let c = 0; c < m.gaze.cols; c++)
        urls.push(assetUrl(m.gaze.srcPattern.replace('{c}', c).replace('{r}', r)));
  }
  for (const f of m.blink?.frames || []) urls.push(assetUrl(f.src));
  for (const f of m.mouth?.frames || []) urls.push(assetUrl(f.src));
  return urls;
}

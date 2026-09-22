// 渲染端打包：两个入口 → 经典 IIFE 脚本（规避自定义协议上的 ESM 模块加载限制）
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = (...p) => path.join(__dirname, '..', ...p);

const common = {
  bundle: true,
  format: 'iife',
  target: 'chrome130',
  minify: false,
  logLevel: 'info'
};

await esbuild.build({
  ...common,
  entryPoints: [r('app', 'renderer', 'pet', 'src', 'main.js')],
  outfile: r('app', 'renderer', 'pet', 'bundle.js')
});

await esbuild.build({
  ...common,
  entryPoints: [r('app', 'renderer', 'settings', 'src', 'main.js')],
  outfile: r('app', 'renderer', 'settings', 'bundle.js')
});

console.log('渲染端打包完成');

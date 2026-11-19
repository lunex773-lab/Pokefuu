// dist-single/ のJSを index.html に埋め込み、1ファイルで遊べる HTML を作る
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-single';
let html = readFileSync(join(dir, 'index.html'), 'utf8');
const assets = readdirSync(join(dir, 'assets'));
html = html.replace(/<script type="module" crossorigin src="\.\/assets\/([^"]+)"><\/script>/, (_m, file) => {
  const js = readFileSync(join(dir, 'assets', file), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
const left = html.match(/(src|href)="\.\/assets\//g);
if (left) throw new Error(`未埋め込みのアセットがあります: ${assets.join(', ')}`);
writeFileSync(join(dir, 'pokefuu.html'), html);
console.log(`dist-single/pokefuu.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

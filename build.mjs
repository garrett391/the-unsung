import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'esm',
  external: ['three'],
  write: false,
  target: 'es2020',
  minify: false,
  legalComments: 'none',
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync('template.html', 'utf8');
const html = tpl.replace('/*__GAME__*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('built dist/index.html', (html.length / 1024).toFixed(1) + ' KB');

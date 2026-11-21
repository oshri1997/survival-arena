import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
await rm('dist-demo', { recursive: true, force: true });
await mkdir('dist-demo');
for (const path of ['assets', 'fonts', 'favicon.svg'])
  await cp(`dist/${path}`, `dist-demo/${path}`, { recursive: true });
const html = await readFile('dist/teams-demo.html', 'utf8');
await writeFile('dist-demo/index.html', html);
await writeFile('dist-demo/teams-demo.html', html);
console.log(
  'Static local demo prepared in dist-demo/. The full networked game requires the Node server.',
);

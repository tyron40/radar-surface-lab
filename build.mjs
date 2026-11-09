import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'radar.mjs', 'geotiff-import.mjs', 'lumberton-florence.json']) {
  await copyFile(file, `dist/${file}`);
}
await copyFile('node_modules/geotiff/dist-browser/geotiff.js', 'dist/geotiff.js');
await copyFile('node_modules/geotiff/dist-browser/geotiff.js.map', 'dist/geotiff.js.map');
await copyFile('node_modules/geotiff/LICENSE', 'dist/geotiff-LICENSE.txt');

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { analyze, sampleScene, validateScene } from './radar.mjs';

test('detects inclusive drop and cutoff, excludes existing water and missing observations', () => {
  const result = analyze({ before: [-13, -17, -14, -10, null, -10], after: [-17, -22, -17, -18, -22, null] }, 4, -17);
  assert.deepEqual([...result.mask], [2, 1, 1, 2, 0, 0]);
  assert.equal(result.candidates, 2);
  assert.equal(result.comparable, 4);
  assert.equal(result.share, .5);
});

test('omits the share when the observations never overlap', () => {
  assert.equal(analyze({ before: [-12, null], after: [null, -20] }, 4, -17).share, null);
});

test('validates the generated sample and rejects malformed imports', () => {
  const scene = validateScene(sampleScene());
  assert.ok(analyze(scene, 4, -17).candidates > 0);
  assert.throws(() => validateScene({ ...scene, before: ['-22'] }), /grid/);
  assert.throws(() => validateScene({ ...scene, width: 769 }), /dimensions/);
  assert.throws(() => validateScene({ ...scene, units: 'power' }), /in dB/);
});

test('the bundled satellite scene is comparable and includes its provenance', async () => {
  const asset = new URL('./lumberton-florence.json', import.meta.url);
  const scene = validateScene(JSON.parse(await readFile(asset, 'utf8')));
  assert.equal(scene.synthetic, false);
  assert.equal(scene.provenance.relativeOrbit, 77);
  assert.equal(scene.provenance.observations.length, 2);
  const result = analyze(scene, 4, -17);
  assert.ok(result.comparable > 0);
  assert.ok(result.candidates > 0 && result.candidates < result.comparable);
});

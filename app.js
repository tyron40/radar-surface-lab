import { analyze, MAX_FILE_BYTES, sampleScene, validateScene } from './radar.mjs';

const byId = id => document.getElementById(id);
const canvas = byId('raster');
const context = canvas.getContext('2d');
const modes = [...document.querySelectorAll('[data-mode]')];
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 });
const legend = {
  before: 'Before · dark to bright backscatter (−30 to −5 dB).',
  after: 'After · dark to bright backscatter (−30 to −5 dB).',
  change: 'Change · blue means lower after, orange means higher after. Color saturates at ±12 dB.',
  candidates: 'Flood candidates · mint marks newly dark pixels. Blue-black marks missing data.',
};
let scene = sampleScene();
let satelliteScene;
let mode = 'candidates';
let loadAttempt = 0;
let summary;

function grayscale(db) {
  const intensity = Math.round(28 + 200 * Math.min(1, Math.max(0, (db + 30) / 25)));
  return [intensity, intensity, intensity];
}

function color(index, mask) {
  const before = scene.before[index];
  const after = scene.after[index];
  if (mode === 'before' || mode === 'after') {
    const value = mode === 'before' ? before : after;
    return value === null ? [11, 22, 29] : grayscale(value);
  }
  if (!mask[index]) return [11, 22, 29];
  if (mode === 'candidates') {
    if (mask[index] === 2) return [87, 227, 181];
    const [shade] = grayscale(after);
    return [shade * .45, shade * .58, shade * .63];
  }
  const delta = after - before;
  const amount = Math.min(1, Math.abs(delta) / 12);
  const target = delta < 0 ? [66, 174, 242] : [247, 154, 76];
  return target.map(channel => 35 + (channel - 35) * amount);
}

function render() {
  const minimumDrop = Number(byId('drop').value);
  const darkCutoff = Number(byId('ceiling').value);
  const { mask, comparable, candidates, share } = analyze(scene, minimumDrop, darkCutoff);
  const { width, height, title, synthetic } = scene;
  summary = { title, synthetic, width, height, minimumDropDb: minimumDrop, darkCutoffDb: darkCutoff,
    comparablePixels: comparable, candidatePixels: candidates, candidateFraction: share };
  const isSatelliteExample = scene === satelliteScene;
  const sourceLabel = isSatelliteExample ? 'Satellite example' : synthetic ? 'Synthetic sample' : 'Imported scene';
  byId('source').textContent = `${title} · ${sourceLabel}`;
  byId('satellite-credit').hidden = !isSatelliteExample;
  if (isSatelliteExample) summary.provenance = scene.provenance;
  byId('dimensions').textContent = `${width} × ${height} px`;
  byId('dropValue').textContent = `${minimumDrop} dB`;
  byId('ceilingValue').textContent = `${darkCutoff} dB`;
  byId('comparable').textContent = comparable.toLocaleString();
  byId('candidates').textContent = candidates.toLocaleString();
  byId('share').textContent = share === null ? 'Unavailable' : percent.format(share);
  byId('legend').textContent = legend[mode];
  for (const button of modes) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  canvas.setAttribute('aria-label', legend[mode]);
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `min(100%, ${width * 4}px, ${470 * width / height}px)`;
  const raster = context.createImageData(width, height);
  for (let index = 0; index < mask.length; index++) {
    const [red, green, blue] = color(index, mask);
    const offset = index * 4;
    raster.data[offset] = red;
    raster.data[offset + 1] = green;
    raster.data[offset + 2] = blue;
    raster.data[offset + 3] = 255;
  }
  context.putImageData(raster, 0, 0);
}

for (const button of modes) {
  button.addEventListener('click', () => {
    mode = button.dataset.mode;
    render();
  });
}
for (const id of ['drop', 'ceiling']) byId(id).addEventListener('input', render);

byId('upload').addEventListener('change', async event => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  const attempt = ++loadAttempt;
  const status = byId('status');
  status.classList.remove('error');
  status.textContent = 'Reading scene…';
  try {
    if (file.size > MAX_FILE_BYTES) throw new Error('Scene files must be 32 MiB or smaller.');
    const next = validateScene(JSON.parse(await file.text()));
    if (attempt !== loadAttempt) return;
    scene = next;
    render();
    status.textContent = 'Scene loaded.';
  } catch (error) {
    if (attempt !== loadAttempt) return;
    status.classList.add('error');
    status.textContent = error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message;
  }
});

function selectBuiltInScene(next) {
  scene = next;
  mode = 'candidates';
  byId('upload').value = '';
  byId('drop').value = '4';
  byId('ceiling').value = '-17';
  render();
}

async function loadSatellite() {
  const attempt = ++loadAttempt;
  const status = byId('status');
  status.classList.remove('error');
  status.textContent = 'Loading satellite example…';
  try {
    if (!satelliteScene) {
      const response = await fetch(new URL('./lumberton-florence.json', import.meta.url));
      if (!response.ok) throw new Error('Satellite example unavailable');
      satelliteScene = validateScene(await response.json());
    }
    if (attempt !== loadAttempt) return;
    selectBuiltInScene(satelliteScene);
    status.textContent = '';
  } catch {
    if (attempt !== loadAttempt) return;
    status.classList.add('error');
    status.textContent = 'Could not load the satellite example. Use the synthetic sample or try again.';
  }
}

byId('satellite').addEventListener('click', loadSatellite);
byId('demo').addEventListener('click', () => {
  loadAttempt++;
  byId('status').textContent = '';
  byId('status').classList.remove('error');
  selectBuiltInScene(sampleScene());
});

byId('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'radar-surface-summary.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
render();
loadSatellite();

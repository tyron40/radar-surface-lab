import assert from 'node:assert/strict';
import test from 'node:test';
import { readGeoTiffPair } from './geotiff-import.mjs';

function raster(values, { origin = 500000, mask } = {}) {
  const tags = { ModelTiepoint: [0, 0, 0, origin, 3920000, 0], ModelPixelScale: [10, 10, 0] };
  const image = {
    getGeoKeys: () => ({ ProjectedCSTypeGeoKey: 32617 }),
    getSamplesPerPixel: () => 1,
    getWidth: () => values.length,
    getHeight: () => 1,
    getTileWidth: () => 256,
    getTileHeight: () => 1,
    getFileDirectory: () => ({ getValue: name => tags[name] }),
    readRasters: async ({ window }) => values.slice(window[0], window[2]),
    getGDALNoData: () => -9999,
    getGDALMetadata: async () => null,
  };
  return {
    getImageCount: async () => mask ? 2 : 1,
    getImage: async (index = 0) => index ? {
      ...image,
      getFileDirectory: () => ({ getValue: () => 4 }),
      readRasters: async () => mask,
    } : image,
  };
}

test('GeoTIFF import converts power to dB and applies nodata and internal masks', async () => {
  const before = raster([0.1, 0.01, 0], { mask: [1, 0, 1] });
  const after = raster([0.01, 0.001, -9999]);
  const scene = await readGeoTiffPair(before, after, 'power');
  assert.deepEqual(scene.before, [-10, null, null]);
  assert.deepEqual(scene.after, [-20, -30, null]);
  assert.equal(scene.crs, 'EPSG:32617');
});

test('GeoTIFF import rejects displaced grids and reports the center crop transform', async () => {
  const values = Array(800).fill(-12);
  const before = raster(values);
  await assert.rejects(readGeoTiffPair(before, raster(values, { origin: 500010 }), 'db'), /do not align/);
  const scene = await readGeoTiffPair(before, raster(values), 'db');
  assert.equal(scene.width, 768);
  assert.equal(scene.crop.left, 16);
  assert.equal(scene.transform[2], 500160);
});

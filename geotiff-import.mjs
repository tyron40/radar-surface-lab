import { MAX_SIDE, validateScene } from './radar.mjs';

function describeImage(image) {
  const keys = image.getGeoKeys();
  const crs = keys?.ProjectedCSTypeGeoKey ?? keys?.GeographicTypeGeoKey;
  if (!Number.isInteger(crs) || crs <= 0 || crs >= 32767) {
    throw new Error('Both GeoTIFFs need a recognized EPSG coordinate system.');
  }
  if (image.getSamplesPerPixel() !== 1) {
    throw new Error('Choose single-band GeoTIFFs with matching radar polarization.');
  }

  const tags = image.getFileDirectory();
  const matrix = tags.getValue('ModelTransformation');
  const tie = tags.getValue('ModelTiepoint');
  const scale = tags.getValue('ModelPixelScale');
  let transform;
  if (matrix?.length === 16 && matrix[12] === 0 && matrix[13] === 0 && matrix[15] === 1) {
    transform = [matrix[0], matrix[1], matrix[3], matrix[4], matrix[5], matrix[7]];
  } else if (!matrix && tie?.length === 6 && scale?.length >= 2) {
    const [dx, dy] = scale;
    transform = [dx, 0, tie[3] - tie[0] * dx, 0, -dy, tie[4] + tie[1] * dy];
  }
  if (!transform?.every(Number.isFinite) || transform[0] * transform[4] === transform[1] * transform[3]) {
    throw new Error('Both GeoTIFFs need a valid affine pixel grid.');
  }
  return { crs, transform, rasterType: keys.GTRasterTypeGeoKey ?? 1, width: image.getWidth(), height: image.getHeight() };
}

async function readWindow(tiff, image, window, units, signal) {
  const [left, top, right, bottom] = window;
  const tilesAcross = Math.ceil(right / image.getTileWidth()) - Math.floor(left / image.getTileWidth());
  const tilesDown = Math.ceil(bottom / image.getTileHeight()) - Math.floor(top / image.getTileHeight());
  if (tilesAcross * tilesDown * image.getTileWidth() * image.getTileHeight() > 16_000_000) {
    throw new Error('This TIFF uses large image blocks. Try a tiled GeoTIFF or a smaller export.');
  }

  const options = { window, interleave: true, signal };
  const raw = await image.readRasters(options);
  const nodata = image.getGDALNoData();
  const metadata = await image.getGDALMetadata(0);
  const scale = Number(metadata?.SCALE ?? 1);
  const offset = Number(metadata?.OFFSET ?? 0);
  if (!Number.isFinite(scale) || !Number.isFinite(offset)) throw new Error('Invalid GeoTIFF scale or offset.');

  let mask;
  const count = await tiff.getImageCount();
  for (let i = 1; i < count; i++) {
    const layer = await tiff.getImage(i);
    if ((layer.getFileDirectory().getValue('NewSubfileType') & 4) &&
        layer.getWidth() === image.getWidth() && layer.getHeight() === image.getHeight()) {
      mask = await layer.readRasters(options);
      break;
    }
  }
  return Array.from(raw, (value, index) => {
    if (value === nodata || (mask && !mask[index])) return null;
    const scaled = value * scale + offset;
    const db = units === 'power' ? 10 * Math.log10(scaled) : scaled;
    return Number.isFinite(db) && Math.abs(db) <= 1000 ? db : null;
  });
}

export async function readGeoTiffPair(beforeTiff, afterTiff, units, signal) {
  const beforeImage = await beforeTiff.getImage();
  const afterImage = await afterTiff.getImage();
  const first = describeImage(beforeImage);
  const second = describeImage(afterImage);
  if (first.width !== second.width || first.height !== second.height || first.crs !== second.crs ||
      first.rasterType !== second.rasterType ||
      first.transform.some((value, index) => Math.abs(value - second.transform[index]) > 1e-9)) {
    throw new Error('These files do not align. Choose the same coordinate system, pixel grid, and dimensions.');
  }
  const width = Math.min(first.width, MAX_SIDE);
  const height = Math.min(first.height, MAX_SIDE);
  const left = Math.floor((first.width - width) / 2);
  const top = Math.floor((first.height - height) / 2);
  const window = [left, top, left + width, top + height];
  const before = await readWindow(beforeTiff, beforeImage, window, units, signal);
  const after = await readWindow(afterTiff, afterImage, window, units, signal);
  const [a, b, c, d, e, f] = first.transform;
  return validateScene({
    schemaVersion: 1, units: 'dB', title: 'Your GeoTIFF comparison', synthetic: false, width, height,
    crs: `EPSG:${first.crs}`, transform: [a, b, c + a * left + b * top, d, e, f + d * left + e * top],
    before, after,
    crop: { left, top, sourceWidth: first.width, sourceHeight: first.height },
  });
}

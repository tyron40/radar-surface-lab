# Radar Surface Lab

A browser dashboard and GeoTIFF preparation tool for comparing two synthetic aperture radar (SAR) backscatter observations. The dashboard runs locally and opens with a labeled synthetic river scene. It supports before, after, signed change, and flood candidate layers, interactive thresholds, and a downloadable JSON summary. Imported scenes are processed in the browser.

## Run locally

From the repository root:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000>. The dashboard can also run on a static web host. Publish `index.html`, `styles.css`, `app.js`, and `radar.mjs` together in the same directory.

## Use satellite data

1. Find two [NASA OPERA RTC-S1](https://www.jpl.nasa.gov/go/opera/products/rtc-product/) Sentinel-1 backscatter products for the same area via the [Alaska Satellite Facility](https://search.asf.alaska.edu/). Use the same polarization and comparable acquisition geometry, preferably the same relative orbit and burst footprint.
2. Use aligned, terrain-corrected, single-band GeoTIFFs with the same CRS, transform, and dimensions. Mask invalid areas such as radar shadow and layover using the product quality data before running the converter. The converter respects the supplied GeoTIFF masks and nodata values.
3. Install the converter dependency in a Python 3.12 environment and create a scene file:

```sh
python -m pip install -r requirements.txt
python prepare_scene.py before.tif after.tif scene.json --units power --crop 0 0 512 512
```

Use `--units power` for linear backscatter power or `--units db` for data already in dB. Power converts using `10 × log10(power)`. The crop is zero-based column, row, width, height. Pick a crop within both inputs, at most 768 pixels on each side, or omit it when the full raster fits.
4. Load the generated `scene.json` in the dashboard. Compare the source layers and adjust the minimum drop and dark-surface cutoff before exporting the summary.

Each candidate pixel starts above the dark cutoff, ends at or below it, and has a drop of at least the chosen amount. The candidate share uses only pixels with both observations. It is a pixel fraction and is intended for screening. Dark soil, terrain shadow, vegetation, built-up areas, and speckle can affect results. Validate any interpreted flooding against independent evidence.

The JSON import format uses `schemaVersion: 1`, `units: "dB"`, a nonempty `title`, a Boolean `synthetic`, integer `width` and `height`, and row-major `before` and `after` arrays of dB values or `null` for missing pixels. The CLI includes the CRS and crop transform as metadata. Dashboard views use raster coordinates.

## Tests

```sh
node --test
python -m unittest test_prepare_scene.py
```

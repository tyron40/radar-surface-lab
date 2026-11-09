"""Convert two pre-aligned RTC GeoTIFFs into a scene for Radar Surface Lab."""
import argparse
import json
import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

MAX_SIDE = 768


def read_values(dataset, window, units):
    values = dataset.read(1, window=window, masked=True).astype("float64").filled(np.nan)
    if units == "power":
        values[values <= 0] = np.nan
        values = 10 * np.log10(values)
    return [
        round(float(value), 4) if math.isfinite(value) and abs(value) <= 1000 else None
        for value in values.flat
    ]


def prepare(before_path, after_path, units, title, crop=None):
    with rasterio.open(before_path) as before, rasterio.open(after_path) as after:
        if (before.crs is None or before.crs != after.crs
                or before.transform != after.transform or before.shape != after.shape):
            raise ValueError("Both rasters must have the same defined CRS, transform, and dimensions.")
        col, row, width, height = crop or (0, 0, before.width, before.height)
        if not (0 <= col and 0 <= row and 1 <= width <= MAX_SIDE and 1 <= height <= MAX_SIDE
                and col + width <= before.width and row + height <= before.height):
            raise ValueError(f"Use --crop COL ROW WIDTH HEIGHT inside the raster, up to {MAX_SIDE} pixels per side.")
        window = Window(col, row, width, height)
        return {
            "schemaVersion": 1,
            "units": "dB",
            "title": title,
            "synthetic": False,
            "width": width,
            "height": height,
            "crs": before.crs.to_string(),
            "transform": list(before.window_transform(window))[:6],
            "before": read_values(before, window, units),
            "after": read_values(after, window, units),
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("before", type=Path)
    parser.add_argument("after", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--units", choices=("power", "db"), required=True)
    parser.add_argument("--title", default="Imported SAR scene")
    parser.add_argument("--crop", nargs=4, type=int, metavar=("COL", "ROW", "WIDTH", "HEIGHT"))
    args = parser.parse_args()
    if not args.title.strip() or len(args.title.encode("utf-16-le")) // 2 > 160:
        parser.error("The title must be nonempty and fit within 160 UTF-16 code units.")
    try:
        scene = prepare(args.before, args.after, args.units, args.title, args.crop)
        # Exclusive creation protects source files and previous runs.
        with args.output.open("x", encoding="utf-8") as destination:
            json.dump(scene, destination, allow_nan=False, separators=(",", ":"))
            destination.write("\n")
    except (OSError, ValueError, rasterio.errors.RasterioError) as error:
        parser.exit(1, f"Error: {error}\n")
    print(f"Wrote {args.output} ({scene['width']} × {scene['height']} pixels)")


if __name__ == "__main__":
    main()

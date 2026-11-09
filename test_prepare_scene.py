import tempfile
import unittest
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_origin

from prepare_scene import prepare


class PrepareSceneTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.before = Path(directory.name, "before.tif")
        self.after = Path(directory.name, "after.tif")
        self.transform = from_origin(100, 200, 10, 10)
        self.write(self.before, [[.1, .01], [0, -9999]], self.transform)
        self.write(self.after, [[.01, .001], [.1, .1]], self.transform)

    @staticmethod
    def write(path, values, transform):
        with rasterio.open(path, "w", driver="GTiff", width=2, height=2, count=1,
                           dtype="float32", crs="EPSG:32617", transform=transform, nodata=-9999) as dataset:
            dataset.write(np.array(values, dtype="float32"), 1)

    def test_converts_power_and_preserves_nodata(self):
        scene = prepare(self.before, self.after, "power", "Test")
        self.assertEqual(scene["before"], [-10, -20, None, None])
        self.assertEqual(scene["after"], [-20, -30, -10, -10])

    def test_crop_offsets_and_validates_bounds(self):
        scene = prepare(self.before, self.after, "power", "Test", (1, 0, 1, 1))
        self.assertEqual(scene["before"], [-20])
        self.assertEqual(scene["transform"][2], 110)
        with self.assertRaisesRegex(ValueError, "crop"):
            prepare(self.before, self.after, "power", "Test", (1, 0, 2, 1))

    def test_rejects_misaligned_rasters(self):
        self.write(self.after, [[1, 1], [1, 1]], from_origin(101, 200, 10, 10))
        with self.assertRaisesRegex(ValueError, "transform"):
            prepare(self.before, self.after, "power", "Test")

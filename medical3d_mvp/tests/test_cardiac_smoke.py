from __future__ import annotations

import unittest

import numpy as np

from medviz3d.core.cardiac.ct_lv_pool import LvBloodPoolParams, segment_lv_blood_pool_ct_hu
from medviz3d.core.recon.mesh import mask_to_mesh


class CardiacSmokeTest(unittest.TestCase):
    def test_lv_pool_sphere_and_mesh(self) -> None:
        vol = np.full((48, 48, 48), -200.0, dtype=np.float32)
        z, y, x = np.ogrid[:48, :48, :48]
        ctr = np.array([24.0, 24.0, 24.0])
        r = 12.0
        dist = np.sqrt((z - ctr[0]) ** 2 + (y - ctr[1]) ** 2 + (x - ctr[2]) ** 2)
        vol[dist <= r] = 350.0

        mask, warns = segment_lv_blood_pool_ct_hu(
            vol,
            LvBloodPoolParams(hu_lo=200.0, hu_hi=600.0, bone_suppress=False, keep_largest=True),
        )
        self.assertGreater(int(mask.max()), 0)
        self.assertIsInstance(warns, list)

        mesh = mask_to_mesh(mask, (1.0, 1.0, 1.0), label="test", estimated=False)
        self.assertGreater(mesh.vertices_xyz.shape[0], 0)
        self.assertGreater(mesh.faces.shape[0], 0)


if __name__ == "__main__":
    unittest.main()

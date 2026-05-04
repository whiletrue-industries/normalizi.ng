"""Generate reference fixtures for calc_tsne tests.

Run with the current (modernized) deps to lock in golden outputs that later PRs
must not regress. Re-run only when the mathematical semantics intentionally
change (and review the diff carefully).

    python tests/fixtures/calc_tsne/generate_fixtures.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

FIXTURE_DIR = Path(__file__).parent


def main():
    rng = np.random.default_rng(42)

    # Seeded descriptor-like embeddings.
    descriptors = rng.standard_normal((50, 128)).astype(np.float32)
    np.save(FIXTURE_DIR / "descriptors.npy", descriptors)

    # A synthetic 2D set of points that look like a post-t-SNE layout.
    points_2d = rng.uniform(0.0, 1.0, size=(50, 2)).astype(np.float32)
    np.save(FIXTURE_DIR / "points_2d.npy", points_2d)

    # Generate the grid assignment golden with the modernized calc_tsne_grid.
    from lib.calc_tsne import calc_tsne_grid

    grid = calc_tsne_grid(points_2d, out_dim=8)
    np.save(FIXTURE_DIR / "grid_assignment.golden.npy", grid)

    # A small image for img_to_array / array_to_img round-trip tests.
    rng_img = np.random.default_rng(7)
    img_array = rng_img.integers(0, 256, size=(16, 16, 3), dtype=np.uint8)
    Image.fromarray(img_array, mode="RGB").save(FIXTURE_DIR / "sample.png")
    np.save(FIXTURE_DIR / "sample_as_array.npy", img_array.astype(np.float32))

    print("Fixtures written to", FIXTURE_DIR)


if __name__ == "__main__":
    main()

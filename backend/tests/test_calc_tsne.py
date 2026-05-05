"""Tests for lib.calc_tsne.

Strategy: verify mathematical invariants (Hungarian assignment is optimal,
img_to_array/array_to_img are identity under round-trip) plus regression goldens
for calc_tsne_grid so future changes don't silently alter layouts.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist

import lib.calc_tsne as calc_tsne_module
from lib.calc_tsne import (
    array_to_img,
    calc_tsne_grid,
    compute_input_hash,
    fetch_previous_input_hash,
    generate_tsne,
    img_to_array,
    process_item,
)

FIXTURES = Path(__file__).parent / "fixtures" / "calc_tsne"


@pytest.fixture
def points_2d():
    return np.load(FIXTURES / "points_2d.npy")


@pytest.fixture
def descriptors():
    return np.load(FIXTURES / "descriptors.npy")


# ---------- img_to_array / array_to_img ----------

def test_img_to_array_matches_numpy_asarray():
    img_array = np.load(FIXTURES / "sample_as_array.npy")
    img = Image.open(FIXTURES / "sample.png")
    out = img_to_array(img)
    assert out.dtype == np.float32
    assert out.shape == img_array.shape
    np.testing.assert_array_equal(out, img_array)


def test_array_to_img_round_trip():
    arr = np.load(FIXTURES / "sample_as_array.npy")
    img = array_to_img(arr)
    assert img.size == (16, 16)
    # Round trip is lossless because our values are in [0, 255] and integer.
    np.testing.assert_array_equal(img_to_array(img), arr)


def test_array_to_img_clips_out_of_range():
    arr = np.array([[[300.0, -50.0, 128.0]]], dtype=np.float32)
    img = array_to_img(arr)
    pixels = np.asarray(img)
    assert pixels[0, 0, 0] == 255  # clipped high
    assert pixels[0, 0, 1] == 0    # clipped low
    assert pixels[0, 0, 2] == 128  # unchanged


def test_array_to_img_single_channel_alpha():
    alpha = np.full((4, 4, 1), 200.0, dtype=np.float32)
    img = array_to_img(alpha, mode="L")
    assert img.mode == "L"
    assert img.size == (4, 4)
    assert np.asarray(img)[0, 0] == 200


# ---------- calc_tsne_grid ----------

def test_calc_tsne_grid_shape_and_bounds(points_2d):
    result = calc_tsne_grid(points_2d, out_dim=8)
    assert result.shape == points_2d.shape
    # Every returned coord lies on the [0, 1] unit grid.
    assert result.min() >= 0
    assert result.max() <= 1


def test_calc_tsne_grid_assignment_is_optimal(points_2d):
    """The assignment must minimize total squared distance — verifiable without goldens."""
    out_dim = 8
    result = calc_tsne_grid(points_2d, out_dim)

    # Compute cost of returned assignment.
    grid = np.dstack(np.meshgrid(np.linspace(0, 1, out_dim), np.linspace(0, 1, out_dim))).reshape(-1, 2)
    cost_matrix = cdist(grid, points_2d, "sqeuclidean").astype(np.float32)
    cost_matrix_scaled = cost_matrix * (100000 / cost_matrix.max())

    row_ind, col_ind = linear_sum_assignment(cost_matrix_scaled)
    optimal_cost = cost_matrix_scaled[row_ind, col_ind].sum()

    # Reconstruct the cost of our returned assignment (tolerant float match).
    returned_cost = 0.0
    for j, pos in enumerate(result):
        distances = np.linalg.norm(grid - pos, axis=1)
        grid_match = int(np.argmin(distances))
        returned_cost += cost_matrix_scaled[grid_match, j]
    assert np.isclose(returned_cost, optimal_cost, rtol=1e-4)


def test_calc_tsne_grid_assignments_unique(points_2d):
    """Two points must not land on the same grid cell."""
    result = calc_tsne_grid(points_2d, out_dim=8)
    unique = {tuple(row) for row in result}
    assert len(unique) == len(result)


def test_calc_tsne_grid_matches_golden(points_2d):
    golden = np.load(FIXTURES / "grid_assignment.golden.npy")
    result = calc_tsne_grid(points_2d, out_dim=8)
    # Regression guard — if this fails and the change is intentional, re-run
    # generate_fixtures.py and review the diff.
    np.testing.assert_allclose(result, golden, atol=1e-6)


# ---------- generate_tsne ----------

def test_generate_tsne_output_shape(descriptors):
    out = generate_tsne(descriptors, to_plot=30, perplexity=10, tsne_iter=250, random_state=0)
    assert out.shape == (30, 2)


def test_generate_tsne_output_normalized(descriptors):
    out = generate_tsne(descriptors, to_plot=30, perplexity=10, tsne_iter=250, random_state=0)
    # Normalized: each dim is in [0, 1] with the min at 0 and max at 1.
    assert np.isclose(out.min(axis=0), 0).all()
    assert np.isclose(out.max(axis=0), 1).all()


def test_generate_tsne_is_deterministic(descriptors):
    out1 = generate_tsne(descriptors, to_plot=30, perplexity=10, tsne_iter=250, random_state=7)
    out2 = generate_tsne(descriptors, to_plot=30, perplexity=10, tsne_iter=250, random_state=7)
    np.testing.assert_allclose(out1, out2)


# ---------- process_item ----------

def test_process_item_truncates_and_rounds():
    item = {
        "descriptor": [0.12345, 0.6789, -0.4321],
        "landmarks": [{"x": 10.7, "y": 20.3}, {"x": 30, "y": 40}],
    }
    out = process_item(item)
    assert out["descriptor"] == [0.123, 0.678, -0.432]
    assert out["landmarks"] == [{"x": 10, "y": 20}, {"x": 30, "y": 40}]


# ---------- compute_input_hash ----------

def test_compute_input_hash_deterministic():
    ids = [{"id": 1, "image": "a"}, {"id": 2, "image": "b"}]
    activations = [[0.1, 0.2], [0.3, 0.4]]
    assert compute_input_hash(ids, activations) == compute_input_hash(ids, activations)


def test_compute_input_hash_changes_with_id():
    descriptors = [[0.1, 0.2]]
    assert compute_input_hash([{"id": 1}], descriptors) != compute_input_hash([{"id": 2}], descriptors)


def test_compute_input_hash_changes_with_descriptor():
    ids = [{"id": 1}]
    assert compute_input_hash(ids, [[0.1, 0.2]]) != compute_input_hash(ids, [[0.1, 0.3]])


def test_compute_input_hash_changes_with_order():
    """load_activations orders by id DESC, so a different order represents a different DB state."""
    ids_a = [{"id": 1}, {"id": 2}]
    ids_b = [{"id": 2}, {"id": 1}]
    descriptors_a = [[0.1], [0.2]]
    descriptors_b = [[0.2], [0.1]]
    assert compute_input_hash(ids_a, descriptors_a) != compute_input_hash(ids_b, descriptors_b)


# ---------- fetch_previous_input_hash ----------

def test_fetch_previous_input_hash_returns_text(monkeypatch):
    class _Resp:
        status_code = 200
        text = "deadbeef\n"

    monkeypatch.setattr(calc_tsne_module.requests, "get", lambda *a, **kw: _Resp())
    assert fetch_previous_input_hash() == "deadbeef"


def test_fetch_previous_input_hash_returns_none_on_404(monkeypatch):
    class _Resp:
        status_code = 404
        text = "not found"

    monkeypatch.setattr(calc_tsne_module.requests, "get", lambda *a, **kw: _Resp())
    assert fetch_previous_input_hash() is None


def test_fetch_previous_input_hash_returns_none_on_network_error(monkeypatch):
    def _raise(*a, **kw):
        raise calc_tsne_module.requests.ConnectionError("boom")

    monkeypatch.setattr(calc_tsne_module.requests, "get", _raise)
    assert fetch_previous_input_hash() is None


def test_fetch_previous_input_hash_returns_none_on_empty_body(monkeypatch):
    class _Resp:
        status_code = 200
        text = "   \n"

    monkeypatch.setattr(calc_tsne_module.requests, "get", lambda *a, **kw: _Resp())
    assert fetch_previous_input_hash() is None


# ---------- main() skip path ----------

def test_main_skips_when_input_hash_matches(monkeypatch, mock_s3_upload):
    """When the previous hash matches the current input, main() returns without
    running t-SNE, fetching tsne.json, or uploading anything."""
    fake_ids = [{"id": 1, "image": "img1"}, {"id": 2, "image": "img2"}]
    fake_activations = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]
    expected = compute_input_hash(fake_ids, fake_activations)

    monkeypatch.setattr(calc_tsne_module, "load_activations", lambda: (fake_ids, fake_activations))
    monkeypatch.setattr(calc_tsne_module, "fetch_previous_input_hash", lambda: expected)

    def _fail_generate(*a, **kw):
        raise AssertionError("generate_tsne must not be called when hash matches")
    monkeypatch.setattr(calc_tsne_module, "generate_tsne", _fail_generate)

    def _fail_get(*a, **kw):
        raise AssertionError("requests.get must not be called when hash matches")
    monkeypatch.setattr(calc_tsne_module.requests, "get", _fail_get)

    calc_tsne_module.main(to_plot=2)

    assert mock_s3_upload == []


def test_main_finalizes_image_loaders_on_error(monkeypatch, mock_s3_upload):
    """If the pipeline raises after ImageLoader.start(), all loaders' executors
    must still be shut down — otherwise their threads leak."""
    fake_ids = [{"id": 1, "image": "img1"}, {"id": 2, "image": "img2"}]
    fake_activations = [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]

    monkeypatch.setattr(calc_tsne_module, "load_activations", lambda: (fake_ids, fake_activations))
    monkeypatch.setattr(calc_tsne_module, "fetch_previous_input_hash", lambda: None)

    fini_calls: list[int] = []
    start_calls: list[int] = []
    instances: list[object] = []

    class _FakeImageLoader:
        def __init__(self, images, args):
            self.images = images
            self.id = len(instances)
            instances.append(self)

        def start(self):
            start_calls.append(self.id)

        def fini(self):
            fini_calls.append(self.id)

    monkeypatch.setattr(calc_tsne_module, "ImageLoader", _FakeImageLoader)

    def _boom(*a, **kw):
        raise RuntimeError("simulated failure mid-pipeline")
    monkeypatch.setattr(calc_tsne_module, "generate_tsne", _boom)

    class _Resp:
        status_code = 200
        @staticmethod
        def json():
            return {"set": 0}
    monkeypatch.setattr(calc_tsne_module.requests, "get", lambda *a, **kw: _Resp())

    with pytest.raises(RuntimeError, match="simulated failure"):
        calc_tsne_module.main(to_plot=2)

    # Every created loader must have been finalized.
    assert sorted(fini_calls) == [i.id for i in instances]
    assert mock_s3_upload == []

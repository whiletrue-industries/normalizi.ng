import concurrent.futures
import hashlib
import json
import math
from io import BytesIO
from queue import Queue

import numpy as np
import requests
from PIL import Image
from scipy.optimize import linear_sum_assignment
from scipy.spatial.distance import cdist
from sklearn.manifold import TSNE
from sqlalchemy.sql import text

from .db import get_engine
from .net import upload_fileobj_s3


def img_to_array(img: Image.Image) -> np.ndarray:
    """numpy equivalent of tf.keras.preprocessing.image.img_to_array.

    Converts a PIL image to float32 array (H, W, C).
    """
    return np.asarray(img, dtype=np.float32)


def array_to_img(arr: np.ndarray, mode: str | None = None) -> Image.Image:
    """numpy equivalent of tf.keras.preprocessing.image.array_to_img.

    Clips to [0, 255], casts to uint8, returns a PIL Image.
    """
    clipped = np.clip(arr, 0, 255).astype(np.uint8)
    if clipped.ndim == 3 and clipped.shape[2] == 1:
        return Image.fromarray(clipped[:, :, 0], mode=mode or "L")
    return Image.fromarray(clipped, mode=mode)


class ImageLoader:
    def __init__(self, images, args):
        self.concurrency = 32
        self.queue: Queue = Queue()
        self.images = images
        self.args = args
        assert len(set(self.images)) == len(images), "Duplicate image id"

        self.image_fetches = 0
        self.queue_recv = 0
        self.cache: dict = {}
        self.executor: concurrent.futures.ThreadPoolExecutor | None = None

    def start(self):
        print(f"Fetching {len(self.images)} images")
        self.executor = concurrent.futures.ThreadPoolExecutor(max_workers=self.concurrency)
        for image in self.images:
            self.executor.submit(self.load_image, image, *self.args, self.queue)
        print("Done submitting")

    def fini(self):
        print("Finalizing executor")
        if self.executor is not None:
            self.executor.shutdown(wait=True)
            self.executor = None
        print("Finalizing executor done")

    def load_image(self, id, out_res_x, out_res_y, img_location, img_size, queue):
        img_url = f"https://normalizing-us-files.fra1.cdn.digitaloceanspaces.com/photos/{id}_full.png"
        resp = None
        for retry in range(10):
            try:
                resp = requests.get(img_url, timeout=5)
                if resp.status_code != 200:
                    print("FAILED", retry, "to fetch", img_url, "status code", resp.status_code)
                    continue
                break
            except requests.RequestException as e:
                print("FAILED", retry, "to fetch", img_url, "exp", str(e))

        if resp is None or resp.status_code != 200:
            self.queue.put((id, None))
            print(f"Failed to fetch image {id}")

        img = Image.open(BytesIO(resp.content))
        img = img.crop(
            (
                img_location[0],
                img_location[1],
                img_location[0] + img_size[0],
                img_location[1] + img_size[1],
            )
        )
        img = img.convert("RGB")
        img = img.resize((out_res_x, out_res_y), Image.NEAREST)
        self.queue.put((id, img))

    def get_image(self, need_id):
        assert need_id in self.images, f"Image {need_id} not in set"
        while need_id not in self.cache:
            id, img = self.queue.get()
            self.cache[id] = img
            self.queue_recv += 1

        self.image_fetches += 1
        if self.image_fetches % 100 == 0:
            print("...", self.image_fetches, self.queue_recv, len(self.cache))
        return self.cache.pop(need_id)


_LOAD_ACTIVATIONS = text(
    """
    SELECT id, image, tournaments, votes, descriptor, landmarks, gender_age, place_name, created_timestamp,
        votes_0, tournaments_0,
        votes_1, tournaments_1,
        votes_2, tournaments_2,
        votes_3, tournaments_3,
        votes_4, tournaments_4
    FROM faces
    WHERE allowed > 0
    ORDER BY id DESC LIMIT 500
    """
)


def load_activations():
    print("Fetching descriptors")
    with get_engine().connect() as conn:
        rows = conn.execution_options(stream_results=True).execute(_LOAD_ACTIVATIONS)
        ids = []
        activations = []
        for row in rows:
            m = row._mapping
            ids.append(
                dict(
                    id=m["id"],
                    image=m["image"],
                    tournaments=m["tournaments"],
                    votes=m["votes"],
                    votes_0=m["votes_0"], tournaments_0=m["tournaments_0"],
                    votes_1=m["votes_1"], tournaments_1=m["tournaments_1"],
                    votes_2=m["votes_2"], tournaments_2=m["tournaments_2"],
                    votes_3=m["votes_3"], tournaments_3=m["tournaments_3"],
                    votes_4=m["votes_4"], tournaments_4=m["tournaments_4"],
                    landmarks=m["landmarks"],
                    descriptor=m["descriptor"],
                    gender_age=m["gender_age"],
                    place_name=m["place_name"],
                    created_timestamp=m["created_timestamp"].isoformat(),
                )
            )
            activations.append(m["descriptor"])
        return ids, activations


def generate_tsne(activations, to_plot, perplexity=50, tsne_iter=5000, random_state: int | None = None):
    tsne = TSNE(
        perplexity=perplexity,
        n_components=2,
        init="random",
        max_iter=tsne_iter,
        random_state=random_state,
    )
    X_2d = tsne.fit_transform(np.array(activations)[0:to_plot, :])
    X_2d -= X_2d.min(axis=0)
    X_2d /= X_2d.max(axis=0)
    return X_2d


def calc_tsne_grid(X_2d: np.ndarray, out_dim: int) -> np.ndarray:
    """Assign each point in X_2d to a cell of an out_dim x out_dim grid, minimizing total squared distance.

    Returns an array of shape (n_points, 2) where row j is the grid position assigned to point j.
    """
    grid = np.dstack(np.meshgrid(np.linspace(0, 1, out_dim), np.linspace(0, 1, out_dim))).reshape(-1, 2)
    cost_matrix = cdist(grid, X_2d, "sqeuclidean").astype(np.float32)
    cost_matrix = cost_matrix * (100000 / cost_matrix.max())
    row_ind, col_ind = linear_sum_assignment(cost_matrix)
    grid_jv = np.empty_like(X_2d)
    grid_jv[col_ind] = grid[row_ind]
    return grid_jv


def process_item(item):
    item["descriptor"] = [int(x * 1000) / 1000.0 for x in item["descriptor"]]
    item["landmarks"] = [{"x": int(x["x"]), "y": int(x["y"])} for x in item["landmarks"]]
    return item


def create_tsne_image(grid_jv, img_collection, out_dim, to_plot, res, offset, out_size, loader):
    img_dim = out_dim
    info: dict = {"dim": img_dim, "grid": []}
    out_res_x, out_res_y = res
    offset_x, offset_y = offset
    out_size_x, out_size_y = out_size
    out = np.zeros((img_dim * out_res_y, img_dim * out_res_x, 3))
    alpha = np.zeros((img_dim * out_res_y, img_dim * out_res_x, 1))
    used = set()
    for pos, item in zip(grid_jv, img_collection[0:to_plot], strict=False):
        pos_x = round(pos[1] * (out_dim - 1))
        pos_y = round(pos[0] * (out_dim - 1))
        assert (pos_x, pos_y) not in used
        used.add((pos_x, pos_y))
        img = loader.get_image(item["image"])
        if img is None:
            continue
        h_range = pos_y * out_res_y + offset_y
        w_range = pos_x * out_res_x + offset_x
        out[h_range:h_range + out_size_y, w_range:w_range + out_size_x] = img_to_array(img)
        alpha[h_range:h_range + out_size_y, w_range:w_range + out_size_x] = 255 * np.ones((out_size_y, out_size_x, 1))
        info["grid"].append({"pos": {"x": pos_x, "y": pos_y}, "item": process_item(item)})
    loader.fini()

    im = array_to_img(out, mode="RGB")
    im.putalpha(array_to_img(alpha, mode="L"))
    return im, info


def create_tiles(filename, image: Image.Image, out_dim, res, info, current_set):
    assert res[0] == res[1]
    dim_zoom = round(math.log2(out_dim))
    edge = 2 ** math.ceil(math.log2(out_dim)) * res[0]
    tile_size = 256
    max_cut_size = tile_size * 4
    max_zoom = info["max_zoom"] = 8
    min_zoom = info["min_zoom"] = 8 - dim_zoom

    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
        for zoom in range(min_zoom, max_zoom + 1):
            num_cuts = 2 ** (zoom - min_zoom)
            cut_size = edge / num_cuts
            if cut_size > max_cut_size:
                scaledown_size = math.ceil((max_cut_size * num_cuts * out_dim * res[0]) / edge)
                cut_size = max_cut_size
                scaledown = image.resize((scaledown_size, scaledown_size), Image.NEAREST)
            else:
                scaledown = image

            for x in range(num_cuts):
                for y in range(num_cuts):
                    key = f"feature-tiles/{current_set}/{filename}/{zoom}/{x}/{y}"
                    left = math.floor(x * cut_size)
                    upper = math.floor(y * cut_size)
                    right = math.ceil((x + 1) * cut_size - 1)
                    lower = math.ceil((y + 1) * cut_size - 1)
                    tile = scaledown.crop((left, upper, right, lower))
                    tile = tile.resize((tile_size, tile_size), resample=Image.BICUBIC)

                    buff = BytesIO()
                    tile.save(buff, format="png", quality=90)
                    buff.seek(0)
                    executor.submit(upload_fileobj_s3, buff, key, "image/png")


IMAGES = [
    ("faces", (300, 300), (1200, 0)),
]

_INPUT_HASH_KEY = "tsne-input.sha256"
_INPUT_HASH_URL = f"https://normalizing-us-files.fra1.digitaloceanspaces.com/{_INPUT_HASH_KEY}"


def compute_input_hash(ids: list[dict], activations: list) -> str:
    """SHA-256 over the (id, descriptor) pairs that feed t-SNE.

    Stable across runs: the load_activations query orders by id DESC so input
    order is deterministic given the same row set. Vote counts and other
    metadata are deliberately excluded — they don't affect the layout, so
    changing them alone shouldn't trigger a recompute.
    """
    h = hashlib.sha256()
    for item, descriptor in zip(ids, activations, strict=True):
        h.update(str(item["id"]).encode("utf-8"))
        h.update(b":")
        h.update(json.dumps(descriptor, separators=(",", ":")).encode("utf-8"))
        h.update(b"\n")
    ret = h.hexdigest()
    print(f"Computed input hash: {ret}")
    return ret


def fetch_previous_input_hash() -> str | None:
    """Read the input hash persisted by the previous run, or None if unavailable."""
    try:
        resp = requests.get(_INPUT_HASH_URL, timeout=10)
    except requests.RequestException:
        return None
    if resp.status_code != 200:
        return None
    return resp.text.strip() or None


def upload_input_hash(input_hash: str) -> bool:
    buff = BytesIO(input_hash.encode("utf-8"))
    print(f"Uploading input hash {input_hash} to {_INPUT_HASH_URL}")
    return upload_fileobj_s3(buff, _INPUT_HASH_KEY, "text/plain")


def main(
    to_plot: int = 450,
    out_dim: int = 30,
    tsne_iter: int = 5000,
    perplexity: int = 50,
    side: int = 256,
    skip_upload: bool = False,
):
    ids, activations = load_activations()
    ids = ids[:to_plot]
    activations = activations[:to_plot]

    input_hash = compute_input_hash(ids, activations)
    prev_input_hash = fetch_previous_input_hash()
    print(f"Previous input hash is: {prev_input_hash}")
    if not skip_upload and prev_input_hash == input_hash:
        print(f"t-SNE inputs unchanged (hash {input_hash[:12]}); skipping recomputation.")
        return

    all_loaders = []
    for _filename, img_size, img_location in IMAGES:
        w, h = img_size
        dim = max(w, h)
        size = side / 2
        all_loaders.append(
            ImageLoader(
                [item["image"] for item in ids],
                [int(size * w / dim), int(size * h / dim), img_location, img_size],
            )
        )

    try:
        loaders = list(all_loaders)
        loaders[0].start()

        try:
            current_config = requests.get(
                "https://normalizing-us-files.fra1.digitaloceanspaces.com/tsne.json",
                timeout=10,
            ).json()
            current_set = current_config.get("set", 0)
        except (requests.RequestException, ValueError):
            current_set = 0
        current_set = (current_set + 1) % 10

        print("Generating 2D representation.")
        X_2d = generate_tsne(activations, to_plot, perplexity, tsne_iter)
        print(f"Generating image grid ({out_dim}x{out_dim}, {len(ids)} images)")
        grid = calc_tsne_grid(X_2d, out_dim)

        info: dict = {}
        for filename, img_size, _img_location in IMAGES:
            w, h = img_size
            dim = max(w, h)
            size = side / 2
            size_tuple = (int(size * w / dim), int(size * h / dim))
            offset = (int((side - size_tuple[0]) / 2), int((side - size_tuple[1]) / 2))
            image, info = create_tsne_image(
                grid, ids, out_dim, to_plot, (side, side), offset, size_tuple, loaders.pop(0)
            )
            info["set"] = current_set
            if len(loaders) > 0:
                loaders[0].start()
            if not skip_upload:
                create_tiles(filename, image, out_dim, (side, side), info, current_set)

        if not skip_upload:
            json_buff = BytesIO()
            json_buff.write(json.dumps(info).encode("utf8"))
            json_buff.seek(0)
            upload_fileobj_s3(
                json_buff,
                "tsne.json",
                "application/json",
                cache_control="no-cache",
            )
            upload_input_hash(input_hash)
    finally:
        for loader in all_loaders:
            loader.fini()


def calc_tsne_handler(event, context):
    main()


if __name__ == "__main__":
    main()

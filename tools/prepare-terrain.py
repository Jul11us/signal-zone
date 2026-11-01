"""Prepare browser terrain assets from the user-supplied local resources.

Requires Pillow and numpy. Source paths are inputs; original files are never changed.
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def prepare(height_root, satellite, illustrated, output):
    output.mkdir(parents=True, exist_ok=True)
    metadata = {"version": 1, "gridSize": 193, "maps": {}}
    for map_id in ["erangel", "miramar"]:
        source = height_root / map_id / f"pubg_{map_id}_height_l16_lod0.png"
        height = Image.open(source)
        raw = np.asarray(height, dtype=np.float32)
        low, high = float(raw.min()), float(raw.max())
        # Preserve the source's relative range. No unverified metres or sea level.
        small = height.convert("F").resize((193, 193), Image.Resampling.BILINEAR)
        normalized = np.clip((np.asarray(small) - low) / (high - low), 0, 1)
        packed = np.rint(normalized * 65535).astype("<u2")
        (output / f"{map_id}-height.bin").write_bytes(packed.tobytes())
        field = height.convert("F").resize((2048, 2048), Image.Resampling.BILINEAR)
        h = np.clip((np.asarray(field) - low) / (high - low), 0, 1)
        stops = np.array([0, .18, .3, .48, .65, .82, 1])
        colors = np.array([[12, 37, 49], [27, 66, 70], [58, 99, 86],
                           [129, 145, 103], [181, 164, 120], [210, 197, 167], [245, 239, 220]])
        rgb = np.stack([np.interp(h, stops, colors[:, c]) for c in range(3)], axis=-1)
        dy, dx = np.gradient(h)
        shade = np.clip(.88 + (dy - dx) * 26, .5, 1.18)
        rgb = np.clip(rgb * shade[..., None], 0, 255).astype("uint8")
        Image.fromarray(rgb).save(output / f"{map_id}-relief.webp", quality=87, method=6)
        metadata["maps"][map_id] = {"sourceSize": list(height.size),
            "sourceRange": [low, high], "height": f"{map_id}-height.bin",
            "relief": f"{map_id}-relief.webp", "heightUnits": "relative", "sourceYear": 2019}
    for source, name, size in [(satellite, "erangel-satellite-8k.webp", 8192),
                               (satellite, "erangel-satellite-2k.webp", 2048),
                               (illustrated, "erangel-illustrated.webp", 4096),
                               (illustrated, "erangel-illustrated-2k.webp", 2048)]:
        image = Image.open(source).convert("RGB")
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        image.save(output / name, quality=87, method=6)
    (output / "manifest.json").write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--height-root", type=Path, required=True)
    parser.add_argument("--satellite", type=Path, required=True)
    parser.add_argument("--illustrated", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("assets/terrain-data"))
    args = parser.parse_args()
    prepare(args.height_root, args.satellite, args.illustrated, args.output)

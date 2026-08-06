#!/usr/bin/env python3
"""Visionが一部画像で異常終了しても、残りの資料判定を継続する監督プロセス。"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--original-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit-images", type=int, default=0)
    args = parser.parse_args()

    worker = Path(args.worker).resolve()
    manifest_path = Path(args.manifest).resolve()
    original_root = Path(args.original_root).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = [
        (str(product["itemId"]), int(image["imageNo"]))
        for product in manifest["products"]
        for image in product["images"]
    ]
    if args.limit_images > 0:
        entries = entries[: args.limit_images]

    next_index = 0
    failures = 0
    with output_path.open("w", encoding="utf-8") as destination:
        while next_index < len(entries):
            with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as temporary:
                temporary_path = Path(temporary.name)
            environment = os.environ.copy()
            environment["YUUKICHIYA_CLASSIFY_START"] = str(next_index)
            environment["YUUKICHIYA_CLASSIFY_LIMIT"] = str(len(entries) - next_index)
            process = subprocess.run(
                [str(worker), str(manifest_path), str(original_root), str(temporary_path)],
                env=environment,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
            rows = []
            try:
                rows = [json.loads(line) for line in temporary_path.read_text(encoding="utf-8").splitlines() if line]
            finally:
                temporary_path.unlink(missing_ok=True)

            for offset, row in enumerate(rows):
                expected = entries[next_index + offset]
                actual = (str(row.get("itemId")), int(row.get("imageNo", 0)))
                if actual != expected:
                    raise RuntimeError(f"分類順が不正です: {actual} != {expected}")
                destination.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            destination.flush()
            next_index += len(rows)

            if process.stderr:
                sys.stderr.write(process.stderr)
            if process.returncode == 0:
                if next_index != len(entries):
                    raise RuntimeError(f"分類が途中で終了しました: {next_index}/{len(entries)}")
                break

            if next_index >= len(entries):
                raise RuntimeError("最終画像の分類後にVisionが異常終了しました")
            item_id, image_no = entries[next_index]
            failed_path = original_root / item_id / f"{image_no:02d}.jpg"
            fallback = {
                "itemId": item_id,
                "imageNo": image_no,
                "path": str(failed_path),
                "textRegionCount": 0,
                "textArea": 0,
                "maxTextArea": 0,
                "hasHuman": False,
                "classification": "manual_review",
                "error": f"Apple Vision exited {process.returncode}; GPT Image 2へ自動送信せず手動確認",
            }
            destination.write(json.dumps(fallback, ensure_ascii=False, sort_keys=True) + "\n")
            destination.flush()
            next_index += 1
            failures += 1
            sys.stderr.write(f"manual review {item_id}:{image_no} ({next_index}/{len(entries)})\n")
            if failures > 200:
                raise RuntimeError("Vision異常が200件を超えたため、資料判定を停止しました")

    print(json.dumps({
        "images": len(entries),
        "visionFailuresHeldForManualReview": failures,
        "output": str(output_path),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

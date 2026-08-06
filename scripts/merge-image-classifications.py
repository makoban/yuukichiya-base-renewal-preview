#!/usr/bin/env python3
"""比較用画像と高解像度原本の資料判定を安全側に統合する。"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def key(row: dict) -> str:
    return f"{row['itemId']}:{row['imageNo']}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", required=True)
    parser.add_argument("--highres", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    preview = load(Path(args.preview))
    highres_rows = load(Path(args.highres))
    highres = {key(row): row for row in highres_rows}
    if len(preview) != len(highres) or set(map(key, preview)) != set(highres):
        raise ValueError("比較用画像と高解像度原本の分類対象が一致しません")

    counts = {"product_photo": 0, "text_document": 0, "manual_review": 0}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as destination:
        for preview_row in preview:
            highres_row = highres[key(preview_row)]
            classes = {preview_row["classification"], highres_row["classification"]}
            if "text_document" in classes:
                classification = "text_document"
            elif classes & {"manual_review", "classification_error"}:
                classification = "manual_review"
            else:
                classification = "product_photo"
            merged = {
                **preview_row,
                "classification": classification,
                "textRegionCount": max(int(preview_row.get("textRegionCount", 0)), int(highres_row.get("textRegionCount", 0))),
                "textArea": max(float(preview_row.get("textArea", 0)), float(highres_row.get("textArea", 0))),
                "maxTextArea": max(float(preview_row.get("maxTextArea", 0)), float(highres_row.get("maxTextArea", 0))),
                "classificationSources": {
                    "preview": preview_row["classification"],
                    "highres": highres_row["classification"],
                },
            }
            counts[classification] += 1
            destination.write(json.dumps(merged, ensure_ascii=False, sort_keys=True) + "\n")
    print(json.dumps({"images": len(preview), "counts": counts, "output": str(output.resolve())}, ensure_ascii=False))


if __name__ == "__main__":
    main()

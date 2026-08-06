#!/usr/bin/env python3
"""勇吉屋の商品画像をSQLiteへ保存し、GPT Image 2確認画面を出力する。"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import re
import sqlite3
import struct
from datetime import datetime, timezone
from pathlib import Path


SCHEMA_VERSION = 1
MODEL_NAME = "gpt-image-2"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def image_dimensions(data: bytes) -> tuple[int | None, int | None]:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 9 < len(data):
            while offset < len(data) and data[offset] == 0xFF:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in (0xD8, 0xD9):
                continue
            if marker == 0xDA or offset + 2 > len(data):
                break
            length = struct.unpack(">H", data[offset : offset + 2])[0]
            if length < 2 or offset + length > len(data):
                break
            if marker in {
                0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
            }:
                height, width = struct.unpack(">HH", data[offset + 3 : offset + 7])
                return width, height
            offset += length
    return None, None


def load_product_details(path: Path) -> dict[str, dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"window\.ykProductDetails\s*=\s*(\{.*\});\s*$", text, re.S)
    if not match:
        raise ValueError(f"商品説明JSONを読み取れません: {path}")
    return json.loads(match.group(1))


def load_classifications(path: Path | None) -> dict[str, dict]:
    if not path or not path.exists():
        return {}
    result: dict[str, dict] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        result[f"{row['itemId']}:{row['imageNo']}"] = row
    return result


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute("PRAGMA synchronous=NORMAL")
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=30000")
    return connection


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS products (
          item_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          public_url TEXT NOT NULL,
          image_count INTEGER NOT NULL,
          catalog_hash TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS product_images (
          id INTEGER PRIMARY KEY,
          item_id TEXT NOT NULL REFERENCES products(item_id) ON DELETE CASCADE,
          image_no INTEGER NOT NULL,
          original_base_url TEXT,
          current_base_url TEXT,
          classification TEXT NOT NULL DEFAULT 'unclassified',
          text_region_count INTEGER NOT NULL DEFAULT 0,
          text_area REAL NOT NULL DEFAULT 0,
          has_human INTEGER NOT NULL DEFAULT 0,
          processing_decision TEXT NOT NULL DEFAULT 'queued',
          skip_reason TEXT NOT NULL DEFAULT '',
          generation_status TEXT NOT NULL DEFAULT 'queued',
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(item_id, image_no)
        );

        CREATE TABLE IF NOT EXISTS image_versions (
          id INTEGER PRIMARY KEY,
          product_image_id INTEGER NOT NULL REFERENCES product_images(id) ON DELETE CASCADE,
          version_kind TEXT NOT NULL,
          generation_no INTEGER NOT NULL DEFAULT 0,
          model TEXT,
          mime_type TEXT NOT NULL,
          byte_count INTEGER NOT NULL,
          width INTEGER,
          height INTEGER,
          sha256 TEXT NOT NULL,
          binary_data BLOB NOT NULL,
          source_path TEXT,
          review_path TEXT,
          source_url TEXT,
          prompt TEXT,
          created_at TEXT NOT NULL,
          UNIQUE(product_image_id, version_kind, generation_no)
        );

        CREATE TABLE IF NOT EXISTS evaluations (
          id INTEGER PRIMARY KEY,
          image_version_id INTEGER NOT NULL REFERENCES image_versions(id) ON DELETE CASCADE,
          truthfulness INTEGER,
          appearance INTEGER,
          text_logo_integrity INTEGER,
          risk_level TEXT NOT NULL DEFAULT 'unreviewed',
          passed INTEGER NOT NULL DEFAULT 0,
          reasons_json TEXT NOT NULL DEFAULT '[]',
          evaluator TEXT,
          evaluated_at TEXT,
          UNIQUE(image_version_id)
        );

        CREATE TABLE IF NOT EXISTS generation_queue (
          id INTEGER PRIMARY KEY,
          product_image_id INTEGER NOT NULL UNIQUE REFERENCES product_images(id) ON DELETE CASCADE,
          model TEXT NOT NULL,
          prompt TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued',
          priority INTEGER NOT NULL DEFAULT 100,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT NOT NULL DEFAULT '',
          queued_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_product_images_status
          ON product_images(generation_status, processing_decision);
        CREATE INDEX IF NOT EXISTS idx_versions_slot_kind
          ON image_versions(product_image_id, version_kind, generation_no DESC);
        CREATE INDEX IF NOT EXISTS idx_queue_status_priority
          ON generation_queue(status, priority, id);
        """
    )
    connection.execute(
        "INSERT OR REPLACE INTO app_meta(key, value) VALUES('schema_version', ?)",
        (str(SCHEMA_VERSION),),
    )
    connection.commit()


def generation_prompt(title: str, image_no: int) -> str:
    role = (
        "This is the primary listing image; make the product easy to understand at a glance."
        if image_no == 1
        else "This is a supporting/detail image; preserve its original angle and documentary purpose."
    )
    return (
        "Edit this exact product photo for a trustworthy Japanese ecommerce listing. "
        f"Product title: {title}. {role} "
        "Keep the actual product unchanged: exact color, silhouette, proportions, material, stitching, "
        "logo, printed text, labels, accessories, quantity, condition, wear and damage. "
        "Do not redraw, replace, beautify, repair, add or remove any part of the product. "
        "Improve only presentation: clean neutral retail-studio background, balanced exposure, natural shadow, "
        "white balance, framing and a gentle perspective correction when it does not change geometry. "
        "No people, hands, decorative props, extra products, badges or generated text. "
        "Output a clean 1:1 ecommerce image suitable for BASE."
    )


def upsert_version(
    connection: sqlite3.Connection,
    product_image_id: int,
    version_kind: str,
    generation_no: int,
    file_path: Path,
    *,
    model: str | None = None,
    source_url: str | None = None,
    review_path: str | None = None,
    prompt: str | None = None,
) -> int:
    data = file_path.read_bytes()
    width, height = image_dimensions(data)
    mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    created_at = now_iso()
    connection.execute(
        """
        INSERT INTO image_versions(
          product_image_id, version_kind, generation_no, model, mime_type,
          byte_count, width, height, sha256, binary_data, source_path,
          review_path, source_url, prompt, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(product_image_id, version_kind, generation_no) DO UPDATE SET
          model=excluded.model,
          mime_type=excluded.mime_type,
          byte_count=excluded.byte_count,
          width=excluded.width,
          height=excluded.height,
          sha256=excluded.sha256,
          binary_data=excluded.binary_data,
          source_path=excluded.source_path,
          review_path=excluded.review_path,
          source_url=excluded.source_url,
          prompt=excluded.prompt,
          created_at=excluded.created_at
        """,
        (
            product_image_id, version_kind, generation_no, model, mime,
            len(data), width, height, sha256(data), data, str(file_path),
            review_path, source_url, prompt, created_at,
        ),
    )
    row = connection.execute(
        "SELECT id FROM image_versions WHERE product_image_id=? AND version_kind=? AND generation_no=?",
        (product_image_id, version_kind, generation_no),
    ).fetchone()
    return int(row["id"])


def resolve_existing_processed(repo_root: Path, processed_url: str | None) -> Path | None:
    if not processed_url:
        return None
    path = (repo_root / "image-review/all-products" / processed_url).resolve()
    return path if path.is_file() else None


def command_import(args: argparse.Namespace) -> None:
    db_path = Path(args.db).resolve()
    repo_root = Path(args.repo_root).resolve()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    details = load_product_details(Path(args.details))
    classifications = load_classifications(Path(args.classifications) if args.classifications else None)
    original_root = Path(args.original_root).resolve()
    connection = connect(db_path)
    create_schema(connection)

    imported_products = 0
    imported_images = 0
    original_bytes = 0
    processed_bytes = 0
    skipped_documents = 0
    limit = max(0, int(args.limit_images or 0))
    stop = False
    timestamp = now_iso()

    for product in manifest["products"]:
        if stop:
            break
        item_id = str(product["itemId"])
        description = str(details.get(item_id, {}).get("description") or "")
        connection.execute(
            """
            INSERT INTO products(item_id, title, description, public_url, image_count, catalog_hash, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id) DO UPDATE SET
              title=excluded.title,
              description=excluded.description,
              public_url=excluded.public_url,
              image_count=excluded.image_count,
              catalog_hash=excluded.catalog_hash,
              updated_at=excluded.updated_at
            """,
            (
                item_id, product["title"], description, product["publicUrl"],
                product["imageCount"], manifest.get("meta", {}).get("catalogHash"),
                timestamp, timestamp,
            ),
        )
        imported_products += 1

        for image in product["images"]:
            if limit and imported_images >= limit:
                stop = True
                break
            image_no = int(image["imageNo"])
            key = f"{item_id}:{image_no}"
            classification = classifications.get(key, {})
            image_class = str(classification.get("classification") or "unclassified")
            skip_document = image_class == "text_document"
            decision = "skip_text_document" if skip_document else "gpt_image_2"
            generation_status = "skipped" if skip_document else "queued"
            skip_reason = "文字資料のため原本を保持し、GPT Image 2加工を行わない" if skip_document else ""
            connection.execute(
                """
                INSERT INTO product_images(
                  item_id, image_no, original_base_url, current_base_url,
                  classification, text_region_count, text_area, has_human,
                  processing_decision, skip_reason, generation_status,
                  attempts, created_at, updated_at
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(item_id, image_no) DO UPDATE SET
                  original_base_url=excluded.original_base_url,
                  current_base_url=excluded.current_base_url,
                  classification=excluded.classification,
                  text_region_count=excluded.text_region_count,
                  text_area=excluded.text_area,
                  has_human=excluded.has_human,
                  processing_decision=excluded.processing_decision,
                  skip_reason=excluded.skip_reason,
                  generation_status=CASE
                    WHEN product_images.generation_status IN ('completed','approved') THEN product_images.generation_status
                    ELSE excluded.generation_status
                  END,
                  updated_at=excluded.updated_at
                """,
                (
                    item_id, image_no,
                    image.get("originalBaseUrl") or image.get("originalUrl"),
                    image.get("currentBaseUrl"), image_class,
                    int(classification.get("textRegionCount") or 0),
                    float(classification.get("textArea") or 0),
                    1 if classification.get("hasHuman") else 0,
                    decision, skip_reason, generation_status, timestamp, timestamp,
                ),
            )
            slot = connection.execute(
                "SELECT id FROM product_images WHERE item_id=? AND image_no=?",
                (item_id, image_no),
            ).fetchone()
            slot_id = int(slot["id"])

            original_file = original_root / item_id / f"{image_no:02d}.jpg"
            if not original_file.is_file():
                raise FileNotFoundError(f"原本がありません: {original_file}")
            upsert_version(
                connection, slot_id, "original", 0, original_file,
                source_url=image.get("originalBaseUrl") or image.get("originalUrl"),
                review_path=f"../../all-products/originals/{item_id}/{image_no:02d}.jpg",
            )
            original_bytes += original_file.stat().st_size

            processed_file = resolve_existing_processed(repo_root, image.get("processedUrl"))
            if processed_file:
                upsert_version(
                    connection, slot_id, "existing_processed", 0, processed_file,
                    source_url=image.get("currentBaseUrl"),
                    review_path=image.get("processedUrl"),
                )
                processed_bytes += processed_file.stat().st_size

            if skip_document:
                skipped_documents += 1
                connection.execute("DELETE FROM generation_queue WHERE product_image_id=?", (slot_id,))
            else:
                prompt = generation_prompt(str(product["title"]), image_no)
                connection.execute(
                    """
                    INSERT INTO generation_queue(product_image_id, model, prompt, status, priority, attempts, queued_at)
                    VALUES(?, ?, ?, 'queued', ?, 0, ?)
                    ON CONFLICT(product_image_id) DO UPDATE SET
                      model=excluded.model,
                      prompt=excluded.prompt,
                      priority=excluded.priority,
                      status=CASE
                        WHEN generation_queue.status IN ('completed','approved') THEN generation_queue.status
                        ELSE 'queued'
                      END
                    """,
                    (slot_id, MODEL_NAME, prompt, 10 if image_no == 1 else 100, timestamp),
                )

            imported_images += 1
            if imported_images % 40 == 0:
                connection.commit()
                print(json.dumps({"progress": imported_images}, ensure_ascii=False), flush=True)

    connection.execute(
        "INSERT OR REPLACE INTO app_meta(key, value) VALUES('last_import_at', ?)",
        (now_iso(),),
    )
    connection.execute(
        "INSERT OR REPLACE INTO app_meta(key, value) VALUES('generation_model', ?)",
        (MODEL_NAME,),
    )
    connection.commit()
    connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    print(json.dumps({
        "db": str(db_path),
        "products": imported_products,
        "images": imported_images,
        "originalBytes": original_bytes,
        "existingProcessedBytes": processed_bytes,
        "skippedTextDocuments": skipped_documents,
        "queuedForGptImage2": imported_images - skipped_documents,
    }, ensure_ascii=False))


def database_summary(connection: sqlite3.Connection) -> dict:
    scalar = lambda sql: connection.execute(sql).fetchone()[0]
    status_rows = connection.execute(
        "SELECT generation_status, COUNT(*) AS count FROM product_images GROUP BY generation_status ORDER BY generation_status"
    ).fetchall()
    versions = connection.execute(
        "SELECT version_kind, COUNT(*) AS count, COALESCE(SUM(byte_count),0) AS bytes FROM image_versions GROUP BY version_kind ORDER BY version_kind"
    ).fetchall()
    return {
        "products": scalar("SELECT COUNT(*) FROM products"),
        "images": scalar("SELECT COUNT(*) FROM product_images"),
        "queue": scalar("SELECT COUNT(*) FROM generation_queue WHERE status='queued'"),
        "status": {row["generation_status"]: row["count"] for row in status_rows},
        "versions": {
            row["version_kind"]: {"count": row["count"], "bytes": row["bytes"]}
            for row in versions
        },
        "dbBytes": Path(connection.execute("PRAGMA database_list").fetchone()[2]).stat().st_size,
    }


def command_summary(args: argparse.Namespace) -> None:
    connection = connect(Path(args.db).resolve())
    print(json.dumps(database_summary(connection), ensure_ascii=False, indent=2))


def command_export(args: argparse.Namespace) -> None:
    connection = connect(Path(args.db).resolve())
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    products: list[dict] = []
    for product in connection.execute("SELECT * FROM products ORDER BY CAST(item_id AS INTEGER)"):
        images = []
        slots = connection.execute(
            "SELECT * FROM product_images WHERE item_id=? ORDER BY image_no", (product["item_id"],)
        ).fetchall()
        for slot in slots:
            latest = connection.execute(
                """
                SELECT v.*, e.truthfulness, e.appearance, e.text_logo_integrity,
                       e.risk_level, e.passed, e.reasons_json
                FROM image_versions v
                LEFT JOIN evaluations e ON e.image_version_id=v.id
                WHERE v.product_image_id=? AND v.version_kind='gpt_image_2'
                ORDER BY v.generation_no DESC LIMIT 1
                """,
                (slot["id"],),
            ).fetchone()
            images.append({
                "imageNo": slot["image_no"],
                "originalUrl": f"../../all-products/originals/{product['item_id']}/{slot['image_no']:02d}.jpg",
                "processedUrl": latest["review_path"] if latest else None,
                "status": slot["generation_status"],
                "classification": slot["classification"],
                "processingDecision": slot["processing_decision"],
                "skipReason": slot["skip_reason"],
                "attempts": slot["attempts"],
                "scores": None if not latest else {
                    "truthfulness": latest["truthfulness"],
                    "appearance": latest["appearance"],
                    "textLogoIntegrity": latest["text_logo_integrity"],
                    "risk": latest["risk_level"],
                    "passed": bool(latest["passed"]),
                    "reasons": json.loads(latest["reasons_json"] or "[]"),
                },
            })
        products.append({
            "itemId": product["item_id"],
            "title": product["title"],
            "description": product["description"],
            "publicUrl": product["public_url"],
            "imageCount": product["image_count"],
            "images": images,
        })
    summary = database_summary(connection)
    payload = {
        "meta": {
            "schemaVersion": SCHEMA_VERSION,
            "generatedAt": now_iso(),
            "model": MODEL_NAME,
            "productCount": summary["products"],
            "imageCount": summary["images"],
            "queueCount": summary["queue"],
            "status": summary["status"],
            "rule": "商品を変えず、文字資料は生成せず、GPT Image 2版を履歴付きで保存する",
        },
        "products": products,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(output), **summary}, ensure_ascii=False))


def command_record_result(args: argparse.Namespace) -> None:
    connection = connect(Path(args.db).resolve())
    slot = connection.execute(
        "SELECT id, attempts FROM product_images WHERE item_id=? AND image_no=?",
        (str(args.item_id), int(args.image_no)),
    ).fetchone()
    if not slot:
        raise ValueError("対象の商品画像がDBにありません")
    generation_no = int(slot["attempts"]) + 1
    file_path = Path(args.file).resolve()
    prompt_row = connection.execute(
        "SELECT prompt FROM generation_queue WHERE product_image_id=?", (slot["id"],)
    ).fetchone()
    version_id = upsert_version(
        connection, int(slot["id"]), "gpt_image_2", generation_no, file_path,
        model=MODEL_NAME,
        review_path=args.review_path,
        prompt=prompt_row["prompt"] if prompt_row else None,
    )
    reasons = json.loads(args.reasons_json or "[]")
    passed = (
        args.truthfulness >= 90
        and args.appearance >= 85
        and args.text_logo_integrity >= 90
        and args.risk_level == "low"
    )
    connection.execute(
        """
        INSERT INTO evaluations(
          image_version_id, truthfulness, appearance, text_logo_integrity,
          risk_level, passed, reasons_json, evaluator, evaluated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(image_version_id) DO UPDATE SET
          truthfulness=excluded.truthfulness,
          appearance=excluded.appearance,
          text_logo_integrity=excluded.text_logo_integrity,
          risk_level=excluded.risk_level,
          passed=excluded.passed,
          reasons_json=excluded.reasons_json,
          evaluator=excluded.evaluator,
          evaluated_at=excluded.evaluated_at
        """,
        (
            version_id, args.truthfulness, args.appearance, args.text_logo_integrity,
            args.risk_level, 1 if passed else 0, json.dumps(reasons, ensure_ascii=False),
            args.evaluator, now_iso(),
        ),
    )
    status = "review_pending" if passed else "regenerate"
    connection.execute(
        "UPDATE product_images SET generation_status=?, attempts=?, updated_at=? WHERE id=?",
        (status, generation_no, now_iso(), slot["id"]),
    )
    connection.execute(
        "UPDATE generation_queue SET status=?, attempts=?, completed_at=?, last_error=? WHERE product_image_id=?",
        ("completed" if passed else "queued", generation_no, now_iso(), "" if passed else "; ".join(reasons), slot["id"]),
    )
    connection.commit()
    print(json.dumps({
        "itemId": str(args.item_id), "imageNo": int(args.image_no),
        "generationNo": generation_no, "passed": passed, "status": status,
    }, ensure_ascii=False))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    importer = subparsers.add_parser("import")
    importer.add_argument("--db", required=True)
    importer.add_argument("--repo-root", required=True)
    importer.add_argument("--manifest", required=True)
    importer.add_argument("--details", required=True)
    importer.add_argument("--original-root", required=True)
    importer.add_argument("--classifications")
    importer.add_argument("--limit-images", type=int, default=0)
    importer.set_defaults(func=command_import)

    summary = subparsers.add_parser("summary")
    summary.add_argument("--db", required=True)
    summary.set_defaults(func=command_summary)

    exporter = subparsers.add_parser("export-review")
    exporter.add_argument("--db", required=True)
    exporter.add_argument("--output", required=True)
    exporter.set_defaults(func=command_export)

    recorder = subparsers.add_parser("record-result")
    recorder.add_argument("--db", required=True)
    recorder.add_argument("--item-id", required=True)
    recorder.add_argument("--image-no", type=int, required=True)
    recorder.add_argument("--file", required=True)
    recorder.add_argument("--review-path", required=True)
    recorder.add_argument("--truthfulness", type=int, required=True)
    recorder.add_argument("--appearance", type=int, required=True)
    recorder.add_argument("--text-logo-integrity", type=int, required=True)
    recorder.add_argument("--risk-level", choices=["low", "medium", "high"], required=True)
    recorder.add_argument("--reasons-json", default="[]")
    recorder.add_argument("--evaluator", default="Codex visual QA")
    recorder.set_defaults(func=command_record_result)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

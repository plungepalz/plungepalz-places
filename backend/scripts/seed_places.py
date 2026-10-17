#!/usr/bin/env python3
"""Seed real sauna and cold plunge places via POST /submit.

Does not call AI providers and does not embed API keys. The Places API base
URL comes from --base-url or PLACES_API_BASE_URL.

Usage (from backend/):

    python scripts/seed_places.py --base-url https://{api-id}.execute-api.us-east-1.amazonaws.com/dev --dry-run
    python scripts/seed_places.py --limit 10 --output scripts/seed_data/.seed_places_created.json

Then approve some of the created ids (plumbing only; do not run from here):

    python scripts/review_place.py --from-file scripts/seed_data/.seed_places_created.json --limit 5 --decision active
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Allow running without installing the layer
sys.path.insert(
    0,
    str(Path(__file__).resolve().parent.parent / "lambda_layers" / "places_common" / "python"),
)

from places_common.validate import validate_submit_body  # noqa: E402

DEFAULT_SEED_FILE = Path(__file__).resolve().parent / "seed_data" / "places_seed.json"
DEFAULT_STATE_FILE = Path(__file__).resolve().parent / "seed_data" / ".seed_places_state.json"
DEFAULT_OUTPUT_FILE = Path(__file__).resolve().parent / "seed_data" / ".seed_places_created.json"
MATCH_RADIUS_M = 200.0
SEARCH_RADIUS_KM = 1.0
USER_AGENT = "PlungePalzPlacesSeed/1.0 (https://github.com/plungepalz/plungepalz-places)"

_PUNCT_RE = re.compile(r"[^a-z0-9]+")


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def normalize_name(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = _PUNCT_RE.sub(" ", text)
    return " ".join(text.split())


def seed_key(entry: dict[str, Any]) -> str:
    name = normalize_name(entry.get("name") or entry.get("place_name") or "")
    slug = name.replace(" ", "-")
    lat = float(entry["lat"])
    lng = float(entry["lng"])
    return f"{slug}:{lat:.4f}:{lng:.4f}"


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(min(1.0, a)))


def names_match(left: str, right: str) -> bool:
    return normalize_name(left) == normalize_name(right)


def is_confident_match(entry: dict[str, Any], place: dict[str, Any], radius_m: float = MATCH_RADIUS_M) -> bool:
    place_name = place.get("place_name") or place.get("name") or ""
    if not names_match(entry.get("name") or "", place_name):
        return False
    try:
        plat = float(place["lat"])
        plng = float(place["lng"])
        elat = float(entry["lat"])
        elng = float(entry["lng"])
    except (KeyError, TypeError, ValueError):
        return False
    return haversine_m(elat, elng, plat, plng) <= radius_m


def load_seed_entries(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        entries = raw.get("places")
    else:
        entries = raw
    if not isinstance(entries, list):
        raise ValueError("seed file must be a list or an object with a places array")
    cleaned: list[dict[str, Any]] = []
    for item in entries:
        if not isinstance(item, dict):
            raise ValueError("each seed entry must be an object")
        cleaned.append(item)
    return cleaned


def submit_payload(entry: dict[str, Any]) -> dict[str, Any]:
    """Map a seed row to the documented POST /submit body and validate it."""
    body: dict[str, Any] = {
        "place_name": entry["name"],
        "place_type": entry["place_type"],
        "activity_types": list(entry["activity_types"]),
        "lat": float(entry["lat"]),
        "lng": float(entry["lng"]),
    }
    address = entry.get("address")
    if isinstance(address, str) and address.strip():
        body["address"] = address.strip()
    description = entry.get("description")
    if isinstance(description, str) and description.strip():
        body["description"] = description.strip()
    return validate_submit_body(body)


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def resolve_base_url(cli_value: str | None) -> str:
    base = (cli_value or os.environ.get("PLACES_API_BASE_URL") or "").strip().rstrip("/")
    if not base:
        raise SystemExit("Provide --base-url or set PLACES_API_BASE_URL")
    return base


def http_json(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    timeout: float = 30.0,
) -> tuple[int, dict[str, Any]]:
    data = None
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
            return int(resp.status), parsed if isinstance(parsed, dict) else {"data": parsed}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"error": {"message": raw}}
        if not isinstance(parsed, dict):
            parsed = {"error": {"message": raw}}
        return int(exc.code), parsed


def find_existing_place(base_url: str, entry: dict[str, Any]) -> dict[str, Any] | None:
    params = {
        "q": entry["name"],
        "lat": str(entry["lat"]),
        "lng": str(entry["lng"]),
        "radius_km": str(SEARCH_RADIUS_KM),
        "limit": "20",
    }
    url = f"{base_url}/search?{urllib.parse.urlencode(params)}"
    status, payload = http_json("GET", url)
    if status != 200:
        raise RuntimeError(f"search failed ({status}): {payload}")
    for place in payload.get("places") or []:
        if isinstance(place, dict) and is_confident_match(entry, place):
            return place
    return None


def write_created_output(path: Path, created: list[dict[str, Any]]) -> None:
    save_json(
        path,
        {
            "created": created,
            "place_ids": [row["place_id"] for row in created],
        },
    )


def run(args: argparse.Namespace) -> int:
    seed_path = Path(args.seed_file)
    state_path = Path(args.state_file)
    output_path = Path(args.output)
    entries = load_seed_entries(seed_path)
    if args.limit is not None:
        entries = entries[: args.limit]

    state = load_state(state_path)
    created: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    failed: list[dict[str, str]] = []

    dry_run = bool(args.dry_run)
    base_url = None if dry_run else resolve_base_url(args.base_url)

    for entry in entries:
        key = seed_key(entry)
        name = entry.get("name") or ""
        try:
            payload = submit_payload(entry)
        except Exception as exc:
            failed.append({"key": key, "name": name, "reason": f"invalid seed: {exc}"})
            continue

        if key in state and isinstance(state[key], dict) and state[key].get("place_id"):
            skipped.append({"key": key, "name": name, "reason": "state_file"})
            continue

        if dry_run:
            print(json.dumps({"dry_run": True, "key": key, "payload": payload}))
            created.append({"key": key, "place_id": None, "place_name": payload["place_name"]})
            continue

        try:
            existing = find_existing_place(base_url, entry)
        except Exception as exc:
            failed.append({"key": key, "name": name, "reason": f"search: {exc}"})
            continue
        if existing and existing.get("place_id"):
            skipped.append({"key": key, "name": name, "reason": "existing_match"})
            state[key] = {
                "place_id": existing["place_id"],
                "place_name": existing.get("place_name") or name,
                "source": "search",
                "ts": utc_now(),
            }
            continue

        try:
            status, body = http_json("POST", f"{base_url}/submit", payload)
        except Exception as exc:
            failed.append({"key": key, "name": name, "reason": f"submit: {exc}"})
            continue
        if status != 201 or not body.get("place_id"):
            failed.append({"key": key, "name": name, "reason": f"submit {status}: {body}"})
            continue

        place_id = body["place_id"]
        created.append({"key": key, "place_id": place_id, "place_name": payload["place_name"]})
        state[key] = {
            "place_id": place_id,
            "place_name": payload["place_name"],
            "source": "submit",
            "ts": utc_now(),
        }

    if not dry_run:
        save_json(state_path, state)
        write_created_output(output_path, created)

    summary = {
        "created": len([row for row in created if row.get("place_id")]),
        "skipped": len(skipped),
        "failed": len(failed),
        "dry_run": dry_run,
        "created_place_ids": [row["place_id"] for row in created if row.get("place_id")],
        "skipped_entries": skipped,
        "failed_entries": failed,
        "output": None if dry_run else str(output_path),
    }
    print(json.dumps(summary, indent=2))
    return 1 if failed else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Seed PlungePalz places via POST /submit")
    parser.add_argument(
        "--base-url",
        default=None,
        help="Places API base URL (or set PLACES_API_BASE_URL). Never hardcoded.",
    )
    parser.add_argument("--seed-file", default=str(DEFAULT_SEED_FILE), help="JSON seed data")
    parser.add_argument(
        "--state-file",
        default=str(DEFAULT_STATE_FILE),
        help="gitignored mapping of seed key -> place_id",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_FILE),
        help="JSON file of created place_ids for review_place.py --from-file",
    )
    parser.add_argument("--limit", type=int, default=None, help="Process at most N seed entries")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print payloads that would be sent; make no HTTP requests",
    )
    return parser


def main() -> int:
    return run(build_parser().parse_args())


if __name__ == "__main__":
    raise SystemExit(main())

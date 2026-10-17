#!/usr/bin/env python3
"""
Run generate_place_with_ai layer tests directly.

Usage:
  python scripts/run_layer_test.py generate_place_with_ai Test_001
  USE_CLAUDE_AGENT_SDK=1 python scripts/run_layer_test.py generate_place_with_ai Test_001

Loads input.json from tests/{layer_name}/{test_folder}/, injects API keys from .env,
calls generate_place_record(), and prints/writes the result.
"""

import argparse
import json
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
os.chdir(REPO_ROOT)
sys.path.insert(0, str(REPO_ROOT / "layers" / "generate_place_with_ai" / "python"))


def _load_dotenv():
    """Load .env into os.environ."""
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and v and os.environ.get(k) is None:
                    os.environ[k] = v


_load_dotenv()


def main():
    parser = argparse.ArgumentParser(
        description="Run generate_place_with_ai layer test with input.json"
    )
    parser.add_argument(
        "layer_name",
        help="Layer name (e.g. generate_place_with_ai)",
    )
    parser.add_argument(
        "test_folder",
        help="Test folder name (e.g. Test_001)",
    )
    parser.add_argument(
        "--output",
        action="store_true",
        help="Write result to output.json in the test folder",
    )
    args = parser.parse_args()

    if args.layer_name != "generate_place_with_ai":
        print(f"Error: Only 'generate_place_with_ai' is supported. Got: {args.layer_name}")
        sys.exit(1)

    test_dir = REPO_ROOT / "tests" / args.layer_name / args.test_folder
    input_path = test_dir / "input.json"

    if not input_path.exists():
        print(f"Error: {input_path} not found")
        sys.exit(1)

    with open(input_path, encoding="utf-8") as f:
        inp = json.load(f)

    # Inject from .env when empty in input
    google_key = inp.get("google_places_api_key") or os.environ.get("GOOGLE_PLACES_API_KEY", "")
    anthropic_key = (
        inp.get("anthropic_api_key")
        or os.environ.get("ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY", "")
    )
    model_id = inp.get("model_id") or os.environ.get("ANTHROPIC_MODEL_ID", "claude-3-5-haiku-latest")

    from generate_place_with_ai import generate_place_record

    result = generate_place_record(
        place_name=inp["place_name"],
        place_type=inp["place_type"],
        place_location=inp["place_location"],
        activity_types=inp.get("activity_types", ["cold_plunge"]),
        google_places_api_key=google_key,
        anthropic_api_key=anthropic_key,
        model_id=model_id,
        submission_id=inp.get("submission_id", "sub_test"),
    )

    def _serialize(obj):
        if hasattr(obj, "default"):
            return float(obj)
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    print("--- Result ---")
    try:
        out_json = json.dumps(result, indent=2, default=lambda o: float(o) if hasattr(o, "__float__") else str(o))
    except TypeError:
        out_json = json.dumps(result, indent=2, default=str)
    print(out_json)

    if args.output:
        output_path = test_dir / "output.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nWrote {output_path}")


if __name__ == "__main__":
    main()

"""CORS, JSON encoding, and the canonical API error/success envelope."""

from __future__ import annotations

import json
import os
from decimal import Decimal
from typing import Any


class ValidationError(Exception):
    """400-class validation failure with optional per-field details."""

    def __init__(
        self,
        message: str,
        details: dict[str, str] | None = None,
        code: str = "VALIDATION_ERROR",
    ):
        super().__init__(message)
        self.message = message
        self.details = details or {}
        self.code = code


def cors_headers() -> dict[str, str]:
    origin = os.environ.get("CORS_ALLOWED_ORIGIN") or "*"
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": (
            "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token"
        ),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    }


def _json_default(obj: Any) -> Any:
    if isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        return float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def json_dumps(payload: Any) -> str:
    return json.dumps(payload, default=_json_default, allow_nan=False)


def success_response(status_code: int, body: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": cors_headers(),
        "body": json_dumps(body),
    }


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: dict[str, str] | None = None,
) -> dict:
    error: dict[str, Any] = {"code": code, "message": message}
    if details:
        error["details"] = details
    return {
        "statusCode": status_code,
        "headers": cors_headers(),
        "body": json_dumps({"error": error}),
    }


def parse_json_body(event: dict | None) -> dict:
    """Parse API Gateway JSON body. Returns {} for empty. Raises ValidationError on bad JSON."""
    event = event or {}
    body = event.get("body")
    if body is None or body == "":
        return {}
    if isinstance(body, (dict, list)):
        if isinstance(body, list):
            raise ValidationError(
                "Request body must be a JSON object",
                {"body": "Request body must be a JSON object"},
            )
        return body
    if not isinstance(body, str):
        raise ValidationError(
            "Request body must be JSON",
            {"body": "Request body must be JSON"},
        )
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        raise ValidationError(
            "Invalid JSON body",
            {"body": "Body is not valid JSON"},
        ) from None
    if not isinstance(parsed, dict):
        raise ValidationError(
            "Request body must be a JSON object",
            {"body": "Request body must be a JSON object"},
        )
    return parsed

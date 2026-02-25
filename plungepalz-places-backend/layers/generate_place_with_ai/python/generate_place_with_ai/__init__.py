"""
PlungePalz Places API — generate_place_with_ai Lambda Layer

Calls Google Places New API v1 + Claude Haiku via Bedrock to produce a fully
populated Places_Places record. NO DynamoDB writes — pure input/output.
"""

from .core import generate_place_record

__all__ = ["generate_place_record"]

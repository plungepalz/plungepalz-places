"""
PlungePalz Places API — Places_AlgoliaSync

DynamoDB stream consumer for Places_Places.
INSERT/MODIFY → upsert Algolia object (unless rejected/hidden).
Rejected, hidden, or REMOVE → delete objectID=place_id.

Idempotent: Algolia save_objects overwrites by objectID; deletes of missing IDs are ignored.
Batch-friendly: one save_objects and one delete_objects per stream batch.
"""

import os

from places_common.records import (
    algolia_object_from_place,
    deserialize_stream_image,
    should_delete_from_algolia,
    to_jsonable,
)


def _get_index():
    app_id = os.environ.get("ALGOLIA_APP_ID") or ""
    api_key = os.environ.get("ALGOLIA_WRITE_API_KEY") or ""
    index_name = os.environ.get("ALGOLIA_INDEX_NAME") or "places_dev"
    if not app_id or not api_key:
        raise RuntimeError("Algolia write is not configured")
    from algoliasearch.search_client import SearchClient

    return SearchClient.create(app_id, api_key).init_index(index_name)


def _place_id_from(image: dict, keys: dict) -> str | None:
    if image.get("place_id"):
        return str(image["place_id"])
    if keys.get("place_id"):
        return str(keys["place_id"])
    return None


def handler(event, context):
    records = (event or {}).get("Records") or []
    upserts: dict[str, dict] = {}
    deletes: set[str] = set()

    for record in records:
        event_name = record.get("eventName") or ""
        ddb = record.get("dynamodb") or {}
        keys = deserialize_stream_image(ddb.get("Keys") or {})
        new_image = deserialize_stream_image(ddb.get("NewImage") or {})
        old_image = deserialize_stream_image(ddb.get("OldImage") or {})

        if event_name == "REMOVE" or not new_image:
            place_id = _place_id_from(old_image, keys)
            if place_id:
                deletes.add(place_id)
                upserts.pop(place_id, None)
            continue

        place = to_jsonable(new_image)
        place_id = _place_id_from(place, keys)
        if not place_id:
            continue

        if should_delete_from_algolia(place):
            deletes.add(place_id)
            upserts.pop(place_id, None)
            continue

        deletes.discard(place_id)
        upserts[place_id] = algolia_object_from_place(place)

    if not upserts and not deletes:
        return {"upserted": 0, "deleted": 0}

    index = _get_index()
    if upserts:
        # save_objects is idempotent by objectID
        index.save_objects(list(upserts.values()))
    if deletes:
        index.delete_objects(list(deletes))

    return {"upserted": len(upserts), "deleted": len(deletes)}

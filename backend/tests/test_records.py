"""places_common record helpers."""

from places_common.constants import REVIEW_REVERT_REMOVE_ATTRS
from places_common.records import generate_place_slug, review_item_update_kwargs


def test_generate_place_slug_appends_place_id_suffix():
    place_id_a = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    place_id_b = "ffffffff-0000-0000-0000-00000000abcd"
    slug_a = generate_place_slug("Plunge Lab", "Salt Lake City", place_id_a)
    slug_b = generate_place_slug("Plunge Lab", "Salt Lake City", place_id_b)
    assert slug_a != slug_b
    assert slug_a.startswith("plunge-lab-salt-lake-city-")
    assert slug_a.endswith("34567890")
    assert slug_b.endswith("0000abcd")


def test_generate_place_slug_same_name_city_without_id_still_collides():
    assert generate_place_slug("Plunge Lab", "Salt Lake City") == generate_place_slug(
        "Plunge Lab", "Salt Lake City"
    )
    assert generate_place_slug("Plunge Lab", "Salt Lake City") == "plunge-lab-salt-lake-city"


def test_review_item_update_kwargs_revert_removes_approval_fields():
    kwargs = review_item_update_kwargs(
        "pid", "in_review", comments=None, ts="2026-01-01T00:00:00Z"
    )
    expr = kwargs["UpdateExpression"]
    assert expr.startswith("SET ")
    assert "internal_status = :st" in expr
    assert "internal_verified = :iv" in expr
    assert "REMOVE " in expr
    for attr in REVIEW_REVERT_REMOVE_ATTRS:
        assert attr in expr.split("REMOVE ", 1)[1]
    values = kwargs["ExpressionAttributeValues"]
    assert values[":st"] == "in_review"
    assert values[":iv"] is False
    assert ":c" not in values
    assert kwargs["Key"] == {"place_id": "pid"}
    assert kwargs["ConditionExpression"] == "attribute_exists(place_id)"


def test_review_item_update_kwargs_active_does_not_remove():
    kwargs = review_item_update_kwargs(
        "pid", "active", comments="looks good", ts="2026-01-01T00:00:00Z"
    )
    assert "REMOVE" not in kwargs["UpdateExpression"]
    assert "internal_verified" not in kwargs["UpdateExpression"]
    assert kwargs["ExpressionAttributeValues"][":st"] == "active"
    assert kwargs["ExpressionAttributeValues"][":c"] == "looks good"

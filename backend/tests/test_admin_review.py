"""Places_AdminReview: flipping is_approved and reverting to in_review."""

from __future__ import annotations

from places_common.constants import REVIEW_APPROVAL_COMPARE_ATTRS, REVIEW_REVERT_REMOVE_ATTRS
from places_common.records import is_approved
from tests.conftest import SAMPLE_PLACE, api_event, load_handler, parse_body
from tests.test_submit import VALID as SUBMIT_BODY


def _approval_related(item: dict) -> dict:
    return {key: item.get(key) for key in REVIEW_APPROVAL_COMPARE_ATTRS}


def test_admin_review_approve_flips_is_approved(dynamodb_tables):
    dynamodb_tables.Table("Places_Places").put_item(Item=dict(SAMPLE_PLACE))
    review = load_handler("Places_AdminReview")
    resp = review.handler(
        api_event(
            body={
                "place_id": SAMPLE_PLACE["place_id"],
                "decision": "active",
                "internal_comments": "looks good",
            }
        ),
        None,
    )
    assert resp["statusCode"] == 200
    body = parse_body(resp)
    assert body["internal_status"] == "active"
    assert body["is_approved"] is True

    stored = dynamodb_tables.Table("Places_Places").get_item(
        Key={"place_id": SAMPLE_PLACE["place_id"]}
    )["Item"]
    assert stored["internal_status"] == "active"
    assert stored["internal_comments"] == "looks good"
    assert stored["ts_last_updated"] != SAMPLE_PLACE["ts_last_updated"]

    getby = load_handler("Places_GetByID")
    public = parse_body(
        getby.handler(api_event(path_parameters={"place_id": SAMPLE_PLACE["place_id"]}), None)
    )
    assert public["is_approved"] is True
    assert "internal_status" not in public


def test_admin_review_reject(dynamodb_tables):
    dynamodb_tables.Table("Places_Places").put_item(Item=dict(SAMPLE_PLACE))
    review = load_handler("Places_AdminReview")
    resp = review.handler(
        api_event(body={"place_id": SAMPLE_PLACE["place_id"], "decision": "rejected"}),
        None,
    )
    assert resp["statusCode"] == 200
    assert parse_body(resp)["is_approved"] is False

    getby = load_handler("Places_GetByID")
    resp = getby.handler(
        api_event(path_parameters={"place_id": SAMPLE_PLACE["place_id"]}), None
    )
    assert resp["statusCode"] == 404


def test_admin_review_404_and_400(dynamodb_tables):
    review = load_handler("Places_AdminReview")
    resp = review.handler(api_event(body={"place_id": "missing", "decision": "active"}), None)
    assert resp["statusCode"] == 404

    resp = review.handler(
        api_event(body={"place_id": SAMPLE_PLACE["place_id"], "decision": "approved"}),
        None,
    )
    assert resp["statusCode"] == 400
    assert "decision" in parse_body(resp)["error"]["details"]

    resp = review.handler(
        api_event(body={"place_id": SAMPLE_PLACE["place_id"], "decision": "pending"}),
        None,
    )
    assert resp["statusCode"] == 400
    assert "decision" in parse_body(resp)["error"]["details"]


def test_admin_review_revert_matches_fresh_submit_approval_fields(dynamodb_tables):
    """Reverted approval slice must match a freshly submitted Places_Submit item."""
    table = dynamodb_tables.Table("Places_Places")
    submit = load_handler("Places_Submit")
    review = load_handler("Places_AdminReview")

    fresh_body = parse_body(submit.handler(api_event(body=SUBMIT_BODY), None))
    assert fresh_body["is_approved"] is False
    fresh = table.get_item(Key={"place_id": fresh_body["place_id"]})["Item"]

    reverted_body = parse_body(
        submit.handler(api_event(body={**SUBMIT_BODY, "place_name": "Other Lab"}), None)
    )
    place_id = reverted_body["place_id"]
    approve = review.handler(api_event(body={"place_id": place_id, "decision": "active"}), None)
    assert approve["statusCode"] == 200
    assert parse_body(approve)["is_approved"] is True

    # Leftover / active-path approval attrs that a fresh Submit never writes.
    table.update_item(
        Key={"place_id": place_id},
        UpdateExpression=(
            "SET is_approved = :t, reviewed_ts = :rts, reviewed_by = :rb, "
            "ts_reviewed = :tr, reviewer = :rv, internal_verified = :iv, "
            "internal_comments = :c, internal_verified_ts = :ivt"
        ),
        ExpressionAttributeValues={
            ":t": True,
            ":rts": "2026-03-01T00:00:00Z",
            ":rb": "admin_user_1",
            ":tr": "2026-03-01T00:00:00Z",
            ":rv": "admin_user_1",
            ":iv": True,
            ":c": "demo approved",
            ":ivt": "2026-03-01T00:00:00Z",
        },
    )

    resp = review.handler(api_event(body={"place_id": place_id, "decision": "in_review"}), None)
    assert resp["statusCode"] == 200
    body = parse_body(resp)
    assert body["internal_status"] == "in_review"
    assert body["is_approved"] is False

    reverted = table.get_item(Key={"place_id": place_id})["Item"]
    assert _approval_related(reverted) == _approval_related(fresh)
    assert reverted["internal_status"] == "in_review"
    assert fresh["internal_status"] == "in_review"
    assert "is_approved" not in reverted
    assert "is_approved" not in fresh
    for attr in REVIEW_REVERT_REMOVE_ATTRS:
        assert attr not in reverted
        assert attr not in fresh
    assert reverted["internal_verified"] is False
    assert fresh["internal_verified"] is False
    assert "internal_comments" not in reverted
    assert "internal_comments" not in fresh
    assert "internal_verified_ts" not in reverted
    assert "internal_verified_ts" not in fresh
    assert is_approved(reverted) is False
    assert is_approved(fresh) is False

    getby = load_handler("Places_GetByID")
    public = parse_body(getby.handler(api_event(path_parameters={"place_id": place_id}), None))
    assert public["is_approved"] is False
    assert "internal_status" not in public

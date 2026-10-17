"""Places_AdminReview: flipping is_approved."""

from __future__ import annotations

from tests.conftest import SAMPLE_PLACE, api_event, load_handler, parse_body


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

"""places_common record helpers."""

import pytest

from places_common.constants import PLACE_DETAIL_FIELDS, PLACE_SUMMARY_FIELDS, REVIEW_REVERT_REMOVE_ATTRS
from places_common.records import (
    algolia_object_from_place,
    generate_place_slug,
    parse_address_parts,
    place_detail,
    place_summary,
    review_item_update_kwargs,
)

PARSER_CASES = [
    (
        "US City, ST ZIP",
        "457 E 300 S, Salt Lake City, UT 84111",
        {
            "city": "Salt Lake City",
            "state_province": "UT",
            "postal_code": "84111",
        },
    ),
    (
        "US with USA country token",
        "457 East 300 South, Salt Lake City, UT 84111, USA",
        {
            "city": "Salt Lake City",
            "state_province": "UT",
            "country": "USA",
            "postal_code": "84111",
        },
    ),
    (
        "US ZIP+4",
        "100 Main St, Austin, TX 78746-1234, USA",
        {
            "city": "Austin",
            "state_province": "TX",
            "country": "USA",
            "postal_code": "78746-1234",
        },
    ),
    (
        "FI NNNNN City",
        "Hernesaarenranta 4, 00150 Helsinki, Finland",
        {"city": "Helsinki", "country": "Finland", "postal_code": "00150"},
    ),
    (
        "FI 00570 Helsinki",
        "Kansanpuistonpolku 5, 00570 Helsinki, Finland",
        {"city": "Helsinki", "country": "Finland", "postal_code": "00570"},
    ),
    (
        "DE NNNNN City",
        "Seydlitzstraße 6, 10557 Berlin, Germany",
        {"city": "Berlin", "country": "Germany", "postal_code": "10557"},
    ),
    (
        "NO NNNN City",
        "Kongeveien 65, 1412 Sofiemyr, Norway",
        {"city": "Sofiemyr", "country": "Norway", "postal_code": "1412"},
    ),
    (
        "IS NNN City",
        "Vesturvör 44, 200 Kópavogur, Iceland",
        {"city": "Kópavogur", "country": "Iceland", "postal_code": "200"},
    ),
    (
        "SE NNN NN City",
        "Hamndalsvägen 6, 132 81 Saltsjö-Boo, Sweden",
        {"city": "Saltsjö-Boo", "country": "Sweden", "postal_code": "132 81"},
    ),
    (
        "NZ City NNNN",
        "42 Amuri Avenue, Hanmer Springs 7334, New Zealand",
        {"city": "Hanmer Springs", "country": "New Zealand", "postal_code": "7334"},
    ),
    (
        "KR City NNNNN",
        "35 Centum nam-daero, Haeundae-gu, Busan 48058, South Korea",
        {"city": "Busan", "country": "South Korea", "postal_code": "48058"},
    ),
    (
        "JP City NNN-NNNN",
        "1-1-2 Kabukicho, Shinjuku-ku, Tokyo 160-0021, Japan",
        {"city": "Tokyo", "country": "Japan", "postal_code": "160-0021"},
    ),
    (
        "UK City POSTCODE",
        "Eastway Baths, 80 Eastway, London E9 5JH, United Kingdom",
        {"city": "London", "country": "United Kingdom", "postal_code": "E9 5JH"},
    ),
    (
        "UK outward inward",
        "404-406 Chiswick High Road, London W4 5TF, United Kingdom",
        {"city": "London", "country": "United Kingdom", "postal_code": "W4 5TF"},
    ),
    (
        "AU City ST NNNN VIC",
        "140 Springs Lane, Fingal VIC 3939, Australia",
        {
            "city": "Fingal",
            "state_province": "VIC",
            "country": "Australia",
            "postal_code": "3939",
        },
    ),
    (
        "AU City ST NNNN NSW",
        "1 Notts Avenue, Bondi Beach NSW 2026, Australia",
        {
            "city": "Bondi Beach",
            "state_province": "NSW",
            "country": "Australia",
            "postal_code": "2026",
        },
    ),
    (
        "AU QLD",
        "1 Beach Rd, Cairns QLD 4870, Australia",
        {"city": "Cairns", "state_province": "QLD", "country": "Australia", "postal_code": "4870"},
    ),
    (
        "AU WA",
        "1 St Georges Tce, Perth WA 6000, Australia",
        {"city": "Perth", "state_province": "WA", "country": "Australia", "postal_code": "6000"},
    ),
    (
        "AU SA",
        "1 North Tce, Adelaide SA 5000, Australia",
        {"city": "Adelaide", "state_province": "SA", "country": "Australia", "postal_code": "5000"},
    ),
    (
        "AU TAS",
        "1 Salamanca Pl, Hobart TAS 7000, Australia",
        {"city": "Hobart", "state_province": "TAS", "country": "Australia", "postal_code": "7000"},
    ),
    (
        "AU ACT",
        "1 London Circuit, Canberra ACT 2601, Australia",
        {"city": "Canberra", "state_province": "ACT", "country": "Australia", "postal_code": "2601"},
    ),
    (
        "AU NT",
        "1 The Mall, Darwin NT 0800, Australia",
        {"city": "Darwin", "state_province": "NT", "country": "Australia", "postal_code": "0800"},
    ),
    (
        "CA City, PR A1A 1A1",
        "425 Adelaide Street West, Toronto, ON M5V 3C1, Canada",
        {
            "city": "Toronto",
            "state_province": "ON",
            "country": "Canada",
            "postal_code": "M5V 3C1",
        },
    ),
    (
        "US city, ST no zip is not a country",
        "123 Main St, Phoenix, AZ",
        {"city": "Phoenix", "state_province": "AZ"},
    ),
    (
        "US city ST ZIP no comma",
        "Scottsdale AZ 85258",
        {"city": "Scottsdale", "state_province": "AZ", "postal_code": "85258"},
    ),
    (
        "US last part city ST ZIP no comma",
        "7349 N Via Paseo Del Sur Suite 535, Scottsdale AZ 85258",
        {"city": "Scottsdale", "state_province": "AZ", "postal_code": "85258"},
    ),
    ("one-part street", "100 Main St", {}),
    ("one-part Finnish street", "Kansanpuistonpolku 5", {}),
    ("one-part country name", "Canada", {}),
    ("one-part city name", "Helsinki", {}),
]


@pytest.mark.parametrize("label,address,expected", PARSER_CASES)
def test_parse_address_parts_table(label, address, expected):
    assert parse_address_parts(address) == expected, label


def test_parse_address_parts_does_not_infer_country_from_digits():
    parsed = parse_address_parts("457 E 300 S, Salt Lake City, UT 84111")
    assert "country" not in parsed
    assert parsed["city"] == "Salt Lake City"
    parsed_de = parse_address_parts("Seydlitzstraße 6, 10557 Berlin, Germany")
    assert parsed_de["country"] == "Germany"
    assert parsed_de["country"] != "US"


def _place_for_mapping(**overrides):
    base = {
        "place_id": "p1",
        "place_slug": "plunge-lab-salt-lake-city",
        "place_name": "Plunge Lab",
        "place_type": "business",
        "address": "457 E 300 S, Salt Lake City, UT 84111",
        "city": "Salt Lake City",
        "state_province": "UT",
        "country": "USA",
        "activity_types": ["sauna"],
        "description": "Studio",
        "lat": 40.7608,
        "lng": -111.891,
        "internal_status": "in_review",
        "ts_created": "2026-02-20T12:00:00Z",
    }
    base.update(overrides)
    return base


def test_algolia_object_from_place_omits_missing_postal_code():
    place = _place_for_mapping()
    assert "postal_code" not in place
    obj = algolia_object_from_place(place)
    assert "postal_code" not in obj
    summary = place_summary(place)
    assert "postal_code" not in summary
    assert set(summary) <= set(PLACE_SUMMARY_FIELDS)
    detail = place_detail(place)
    assert "postal_code" not in detail
    assert set(detail) == set(PLACE_DETAIL_FIELDS)


def test_algolia_object_from_place_includes_postal_code_when_present():
    place = _place_for_mapping(postal_code="84111")
    obj = algolia_object_from_place(place)
    assert obj["postal_code"] == "84111"
    assert place_summary(place)["city"] == "Salt Lake City"
    assert "postal_code" not in place_detail(place)


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
        "pid", "in_review", comments="should not persist", ts="2026-01-01T00:00:00Z"
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

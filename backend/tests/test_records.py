"""places_common record helpers."""

from places_common.records import generate_place_slug


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

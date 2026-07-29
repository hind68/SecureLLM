from app.pipeline.masking import mask_text, build_placeholder


def test_build_placeholder_uses_id():
    match = {"id": "email_1", "type": "email"}
    assert build_placeholder(match) == "[EMAIL_1]"

def test_mask_single_match():
    text = "Contact john@company.com now"
    matches = [{"id": "email_1", "type": "email", "start": 8, "end": 24}]
    masked = mask_text(text, matches)
    assert masked == "Contact [EMAIL_1] now"

def test_mask_multiple_matches_no_offset_corruption():
    text = "Email a@b.com or call 0612345678"
    matches = [
        {"id": "email_1", "type": "email", "start": 6, "end": 14},
        {"id": "phone_1", "type": "phone", "start": 23, "end": 33},
    ]
    masked = mask_text(text, matches)
    assert "[EMAIL_1]" in masked
    assert "[PHONE_1]" in masked

def test_mask_no_matches_returns_original():
    text = "Nothing sensitive here."
    assert mask_text(text, []) == text


def test_openai_api_key_placeholder_uses_generic_api_key_label():
    match = {"id": "openai_api_key_1", "type": "openai_api_key"}
    assert build_placeholder(match) == "[API_KEY_1]"


def test_masking_replaces_from_end_without_extra_brackets():
    text = "A [LOCATION_2] B sk-proj-abcdefghijklmnopqrstuvwxyz1234567890"
    matches = [
        {"id": "location_1", "type": "location", "start": 2, "end": 14},
        {"id": "openai_api_key_1", "type": "openai_api_key", "start": 17, "end": len(text)},
    ]

    masked = mask_text(text, matches)

    assert masked == "A [LOCATION_1] B [API_KEY_1]"
    assert "]]" not in masked

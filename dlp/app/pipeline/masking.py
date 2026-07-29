_PLACEHOLDER_TYPE_LABELS = {
    "openai_api_key": "api_key",
}


def build_placeholder(match: dict) -> str:
    placeholder_id = match["id"]
    pii_type = match.get("type")
    replacement_type = _PLACEHOLDER_TYPE_LABELS.get(pii_type)
    if replacement_type and placeholder_id.startswith(f"{pii_type}_"):
        placeholder_id = placeholder_id.replace(pii_type, replacement_type, 1)
    return f"[{placeholder_id.upper()}]"


def mask_text(text: str, matches: list[dict]) -> str:
    sorted_matches = sorted(matches, key=lambda m: m["start"], reverse=True)
    masked = text
    for match in sorted_matches:
        placeholder = build_placeholder(match)
        masked = masked[:match["start"]] + placeholder + masked[match["end"]:]
    return masked

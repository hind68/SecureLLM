def spans_overlap(a: dict, b: dict) -> bool:
    return a["start"] < b["end"] and b["start"] < a["end"]


def _quality_key(match: dict) -> tuple[int, float, int, int]:
    length = match["end"] - match["start"]
    specialized = 1 if match.get("pattern_name") or match.get("presidio_entity_type") else 0
    return (
        1 if match.get("validated") else 0,
        float(match.get("score") or 0),
        specialized,
        -length,
    )


def deduplicate_matches(matches: list[dict]) -> list[dict]:
    result = []
    for match in matches:
        overlap_index = None
        for i, kept in enumerate(result):
            if spans_overlap(match, kept):
                overlap_index = i
                break

        if overlap_index is None:
            result.append(match)
        elif _quality_key(match) > _quality_key(result[overlap_index]):
            result[overlap_index] = match
    return result

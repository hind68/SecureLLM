from app.detectors.presidio_config import SUPPORTED_NLP_LANGUAGES, get_analyzer, warm_up_analyzer


ENTITY_TYPE_MAP = {
    "PERSON": "person_name",
    "EMAIL_ADDRESS": "email",
    "PHONE_NUMBER": "phone_number",
    "CREDIT_CARD": "credit_card",
    "IBAN_CODE": "iban",
    "IP_ADDRESS": "ip_address",
    "LOCATION": "location",
    "URL": "url",
    "ORGANIZATION": "organization",
    "MOROCCAN_PHONE_LOCAL": "phone_number",
    "MOROCCAN_PHONE_INTERNATIONAL": "phone_number",
    "MOROCCAN_CIN": "moroccan_cin",
    "MA_CIN": "moroccan_cin",
    "MOROCCAN_IBAN": "iban",
    "MOROCCAN_RIB": "bank_account",
    "MOROCCAN_BIC_SWIFT": "bic_swift",
    "OPENAI_API_KEY": "api_key",
    "AWS_ACCESS_KEY": "api_key",
    "GITHUB_TOKEN": "api_key",
    "JWT_TOKEN": "jwt_token",
    "PRIVATE_KEY": "private_key",
    "HARDCODED_PASSWORD": "hardcoded_password",
    "DATABASE_CONNECTION_STRING": "connection_string",
    "BEARER_TOKEN": "api_key",
}

SEVERITY_MAP = {
    "credit_card": "high",
    "iban": "high",
    "moroccan_cin": "high",
    "api_key": "high",
    "private_key": "high",
    "jwt_token": "high",
    "hardcoded_password": "high",
    "connection_string": "high",
    "bank_account": "high",
    "bic_swift": "high",
    "email": "medium",
    "phone_number": "medium",
    "person_name": "medium",
    "ip_address": "medium",
    "location": "low",
    "url": "low",
    "organization": "low",
}

_NLP_ACRONYM_FALSE_POSITIVES = {
    "CIN",
    "RIB",
    "IBAN",
    "BIC",
    "SWIFT",
    "JWT",
    "API",
    "SQL",
    "HTTP",
    "HTTPS",
    "IP",
}

_GENERIC_NLP_ENTITY_TYPES = {"PERSON", "LOCATION", "ORGANIZATION"}


def warm_up_models() -> None:
    warm_up_analyzer()


def detect_with_presidio(text: str, language: str = "en") -> list[dict]:
    if not text or language not in SUPPORTED_NLP_LANGUAGES:
        return []

    results = get_analyzer().analyze(text=text, language=language)
    matches = []
    for result in results:
        detected_text = text[result.start:result.end]
        if _is_generic_nlp_acronym_false_positive(result.entity_type, detected_text):
            continue

        internal_type = ENTITY_TYPE_MAP.get(result.entity_type)
        if not internal_type:
            continue
        matches.append({
            "type": internal_type,
            "start": result.start,
            "end": result.end,
            "score": float(result.score),
            "severity": SEVERITY_MAP.get(internal_type, "medium"),
            "source": "presidio",
            "presidio_entity_type": result.entity_type,
        })
    return matches


def _is_generic_nlp_acronym_false_positive(entity_type: str, detected_text: str) -> bool:
    if entity_type not in _GENERIC_NLP_ENTITY_TYPES:
        return False
    normalized = detected_text.strip().upper()
    return normalized in _NLP_ACRONYM_FALSE_POSITIVES

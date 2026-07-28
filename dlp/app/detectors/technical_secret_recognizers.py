from presidio_analyzer import Pattern, PatternRecognizer


OPENAI_API_KEY = "OPENAI_API_KEY"
AWS_ACCESS_KEY = "AWS_ACCESS_KEY"
GITHUB_TOKEN = "GITHUB_TOKEN"
JWT_TOKEN = "JWT_TOKEN"
PRIVATE_KEY = "PRIVATE_KEY"
HARDCODED_PASSWORD = "HARDCODED_PASSWORD"
DATABASE_CONNECTION_STRING = "DATABASE_CONNECTION_STRING"
BEARER_TOKEN = "BEARER_TOKEN"


def build_technical_secret_recognizers() -> list[PatternRecognizer]:
    return [
        PatternRecognizer(
            supported_entity=OPENAI_API_KEY,
            name="OpenAI API key recognizer",
            patterns=[Pattern("openai_api_key", r"\bsk-[A-Za-z0-9]{20,}\b", 0.9)],
            supported_language="en",
        ),
        PatternRecognizer(
            supported_entity=AWS_ACCESS_KEY,
            name="AWS access key recognizer",
            patterns=[Pattern("aws_access_key", r"\b(?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b", 0.85)],
            supported_language="en",
        ),
        PatternRecognizer(
            supported_entity=GITHUB_TOKEN,
            name="GitHub token recognizer",
            patterns=[Pattern("github_token", r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,71}\b", 0.9)],
            supported_language="en",
        ),
        PatternRecognizer(
            supported_entity=JWT_TOKEN,
            name="JWT recognizer",
            patterns=[Pattern("jwt_token", r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.=-]{20,}\b", 0.9)],
            supported_language="en",
        ),
        PatternRecognizer(
            supported_entity=PRIVATE_KEY,
            name="Private key recognizer",
            patterns=[Pattern("private_key", r"(?s)-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----.*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----", 0.95)],
            supported_language="en",
        ),
        PatternRecognizer(
            supported_entity=HARDCODED_PASSWORD,
            name="Hardcoded password recognizer",
            patterns=[Pattern("hardcoded_password", r"(?i)\b(?:password|passwd|pwd)\s*[:=]\s*['\"]?(?=[^\s'\"]{6,64}\b)(?=[^\s'\"]*[A-Za-z])(?=[^\s'\"]*\d)([^\s'\"]{6,64})", 0.75)],
            supported_language="en",
        ),
        PatternRecognizer(
            supported_entity=DATABASE_CONNECTION_STRING,
            name="Database connection string recognizer",
            patterns=[Pattern("database_connection_string", r"\b(?:postgresql|postgres|mysql|mongodb|redis)://[^\s<]+", 0.85)],
            supported_language="en",
        ),
        PatternRecognizer(
            supported_entity=BEARER_TOKEN,
            name="Bearer token recognizer",
            patterns=[Pattern("bearer_token", r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{24,}\b", 0.8)],
            supported_language="en",
        ),
    ]

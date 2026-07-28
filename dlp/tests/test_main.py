import io
import logging
import zipfile

from fastapi.testclient import TestClient

import app.main as main
from app.main import app


client = TestClient(app)


def _disable_presidio(monkeypatch):
    monkeypatch.setattr(main, "detect_with_presidio", lambda text, language="en": [])


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "UP", "service": "dlp-service"}


def test_ready(monkeypatch):
    monkeypatch.setattr(main, "warm_up_models", lambda: None)
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json()["status"] == "READY"
    assert response.json()["presidio"] is True


def test_normal_text_is_allowed(monkeypatch):
    _disable_presidio(monkeypatch)
    response = client.post("/analyse", json={"text": "Bonjour, peux-tu resumer ce document ?"})
    data = response.json()
    assert data["status"] == "SUCCESS"
    assert data["decision"] == "ALLOW"
    assert data["flagged"] is False
    assert data["matches"] == []


def test_email_is_masked_and_not_exposed_in_matches(monkeypatch):
    _disable_presidio(monkeypatch)
    response = client.post("/analyse", json={"text": "Mon adresse est client@example.com"})
    data = response.json()
    assert data["decision"] == "MASK"
    assert any(match["type"] == "email" for match in data["matches"])
    assert all("value" not in match for match in data["matches"])
    assert "client@example.com" not in str(data["matches"])
    assert "client@example.com" not in data["masked_text"]


def test_moroccan_cin_requires_context(monkeypatch):
    _disable_presidio(monkeypatch)
    positive = client.post("/analyse", json={"text": "CIN: BE929657"})
    assert positive.json()["decision"] == "BLOCK"
    assert any(match["type"] == "moroccan_cin" for match in positive.json()["matches"])

    negative = client.post("/analyse", json={"text": "La reference du ticket est AB123456."})
    assert negative.json()["decision"] == "ALLOW"


def test_moroccan_cin_exact_text_blocks_and_masks(monkeypatch):
    _disable_presidio(monkeypatch)
    data = client.post("/analyse", json={"text": "Le numero de CIN du client est AB123456."}).json()

    assert data["status"] == "SUCCESS"
    assert data["decision"] == "BLOCK"
    assert data["flagged"] is True
    assert data["highest_severity"] == "high"
    assert data["masked_text"] == "Le numero de CIN du client est [MOROCCAN_CIN_1_REDACTED]."
    assert any(match["type"] == "moroccan_cin" and match["severity"] == "high" for match in data["matches"])


def test_moroccan_cin_short_format_blocks(monkeypatch):
    _disable_presidio(monkeypatch)
    data = client.post("/analyse", json={"text": "CIN : A123456"}).json()

    assert data["decision"] == "BLOCK"
    assert any(match["type"] == "moroccan_cin" for match in data["matches"])


def test_moroccan_cin_carte_nationale_blocks(monkeypatch):
    _disable_presidio(monkeypatch)
    data = client.post("/analyse", json={"text": "Numero de carte nationale BE1234567"}).json()

    assert data["decision"] == "BLOCK"
    assert any(match["type"] == "moroccan_cin" for match in data["matches"])


def test_moroccan_cin_ticket_and_build_references_are_allowed(monkeypatch):
    _disable_presidio(monkeypatch)

    ticket = client.post("/analyse", json={"text": "La reference du ticket est AB123456."}).json()
    build = client.post("/analyse", json={"text": "Le build AB123456 a echoue."}).json()

    assert not any(match["type"] == "moroccan_cin" for match in ticket["matches"])
    assert not any(match["type"] == "moroccan_cin" for match in build["matches"])


def test_validators_for_iban_and_credit_card(monkeypatch):
    _disable_presidio(monkeypatch)
    valid = client.post("/analyse", json={"text": "IBAN MA64 2307 8094 3410 6211 0034 0090 carte 4111 1111 1111 1111"})
    types = {match["type"] for match in valid.json()["matches"]}
    assert "iban" in types
    assert "credit_card" in types

    invalid = client.post("/analyse", json={"text": "IBAN MA00 2307 8094 3410 6211 0034 0090 carte 4111 1111 1111 1112"})
    types = {match["type"] for match in invalid.json()["matches"]}
    assert "iban" not in types
    assert "credit_card" not in types


def test_technical_secrets_block(monkeypatch):
    _disable_presidio(monkeypatch)
    text = (
        "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456 "
        "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 "
        "password = \"Secret123\""
    )
    data = client.post("/analyse", json={"text": text}).json()
    assert data["decision"] == "BLOCK"
    assert data["highest_severity"] == "high"
    assert any(match["severity"] == "high" for match in data["matches"])


def test_arabic_text_uses_regex_without_french_nlp(monkeypatch):
    calls = []

    def fake_presidio(text, language="en"):
        calls.append(language)
        return []

    monkeypatch.setattr(main, "detect_with_presidio", fake_presidio)
    data = client.post("/analyse", json={"text": "مرحبا client@example.com"}).json()
    assert data["decision"] == "MASK"
    assert calls == ["ar"]


def test_txt_file(monkeypatch):
    _disable_presidio(monkeypatch)
    files = {"file": ("note.txt", io.BytesIO(b"Contact client@example.com"), "text/plain")}
    data = client.post("/analyse-file", files=files).json()
    assert data["decision"] == "MASK"
    assert any(match["type"] == "email" for match in data["matches"])


def test_unsupported_file_fails_closed(monkeypatch):
    _disable_presidio(monkeypatch)
    files = {"file": ("video.mp4", io.BytesIO(b"content"), "video/mp4")}
    data = client.post("/analyse-file", files=files).json()
    assert data["status"] == "ERROR"
    assert data["decision"] == "BLOCK"
    assert data["flagged"] is None


def test_zip_with_only_unsupported_content_fails_closed(monkeypatch):
    _disable_presidio(monkeypatch)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("video.mp4", b"fake")
    buf.seek(0)
    files = {"file": ("archive.zip", buf, "application/zip")}
    data = client.post("/analyse-file", files=files).json()
    assert data["status"] == "ERROR"
    assert data["decision"] == "BLOCK"


def test_logs_do_not_contain_sensitive_values(monkeypatch, caplog):
    _disable_presidio(monkeypatch)
    caplog.set_level(logging.WARNING, logger="dlp_alerts")
    client.post("/analyse", json={"text": "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456", "user_id": "demo-user"})
    logs = "\n".join(record.message for record in caplog.records)
    assert "sk-abcdefghijklmnopqrstuvwxyz123456" not in logs
    assert "api_key" in logs

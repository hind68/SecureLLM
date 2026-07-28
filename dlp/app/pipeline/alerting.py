import json
import logging
import os
from datetime import datetime, timezone


alert_logger = logging.getLogger("dlp_alerts")
alert_logger.setLevel(os.getenv("DLP_LOG_LEVEL", "INFO"))

if not alert_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    alert_logger.addHandler(handler)


def check_and_log_alerts(
    matches: list[dict],
    user_id: str | None = None,
    request_id: str | None = None,
    filename: str | None = None,
    decision: str | None = None,
) -> None:
    high_severity = [match for match in matches if match.get("severity") == "high"]
    if not high_severity:
        return

    alert_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request_id": request_id,
        "user_id": user_id,
        "decision": decision,
        "filename": filename,
        "matches": [
            {
                "id": match.get("id"),
                "type": match.get("type"),
                "severity": match.get("severity"),
                "source": match.get("source", "unknown"),
                "start": match.get("start"),
                "end": match.get("end"),
                "score": match.get("score"),
            }
            for match in high_severity
        ],
    }

    alert_logger.warning(json.dumps(alert_entry, ensure_ascii=False))

from langdetect import detect, LangDetectException

def detect_language(text: str) -> str:
    if any("\u0600" <= char <= "\u06ff" for char in text):
        return "ar"

    try:
        lang = detect(text)
    except LangDetectException:
        return "en"     

    if lang in {"fr", "en"}:
        return lang
    if lang == "ar":
        return "ar"
    return "en"

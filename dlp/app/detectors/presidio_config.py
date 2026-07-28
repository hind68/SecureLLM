from functools import lru_cache

from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider

from app.detectors.moroccan_recognizers import build_moroccan_recognizers
from app.detectors.technical_secret_recognizers import build_technical_secret_recognizers


SUPPORTED_NLP_LANGUAGES = ["fr", "en"]
OCR_LANGUAGES = ["fra", "eng", "ara"]


def _build_nlp_engine():
    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [
                {"lang_code": "en", "model_name": "en_core_web_sm"},
                {"lang_code": "fr", "model_name": "fr_core_news_sm"},
            ],
        },
    )
    return provider.create_engine()


def _build_registry() -> RecognizerRegistry:
    registry = RecognizerRegistry(supported_languages=SUPPORTED_NLP_LANGUAGES)
    registry.load_predefined_recognizers(languages=SUPPORTED_NLP_LANGUAGES)
    for recognizer in build_moroccan_recognizers() + build_technical_secret_recognizers():
        registry.add_recognizer(recognizer)
    return registry


@lru_cache(maxsize=1)
def get_analyzer() -> AnalyzerEngine:
    return AnalyzerEngine(
        nlp_engine=_build_nlp_engine(),
        registry=_build_registry(),
        supported_languages=SUPPORTED_NLP_LANGUAGES,
    )


def warm_up_analyzer() -> None:
    analyzer = get_analyzer()
    analyzer.analyze(text="warmup@example.com", language="en")
    analyzer.analyze(text="Jean Dupont habite a Rabat.", language="fr")

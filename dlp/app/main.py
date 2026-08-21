import io
import os
import tempfile
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from PIL import Image, UnidentifiedImageError

from app.schemas import AnalyseRequest, AnalyseResponse, MultiSourceAnalyseResponse
from app.detectors.language import detect_language
from app.detectors.regex_detector import run_regex_detectors
from app.detectors.presidio_detector import detect_with_presidio, warm_up_models
from app.pipeline.dedup import deduplicate_matches
from app.pipeline.ids import assign_ids
from app.pipeline.masking import is_neutralized_placeholder_value, mask_text
from app.pipeline.alerting import check_and_log_alerts
from app.pipeline.decision import evaluate_decision, highest_severity, strip_sensitive_values
from app.config import DLP_MAX_ATTACHMENTS, DLP_MAX_TEXT_LENGTH, MAX_UPLOAD_BYTES
from app.ingestion.pdf_parser import extract_text_from_pdf_with_ocr
from app.ingestion.ocr import extract_text_from_image_object, OCRExtractionError
from app.ingestion.docx_parser import extract_text_from_docx
from app.ingestion.pptx_parser import extract_text_from_pptx
from app.ingestion.csv_parser import extract_text_from_csv, extract_csv_segments
from app.ingestion.xlsx_parser import extract_text_from_xlsx, extract_xlsx_segments
from app.ingestion.zip_parser import extract_text_from_zip, ZipSafetyError
from app.ingestion.allowed_extensions import PLAIN_TEXT_EXTENSIONS, read_as_plain_text

# Formats d'image courants supportés par Pillow. /analyse-image n'a pas de
# dispatcher de parseurs comme /analyse-file, donc on rejette rapidement les
# uploads manifestement invalides avant de lancer Image.open().
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"}


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """
    Rejette les requêtes trop volumineuses via l'en-tête Content-Length avant
    que Starlette ne mette le corps en mémoire ou dans un fichier temporaire.
    C'est le seul contrôle de ce fichier exécuté avant le parsing UploadFile.

    Limite assumée : un client qui utilise le transfert chunked sans
    Content-Length contourne ce contrôle et rencontre seulement les limites par
    route plus loin. La plupart des clients HTTP réels envoient Content-Length
    pour les uploads, mais ce n'est pas une garantie complète.
    """
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_UPLOAD_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={"detail": f"Request body exceeds the {MAX_UPLOAD_BYTES} byte limit."},
                    )
            except ValueError:
                pass  # En-tête mal formé : laisser le traitement normal le rejeter.
        return await call_next(request)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Charger les backends NLP au démarrage évite de faire payer ce coût à la
    # première requête utilisateur.
    warm_up_models()
    yield


app = FastAPI(title="Secure LLM DLP Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(MaxBodySizeMiddleware)


def _read_upload_limited(file: UploadFile) -> bytes:
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds the {MAX_UPLOAD_BYTES} byte limit.")
    return content


def _error_response(code: str = "EXTRACTION_FAILED", message: str = "The content could not be safely analysed.") -> dict:
    return {
        "status": "ERROR",
        "decision": "BLOCK",
        "flagged": None,
        "highest_severity": None,
        "extracted_text": None,
        "masked_text": None,
        "matches": [],
        "errors": [{"code": code, "message": message}],
    }


def _success_response(text: str, matches: list[dict], user_id: str | None = None, filename: str | None = None) -> dict:
    """
    Construit la réponse DLP publique sans retourner les valeurs sensibles.

    Le texte original est retourné seulement comme extracted_text pour la
    persistance backend et les parcours d'inspection ; les objets de match sont
    nettoyés avant de franchir la frontière API afin que les logs et l'UI ne
    reçoivent jamais le secret détecté lui-même.
    """
    decision = evaluate_decision(matches)
    check_and_log_alerts(
        matches,
        user_id=user_id,
        request_id=str(uuid4()),
        filename=filename,
        decision=decision,
    )
    masked = mask_text(text, matches)
    return {
        "status": "SUCCESS",
        "decision": decision,
        "flagged": len(matches) > 0,
        "highest_severity": highest_severity(matches),
        "extracted_text": text,
        "matches": strip_sensitive_values(matches),
        "masked_text": masked,
        "errors": [],
    }


def _drop_neutralized_placeholder_matches(text: str, matches: list[dict]) -> list[dict]:
    """
    Évite de redétecter les placeholders déjà produits par ce service.

    Cela garde le contenu masqué idempotent lorsqu'un prompt sûr stocké est
    réanalysé par la passerelle Spring avant d'être réutilisé comme contexte.
    """
    kept = []
    for match in matches:
        value = match.get("value")
        if value is None:
            value = text[match["start"]:match["end"]]
        if is_neutralized_placeholder_value(value):
            continue
        kept.append(match)
    return kept


def run_pipeline(text: str, user_id: str | None = None, filename: str | None = None) -> dict:
    """
    Pipeline partagé unique : détection -> déduplication -> id -> alerte -> masquage.
    """
    if len(text) > DLP_MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=f"Text exceeds maximum length of {DLP_MAX_TEXT_LENGTH} characters.",
        )

    lang = detect_language(text)

    # Exécuter les regex et notre moteur NER multilingue.
    combined = _drop_neutralized_placeholder_matches(
        text,
        run_regex_detectors(text) + detect_with_presidio(text, language=lang),
    )

    deduped = deduplicate_matches(combined)
    final_matches = assign_ids(deduped)

    return _success_response(text, final_matches, user_id=user_id, filename=filename)


def run_pipeline_for_segments(known_text: str, free_text: str, user_id: str | None = None, filename: str | None = None) -> dict:
    """
    Variante de run_pipeline pour une entrée déjà séparée entre un segment de
    données connues et un segment de texte libre. Le segment connu passe
    seulement par les regex ; le texte libre reçoit le traitement complet regex
    + NER, car le NLP est la partie coûteuse du pipeline. Les deux segments sont
    ensuite fusionnés pour conserver des ids, masquages et alertes cohérents.
    """
    if not known_text:
        # Aucun segment de type connu : éviter un "\n" initial artificiel qui
        # décalerait tous les offsets d'un caractère.
        return run_pipeline(free_text, user_id=user_id, filename=filename)

    combined_text = known_text + "\n" + free_text
    if len(combined_text) > DLP_MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=413,
            detail=f"Text exceeds maximum length of {DLP_MAX_TEXT_LENGTH} characters.",
        )

    known_matches = _drop_neutralized_placeholder_matches(known_text, run_regex_detectors(known_text))

    lang = detect_language(free_text)
    free_matches = _drop_neutralized_placeholder_matches(
        free_text,
        run_regex_detectors(free_text) + detect_with_presidio(free_text, language=lang),
    )
    offset = len(known_text) + 1  # +1 pour le séparateur "\n" ci-dessus.
    for m in free_matches:
        m["start"] += offset
        m["end"] += offset

    deduped = deduplicate_matches(known_matches + free_matches)
    final_matches = assign_ids(deduped)

    return _success_response(combined_text, final_matches, user_id=user_id, filename=filename)


@app.post("/analyse", response_model=AnalyseResponse)
def analyse(request: AnalyseRequest):
    return run_pipeline(request.text, user_id=request.user_id)


@app.post("/analyse-image", response_model=AnalyseResponse)
def analyse_image(file: UploadFile = File(...), user_id: str | None = Form(None)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext and ext not in _IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {ext!r}. Supported: {', '.join(sorted(_IMAGE_EXTENSIONS))}",
        )

    # L'appel bloquant laisse FastAPI exécuter Tesseract correctement dans son pool.
    content = _read_upload_limited(file)

    try:
        image = Image.open(io.BytesIO(content))
    except UnidentifiedImageError:
        return _error_response()

    try:
        extracted_text = extract_text_from_image_object(image)
    except OCRExtractionError:
        # Retourner une vraie erreur plutôt que flagged=False, qui ressemblerait
        # à "aucune donnée sensible trouvée" alors que l'image est illisible.
        return _error_response()

    return run_pipeline(extracted_text, user_id=user_id, filename=file.filename)


@app.post("/analyse-pdf", response_model=AnalyseResponse)
def analyse_pdf(file: UploadFile = File(...), user_id: str | None = Form(None)):
    content = _read_upload_limited(file)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        extracted_text = extract_text_from_pdf_with_ocr(tmp_path)
    except Exception:
        return _error_response()
    finally:
        os.remove(tmp_path)

    return run_pipeline(extracted_text, user_id=user_id, filename=file.filename)


# Les parseurs docx/pptx/csv/xlsx/zip existent comme modules autonomes ; ce
# dispatcher central évite de dupliquer le boilerplate de traitement des
# requêtes. Les extensions texte/code partagent le même lecteur brut.
_FILE_EXTRACTORS = {
    ".docx": extract_text_from_docx,
    ".pptx": extract_text_from_pptx,
    ".csv": extract_text_from_csv,
    ".xlsx": extract_text_from_xlsx,
    ".zip": extract_text_from_zip,
    **{ext: read_as_plain_text for ext in PLAIN_TEXT_EXTENSIONS},
}

# CSV/XLSX utilisent le traitement en deux segments de run_pipeline_for_segments
# plutôt que le dispatch plat en chaîne unique ci-dessus.
_SEGMENTED_EXTRACTORS = {
    ".csv": extract_csv_segments,
    ".xlsx": extract_xlsx_segments,
}


@app.post("/analyse-file", response_model=AnalyseResponse)
def analyse_file(file: UploadFile = File(...), user_id: str | None = Form(None)):
    # L'extension est vérifiée avant file.file.read() : un fichier non supporté
    # est rejeté sur son nom, sans lire son contenu. Cela n'empêche pas le
    # serveur d'avoir déjà reçu le corps HTTP ; MaxBodySizeMiddleware couvre le
    # contrôle qui intervient avant cette étape.
    ext = os.path.splitext(file.filename or "")[1].lower()
    segmented_extractor = _SEGMENTED_EXTRACTORS.get(ext)
    extractor = _FILE_EXTRACTORS.get(ext)
    if segmented_extractor is None and extractor is None:
        return _error_response("UNSUPPORTED_FILE_TYPE", "The content could not be safely analysed.")

    content = _read_upload_limited(file)
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if segmented_extractor is not None:
            known_text, free_text = segmented_extractor(tmp_path)
        else:
            extracted_text = extractor(tmp_path)
    except ZipSafetyError:
        # Cas distinct d'un mauvais fichier générique : l'archive est lisible
        # mais dépasse une limite de sécurité ou ne contient rien d'utilisable.
        return _error_response("EXTRACTION_FAILED", "The content could not be safely analysed.")
    except Exception:
        return _error_response()
    finally:
        os.remove(tmp_path)

    # Hors du try/finally volontairement : run_pipeline(_for_segments) peut
    # lever HTTPException, que le except générique masquerait sinon en 400.
    if segmented_extractor is not None:
        return run_pipeline_for_segments(known_text, free_text, user_id=user_id, filename=file.filename)
    return run_pipeline(extracted_text, user_id=user_id, filename=file.filename)


@app.get("/health")
def health():
    return {"status": "UP", "service": "dlp-service"}


@app.get("/ready")
def ready():
    try:
        warm_up_models()
    except Exception:
        return JSONResponse(status_code=503, content={"status": "NOT_READY", "presidio": False})
    return {
        "status": "READY",
        "presidio": True,
        "languages": ["fr", "en"],
        "structured_context_languages": ["fr", "en", "ar"],
        "ocr_languages": ["fra", "eng", "ara"],
        "arabic_ner": False,
    }


# ---------------------------------------------------------------------
# /analyse-message : endpoint réel "texte + pièces jointes ensemble".
# Un message peut être accompagné de fichiers, donc les deux côtés sont
# optionnels tant qu'au moins l'un existe. Tous les uploads supportés passent
# par _extract_known_free_text pour éviter de dupliquer la logique de dispatch.
# ---------------------------------------------------------------------

_ALL_SUPPORTED_UPLOAD_EXTENSIONS = (
    set(_FILE_EXTRACTORS) | set(_SEGMENTED_EXTRACTORS) | _IMAGE_EXTENSIONS | {".pdf"}
)


def _extract_known_free_text(filename: str, tmp_path: str) -> tuple[str, str]:
    """
    Extraction uniforme (known_text, free_text) pour tout upload supporté.
    known_text n'est non vide que pour CSV/XLSX ; tout autre contenu est traité
    comme texte libre.
    """
    ext = os.path.splitext(filename or "")[1].lower()

    if ext in _SEGMENTED_EXTRACTORS:
        return _SEGMENTED_EXTRACTORS[ext](tmp_path)

    if ext in _IMAGE_EXTENSIONS:
        try:
            image = Image.open(tmp_path)
        except UnidentifiedImageError as e:
            raise ValueError(f"not a readable image ({e})") from e
        try:
            return "", extract_text_from_image_object(image)
        except OCRExtractionError as e:
            raise ValueError(f"could not extract text from image ({e})") from e

    if ext == ".pdf":
        return "", extract_text_from_pdf_with_ocr(tmp_path)

    if ext in _FILE_EXTRACTORS:
        return "", _FILE_EXTRACTORS[ext](tmp_path)

    raise ValueError(f"unsupported file type {ext or 'unknown'!r}")


@app.post("/analyse-message", response_model=MultiSourceAnalyseResponse)
def analyse_message(
    text: str | None = Form(None),
    files: list[UploadFile] = File([]),
    user_id: str | None = Form(None),
):
    """
    Analyse le texte utilisateur et toutes les pièces jointes comme une seule
    soumission.

    La passerelle consomme la décision agrégée : toute source bloquée bloque le
    message complet, car envoyer seulement le sous-ensemble apparemment sûr
    rendrait l'historique trompeur et pourrait exposer du contexte partiel.
    """
    if not text and not files:
        raise HTTPException(status_code=400, detail="Provide text, at least one file, or both.")
    if len(files) > DLP_MAX_ATTACHMENTS:
        raise HTTPException(status_code=413, detail=f"Too many attachments. Maximum is {DLP_MAX_ATTACHMENTS}.")

    results = []

    if text:
        results.append({"source": "message", **run_pipeline(text, user_id=user_id)})

    for file in files:
        source = file.filename or "unknown"
        ext = os.path.splitext(source)[1].lower()

        # Même principe "rejeter tôt et à faible coût" que analyse_file : une
        # extension non supportée est enregistrée comme source ignorée et la
        # boucle continue.
        if ext not in _ALL_SUPPORTED_UPLOAD_EXTENSIONS:
            results.append({"source": source, **_error_response("UNSUPPORTED_FILE_TYPE", "The content could not be safely analysed.")})
            continue

        content = _read_upload_limited(file)
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            known_text, free_text = _extract_known_free_text(source, tmp_path)
            result = run_pipeline_for_segments(known_text, free_text, user_id=user_id)
        except HTTPException:
            results.append({"source": source, **_error_response("EXTRACTION_FAILED", "The content could not be safely analysed.")})
            continue
        except Exception:
            results.append({"source": source, **_error_response()})
            continue
        finally:
            os.remove(tmp_path)

        results.append({"source": source, **result})

    decision = "BLOCK" if any(r["decision"] == "BLOCK" for r in results) else "MASK" if any(r["decision"] == "MASK" for r in results) else "ALLOW"
    severities = [r["highest_severity"] for r in results if r.get("highest_severity")]
    return {
        "status": "ERROR" if any(r["status"] == "ERROR" for r in results) else "SUCCESS",
        "decision": decision,
        "flagged": None if any(r["flagged"] is None for r in results) else any(r["flagged"] for r in results),
        "highest_severity": highest_severity([{"severity": severity} for severity in severities]),
        "results": results,
        "errors": [error for result in results for error in result.get("errors", [])],
    }

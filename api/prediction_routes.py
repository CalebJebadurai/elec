"""ML-based prediction routes with ONNX model inference."""

import logging
import os
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import ORJSONResponse
from pydantic import BaseModel, Field

from database import get_pool
from cache import get_cached, set_cached

logger = logging.getLogger("predictions")

prediction_router = APIRouter(prefix="/predict", tags=["predictions"])

# ── Pydantic request/response models ─────────────────────


class FactorInput(BaseModel):
    """Multi-factor prediction input parameters."""

    turnoutChange: float = Field(0, ge=-30, le=30)
    incumbencyFatigue: float = Field(0, ge=0, le=100)
    turncoatPenalty: float = Field(0, ge=0, le=100)
    recontestBonus: float = Field(0, ge=0, le=50)
    sameConstituencyBonus: float = Field(0, ge=0, le=50)
    previousMarginFactor: float = Field(0, ge=-50, le=50)
    enopFactor: float = Field(0, ge=-50, le=50)
    nCandFactor: float = Field(0, ge=-50, le=50)
    constituencyTypeFactor: float = Field(0, ge=-50, le=50)
    genderFactor: float = Field(0, ge=-50, le=50)
    partyStrengthFactor: float = Field(0, ge=-50, le=50)
    partyVoteShareFactor: float = Field(0, ge=-50, le=50)


class MLPredictRequest(BaseModel):
    """Request body for ML prediction endpoint."""

    state: str = Field(..., min_length=1, max_length=100)
    factors: FactorInput = Field(default_factory=FactorInput)


class ConstituencyPrediction(BaseModel):
    constituency_name: str
    constituency_no: int
    predicted_winner: str
    predicted_winner_share: float
    predicted_runner_up: Optional[str] = None
    predicted_margin_pct: float
    error_margin_low: float
    error_margin_high: float
    confidence: float


class MLPredictResponse(BaseModel):
    state: str
    model_version: Optional[str] = None
    predictions: list[ConstituencyPrediction]


# ── ONNX model management ────────────────────────────────

_model_session = None
_model_version: str | None = None
_MODEL_DIR = os.environ.get("MODEL_DIR", os.path.join(os.path.dirname(__file__), "models"))


def _get_model():
    """Lazy-load the ONNX model. Returns (session, version) or raises."""
    global _model_session, _model_version

    if _model_session is not None:
        return _model_session, _model_version

    model_path = os.path.join(_MODEL_DIR, "election_predictor.onnx")
    if not os.path.exists(model_path):
        raise HTTPException(
            status_code=503,
            detail="ML model not available. Use formula mode for predictions.",
        )

    try:
        import onnxruntime as ort

        _model_session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        # Read version from metadata if available
        meta = _model_session.get_modelmeta()
        _model_version = meta.custom_metadata_map.get("version", "unknown")
        logger.info("Loaded ONNX model v%s from %s", _model_version, model_path)
        return _model_session, _model_version
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="onnxruntime not installed. ML predictions unavailable.",
        )
    except Exception as e:
        logger.error("Failed to load ONNX model: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Failed to load ML model.",
        )


# ── Circuit breaker ──────────────────────────────────────

_failure_count = 0
_FAILURE_THRESHOLD = 5
_circuit_open = False


def _check_circuit():
    """Raise if circuit breaker is open."""
    if _circuit_open:
        raise HTTPException(
            status_code=503,
            detail="ML prediction service temporarily unavailable. Please try formula mode.",
        )


def _record_failure():
    global _failure_count, _circuit_open
    _failure_count += 1
    if _failure_count >= _FAILURE_THRESHOLD:
        _circuit_open = True
        logger.warning("Circuit breaker opened after %d failures", _failure_count)


def _record_success():
    global _failure_count, _circuit_open
    _failure_count = 0
    _circuit_open = False


# ── Endpoints ─────────────────────────────────────────────


@prediction_router.get("/model-health", response_class=ORJSONResponse)
async def model_health():
    """Report whether the ML model is loaded and its version."""
    model_loaded = _model_session is not None
    return {
        "model_loaded": model_loaded,
        "model_version": _model_version if model_loaded else None,
        "circuit_breaker_open": _circuit_open,
        "failure_count": _failure_count,
        "available": model_loaded and not _circuit_open,
    }


@prediction_router.post("/ml", response_class=ORJSONResponse)
async def ml_predict(req: MLPredictRequest):
    """Run ML-based constituency prediction using the ONNX model.

    Returns predicted winners, vote shares, and confidence intervals
    for each constituency in the specified state.
    """
    _check_circuit()

    # Check cache first (bucketed by rounded factor values)
    cache_key = _build_cache_key(req)
    cached = await get_cached(cache_key)
    if cached:
        return cached

    try:
        session, version = _get_model()
    except HTTPException:
        raise

    # Fetch constituency data for the state
    pool = await get_pool()
    state_name = req.state.replace("_", " ")

    latest_year = await pool.fetchval(
        "SELECT MAX(year) FROM tcpd_ae WHERE state_name = $1 AND election_type = 'AE'",
        state_name,
    )
    if not latest_year:
        raise HTTPException(status_code=404, detail=f"No election data for state: {req.state}")

    constituencies = await pool.fetch(
        """SELECT DISTINCT constituency_name, constituency_no
           FROM tcpd_ae
           WHERE state_name = $1 AND year = $2 AND election_type = 'AE'
           ORDER BY constituency_no""",
        state_name,
        latest_year,
    )

    if not constituencies:
        raise HTTPException(status_code=404, detail="No constituencies found")

    # Build feature matrix for batch inference
    import numpy as np

    factors = req.factors
    factor_values = [
        factors.turnoutChange,
        factors.incumbencyFatigue,
        factors.turncoatPenalty,
        factors.recontestBonus,
        factors.sameConstituencyBonus,
        factors.previousMarginFactor,
        factors.enopFactor,
        factors.nCandFactor,
        factors.constituencyTypeFactor,
        factors.genderFactor,
        factors.partyStrengthFactor,
        factors.partyVoteShareFactor,
    ]

    n_const = len(constituencies)
    feature_matrix = np.tile(factor_values, (n_const, 1)).astype(np.float32)

    try:
        input_name = session.get_inputs()[0].name
        outputs = session.run(None, {input_name: feature_matrix})
        _record_success()
    except Exception as e:
        _record_failure()
        logger.error("ONNX inference failed: %s", e)
        raise HTTPException(status_code=503, detail="ML inference failed")

    # Parse model output into predictions
    predictions_out = outputs[0]  # Shape: (n_const, output_features)
    result_predictions = []

    for i, row in enumerate(constituencies):
        pred = predictions_out[i]
        result_predictions.append(
            ConstituencyPrediction(
                constituency_name=row["constituency_name"],
                constituency_no=row["constituency_no"],
                predicted_winner=str(pred[0]) if len(pred) > 0 else "Unknown",
                predicted_winner_share=float(pred[1]) if len(pred) > 1 else 0,
                predicted_runner_up=str(pred[2]) if len(pred) > 2 else None,
                predicted_margin_pct=float(pred[3]) if len(pred) > 3 else 0,
                error_margin_low=float(pred[4]) if len(pred) > 4 else 0,
                error_margin_high=float(pred[5]) if len(pred) > 5 else 0,
                confidence=float(pred[6]) if len(pred) > 6 else 0.5,
            )
        )

    response = MLPredictResponse(
        state=req.state,
        model_version=version,
        predictions=result_predictions,
    )

    # Cache for 5 minutes
    await set_cached(cache_key, response.model_dump(), ttl=300)

    return response


def _build_cache_key(req: MLPredictRequest) -> str:
    """Build a cache key with bucketed factor values for coalescing similar requests."""
    factors = req.factors
    # Round to nearest 5 for caching buckets
    def _bucket(v: float) -> int:
        return round(v / 5) * 5

    parts = [
        f"ml:{req.state}",
        str(_bucket(factors.turnoutChange)),
        str(_bucket(factors.incumbencyFatigue)),
        str(_bucket(factors.turncoatPenalty)),
        str(_bucket(factors.recontestBonus)),
        str(_bucket(factors.sameConstituencyBonus)),
        str(_bucket(factors.previousMarginFactor)),
        str(_bucket(factors.enopFactor)),
        str(_bucket(factors.nCandFactor)),
        str(_bucket(factors.constituencyTypeFactor)),
        str(_bucket(factors.genderFactor)),
        str(_bucket(factors.partyStrengthFactor)),
        str(_bucket(factors.partyVoteShareFactor)),
    ]
    return ":".join(parts)

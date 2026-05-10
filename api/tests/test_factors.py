"""Tests for factor metadata and ML prediction endpoints."""

import pytest


@pytest.mark.anyio
async def test_get_factors_returns_catalog(client):
    """GET /v1/factors should return the full factor catalog."""
    response = await client.get("/v1/factors")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 12  # At least 12 factors
    # Verify each entry has required fields
    for factor in data:
        assert "name" in factor
        assert "displayName" in factor
        assert "category" in factor
        assert "level" in factor
        assert "range" in factor
        assert "min" in factor["range"]
        assert "max" in factor["range"]
        assert "step" in factor
        assert "defaultValue" in factor
        assert "tooltip" in factor


@pytest.mark.anyio
async def test_get_factors_legacy_route(client):
    """GET /factors should also work (legacy unprefixed route)."""
    response = await client.get("/factors")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 12


@pytest.mark.anyio
async def test_get_state_factors_known_state(client):
    """GET /v1/factors/{state} returns coefficients for a known state."""
    response = await client.get("/v1/factors/Tamil_Nadu")
    assert response.status_code == 200
    data = response.json()
    assert data["state"] == "Tamil_Nadu"
    assert "coefficients" in data
    assert "factors" in data
    # Verify coefficient structure
    coeffs = data["coefficients"]
    assert isinstance(coeffs, dict)
    assert "incumbencyFatigue" in coeffs
    assert "turnoutChange" in coeffs


@pytest.mark.anyio
async def test_get_state_factors_national_fallback(client):
    """GET /v1/factors/{state} returns national fallback for unknown states."""
    response = await client.get("/v1/factors/Unknown_State")
    assert response.status_code == 200
    data = response.json()
    # Should still return national coefficients as fallback
    assert "coefficients" in data


@pytest.mark.anyio
async def test_model_health_endpoint(client):
    """GET /v1/predict/model-health returns model status."""
    response = await client.get("/v1/predict/model-health")
    assert response.status_code == 200
    data = response.json()
    assert "model_loaded" in data
    assert "circuit_breaker_open" in data
    assert "available" in data
    # Without a model file, should report not loaded
    assert data["model_loaded"] is False
    assert data["available"] is False


@pytest.mark.anyio
async def test_ml_predict_without_model_returns_503(client):
    """POST /v1/predict/ml should return 503 when no model is available."""
    response = await client.post("/v1/predict/ml", json={
        "state": "Tamil_Nadu",
        "factors": {
            "turnoutChange": 5,
            "incumbencyFatigue": 20,
        }
    })
    assert response.status_code == 503
    data = response.json()
    assert "detail" in data


@pytest.mark.anyio
async def test_ml_predict_validation_rejects_invalid_factors(client):
    """POST /v1/predict/ml should reject out-of-range factor values."""
    response = await client.post("/v1/predict/ml", json={
        "state": "Tamil_Nadu",
        "factors": {
            "turnoutChange": 999,  # Out of range [-30, 30]
        }
    })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_ml_predict_validation_rejects_missing_state(client):
    """POST /v1/predict/ml should reject missing state."""
    response = await client.post("/v1/predict/ml", json={
        "factors": {"turnoutChange": 5}
    })
    assert response.status_code == 422


@pytest.mark.anyio
async def test_ml_predict_default_factors(client):
    """POST /v1/predict/ml with empty factors should use defaults."""
    response = await client.post("/v1/predict/ml", json={
        "state": "Tamil_Nadu",
        "factors": {}
    })
    # Will be 503 since no model is loaded, but validates request parsing
    assert response.status_code == 503

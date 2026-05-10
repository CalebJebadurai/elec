# Model Retraining Protocol

## Schedule

Retrain the election prediction model within **30 days** of each new major state assembly election result being added to the TCPD dataset.

## Steps

### 1. Data Update
```bash
# Seed new election data into the database
cd /path/to/elec
./infra/seed-railway.sh  # or appropriate seed script
```

### 2. Run Factor Discovery Notebook
```bash
cd datascience
jupyter lab notebooks/08_factor_discovery.ipynb
```

Execute all cells. The notebook will:
- Re-profile data completeness with the new election
- Re-engineer features including the new election cycle
- Re-derive coefficients (national + per-state)
- Retrain the XGBoost model with the expanded training set
- Export updated artifacts to `output/`

### 3. Validate

Before deploying, verify:
- [ ] Per-state winner prediction accuracy ≥65% (holdout validation)
- [ ] ONNX export produces predictions matching sklearn within 1e-6 tolerance
- [ ] New coefficients do not diverge wildly from previous version (manual review)
- [ ] SHAP feature importances remain reasonable (no single feature >50%)

### 4. Deploy Coefficients (Formula Mode)

Copy updated coefficient data to frontend and API:
```bash
cp datascience/output/coefficients.json frontend/src/engine/data/coefficients.json
cp datascience/output/coefficients.json api/factor_data/coefficients.json
cp datascience/output/factor_catalog.json frontend/src/engine/data/factor_catalog.json
cp datascience/output/factor_catalog.json api/factor_data/factor_catalog.json
cp datascience/output/alliance_data.json frontend/src/engine/data/alliance_data.json
cp datascience/output/alliance_data.json api/factor_data/alliance_data.json
```

### 5. Deploy ONNX Model (ML Mode)

```bash
mkdir -p api/models
cp datascience/output/election_predictor.onnx api/models/
```

The API will lazy-load the new model on next prediction request. The circuit breaker will validate it against known results automatically.

### 6. Update Model Metadata

Insert a new row into the `model_metadata` table:
```sql
INSERT INTO model_metadata (model_name, version, file_path, metrics, is_active)
VALUES (
  'election_predictor',
  '1.1.0',  -- increment version
  'models/election_predictor.onnx',
  '{"accuracy": 0.78, "states_covered": 15}',
  true
);
-- Deactivate previous version
UPDATE model_metadata SET is_active = false
WHERE model_name = 'election_predictor' AND version != '1.1.0';
```

### 7. Verify Deployment

```bash
# Check model health
curl https://your-api-url/v1/predict/model-health

# Expected: {"model_loaded": true, "model_version": "1.1.0", "available": true}
```

## Rollback

If the new model fails the circuit breaker or produces poor results:

1. Revert the ONNX file: `git checkout HEAD~1 -- api/models/election_predictor.onnx`
2. Restart the API service (clears the in-memory model cache)
3. Deactivate the bad version in `model_metadata`

## Version History

| Version | Date | Training Data | Notes |
|---------|------|---------------|-------|
| 1.0.0 | 2026-04-30 | TCPD AE 2008-2024 | Initial model |

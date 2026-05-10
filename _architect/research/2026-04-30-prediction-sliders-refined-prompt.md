# Refined Prompt: Multi-Factor Prediction Analysis System

**Date:** 2026-04-30  
**Status:** Research Phase  
**Scope:** Data Science + Backend + Frontend

---

## Problem Statement

The platform currently provides election predictions using only three adjustable parameters (anti-incumbency percentage, expected turnout, and total electors) with a simple formula-based approach that applies uniform assumptions across all constituencies. The user wants to build a robust, data-driven prediction system with 20+ adjustable sliders representing diverse factors (gender ratio, SIR normalization, development indices, rural/urban dynamics, scheme impact, etc.) that enables users to calibrate predictions based on their own survey data or local knowledge. The system must work across all Indian constituencies for all election types (Assembly Election, General Assembly, General Election), not just Tamil Nadu, and must provide constituency-specific formulas rather than averaging, along with automatically calculated error margins that reflect the uncertainty introduced by each slider configuration.

## Current State

The prediction engine exists at [frontend/src/engine/predictionEngine.ts](frontend/src/engine/predictionEngine.ts) and exposes three parameters via [PredictionPanel.tsx](frontend/src/components/PredictionPanel.tsx): `antiIncumbencyPct` (0-100%), `turnoutPct` (0-100%), and `totalElectors` (optional override). The prediction algorithm scales electors by a growth factor, applies a simple anti-incumbency transfer (incumbent party loses X% vote share, runner-up gains 70% of that loss, others split 30%), and recalculates votes from adjusted shares. A separate "new party" feature allows introducing a hypothetical party with configurable vote share and affinity-weighted redistribution. The backend data models ([api/models.py](api/models.py)) contain rich fields including `turnout_percentage`, `vote_share_percentage`, `margin`, `sex`, `age`, `incumbent`, `turncoat`, `recontest`, `no_terms`, `constituency_type` (urban/rural), and `district_name`, but these are not currently used in prediction formulas. Data science notebooks exist in [datascience/notebooks/](datascience/notebooks/), including [06_predictive_model.ipynb](datascience/notebooks/06_predictive_model.ipynb) with Random Forest and XGBoost classifiers trained on features like `age`, `turnout_percentage`, `prev_margin_pct`, `is_incumbent`, `is_female`, `turnout_change`, and `prev_party_seats`, achieving approximately 85-90% accuracy on 2021 test data based on 2011-2016 training data. However, these ML models are not integrated into the application. The platform has three compressed TCPD datasets available at [data/TCPD_AE_All_States_2026-4-30.csv.gz](data/TCPD_AE_All_States_2026-4-30.csv.gz), [data/TCPD_GA_All_States_2026-4-30.csv.gz](data/TCPD_GA_All_States_2026-4-30.csv.gz), and [data/TCPD_GE_All_States_2026-4-30.csv.gz](data/TCPD_GE_All_States_2026-4-30.csv.gz) containing all Indian states and election years.

## Desired End State

Users should be able to adjust 20+ prediction sliders in the frontend interface, each representing a distinct factor validated through data science research (gender voting patterns, turnout delta probability, SIR-adjusted turnout normalization, rural/urban divide, incumbent fatigue, development index proxies, welfare scheme impact, alliance arithmetic, candidate profile factors, and regional voting patterns). Each slider should have a normalized default value derived from historical data averages, but users can override these to reflect ground intelligence or survey findings. The prediction engine should apply constituency-specific formulas for each factor, computing the cumulative impact on vote share and seat allocation. The system should automatically calculate and display confidence intervals and error margins based on the selected slider values, the historical variance for similar configurations, and data quality indicators. The backend should expose new API endpoints that provide factor metadata (valid ranges, historical distributions, correlation with outcomes), and the frontend should present sliders grouped by category (demographic, geographic, candidate-related, campaign-related) with contextual tooltips explaining what each factor measures and how it affects predictions. Predictions should work across all Indian states and constituencies with state-specific and constituency-specific calibration where data supports it. The system should support both formula-based and ML-based prediction modes, with users able to choose between them or view a blended output.

## Scope Definition

**In Scope:**

1. **Data Science Research Phase:** Conduct exploratory data analysis on the three TCPD datasets across all states and years to identify the top 20-25 factors that have statistically significant correlation with election outcomes, including but not limited to: (a) candidate demographics — age, gender, incumbent status, turncoat status, recontest status, number of prior terms, education level; (b) electoral dynamics — previous margin, vote share change, turnout percentage, turnout change, effective number of parties (ENOP), number of candidates; (c) geographic and demographic patterns — constituency type (urban/rural), district-level trends, sub-region effects; (d) temporal patterns — anti-incumbency cycles, years since last poll, party continuity. Produce correlation matrices, regression coefficients, SHAP feature importance scores, and effect size estimates for each factor.

2. **Formula Development:** For each identified factor, develop a mathematical formula or lookup table that quantifies its impact on vote share or win probability. Formulas must be constituency-specific where possible (e.g., turnout impact varies by urban/rural classification) and should be validated on held-out test data. Document formula derivation, assumptions, and known limitations. For factors not directly available in TCPD data (e.g., SIR normalization, development indices, scheme impact), define proxy measures using available fields or document data requirements for future integration.

3. **ML Model Training and Integration:** Train ensemble models (Random Forest, XGBoost, Gradient Boosting) on historical data with all identified factors as features. Compare performance against formula-based approach. Export trained models in a format suitable for backend inference (e.g., ONNX, pickle, or as deployed service). Implement backend API endpoints to serve ML predictions.

4. **Backend API Development:** Create new endpoints in [api/routes.py](api/routes.py) or dedicated routes file to: (a) return factor metadata (name, description, type, min/max/default values, historical distribution summary, data availability by state/constituency); (b) accept factor slider values as input and return adjusted predictions with confidence intervals; (c) provide historical performance metrics for similar slider configurations (e.g., "configurations like this had RMSE of X% on past elections").

5. **Frontend Slider UI:** Extend [PredictionPanel.tsx](frontend/src/components/PredictionPanel.tsx) to render 20+ sliders organized into collapsible sections by category. Each slider should display: current value, normalized default, tooltip with explanation, visual indicator if value differs significantly from default. Implement slider state management in React (likely using existing `AppPredictionParams` type extended with new fields). Ensure mobile-responsive layout with touch-friendly controls.

6. **Error Margin Calculation:** Implement logic to compute prediction uncertainty based on: (a) variance of historical outcomes for similar slider configurations (quantile regression or bootstrapped confidence intervals); (b) data quality scores (e.g., fewer historical data points = wider intervals); (c) factor interaction effects. Display error margins as ranges (e.g., "Party A: 45-52 seats, 80% confidence") in the results aggregation view.

7. **Constituency-Specific Calibration:** Where data supports it (e.g., post-2011 delimitation constituencies with 3+ election cycles), compute constituency-specific model parameters or adjustment factors. Store these in the database or as static lookup tables. Ensure the prediction engine applies the correct calibration for each constituency based on state, year, and delimitation ID.

8. **Testing and Validation:** Validate predictions on held-out test data (e.g., 2021 elections) using models trained on earlier cycles (2006-2016). Compute metrics: RMSE for vote share, accuracy for winner prediction, calibration plots for probability estimates. Document performance by state, election type, and factor configuration.

**Out of Scope:**

1. Real-time data ingestion — this analysis uses static TCPD datasets updated as of 2026-04-30. Live polling data, exit polls, or real-time sentiment analysis are not included.

2. Factors requiring external datasets not yet integrated — e.g., granular development indices from NITI Aayog, scheme beneficiary counts from government databases, caste demographics (TCPD does not include caste data), social media sentiment scores. Document these as future enhancements but do not block on them.

3. Constituency boundary changes and historical mapping — the system assumes constituencies are identified by TCPD's `delim_id` and `constituency_no`. Cross-delimitation mapping (e.g., pre-2008 vs post-2008 Tamil Nadu) is not in scope for this phase.

4. Advanced UI/UX features — interactive charts showing factor impact curves, side-by-side comparison of different slider configurations, scenario bookmarking with shareable URLs are deferred to a future phase. The initial implementation focuses on functional sliders and accurate predictions.

5. Multi-state simultaneous predictions — the system will support all states, but the UI and API are scoped for single-state analysis at a time (user selects a state, then adjusts sliders for that state's constituencies).

6. Admin/power user features — pre-computing and caching all possible slider combinations, A/B testing different model versions, or admin dashboards to monitor prediction accuracy are out of scope.

## Constraints and Assumptions

**Assumptions:**

1. **Data Completeness:** The TCPD datasets contain sufficient historical depth (at least 3 election cycles per state) to train meaningful models for most major states. For states or constituencies with sparse data (e.g., newly formed states, recent delimitations), predictions will have wider error margins and may fall back to state-level or national-level averages. This assumption should be validated during data exploration.

2. **Factor Independence for Sliders:** While factors may be statistically correlated (e.g., higher turnout correlates with anti-incumbency), sliders will be treated as independently adjustable in the UI. The prediction engine will account for correlations internally (e.g., via trained model coefficients or formula interaction terms), but users can set any combination of values. This may produce theoretically inconsistent scenarios, which is acceptable because users may have ground knowledge that overrides historical patterns.

3. **Linear or Smooth Impact Curves:** Most factor formulas will assume monotonic or smoothly varying impacts (e.g., higher turnout → higher probability of change, with diminishing returns). Highly non-linear or threshold effects (e.g., turnout above 80% triggers qualitatively different dynamics) will be approximated unless strong evidence supports a specific functional form.

4. **No Gerrymandering or Boundary Manipulation:** The system assumes constituency boundaries are stable within a delimitation period. Predictions for upcoming elections use the most recent delimitation's boundary definitions.

5. **SIR Normalization Proxy:** True SIR (Special Intensive Revision) data is not available in TCPD datasets. If needed, turnout percentage change between consecutive elections can serve as a proxy for voter list quality changes, with the assumption that abnormal drops or spikes may indicate list cleanup or ghost voter issues. This is a weak proxy and should be documented as a limitation.

6. **Historical Patterns Hold:** The formulas and models assume that relationships observed in historical data (e.g., female candidates underperform by X% on average) will continue to hold in future elections. Structural shifts (e.g., policy changes, social movements) are not modeled.

7. **User Intent for Survey-Based Adjustments:** The user mentions adjusting sliders "according to their survey" — this assumes users will conduct or have access to survey data providing ground-level insights (e.g., "in this district, welfare scheme satisfaction is 20% higher than historical average"). The system provides the mechanism to input such overrides but does not validate their accuracy.

**Constraints:**

1. **Performance:** Predictions must be computed in under 3 seconds for a state with 200+ constituencies. This likely rules out real-time deep learning inference and favors formula-based or lightweight ensemble models. If ML inference is too slow, pre-compute predictions for a grid of slider values and interpolate.

2. **Data Quality Variation:** TCPD data quality varies by state and year. Some elections have missing fields (e.g., `age`, `education`, `myneta_*`). The system must handle missing data gracefully, either via imputation (median/mode), exclusion from that factor's formula, or flagging uncertainty.

3. **Backward Compatibility:** Existing bookmarks and saved predictions use the current 3-parameter schema. Adding 20+ new parameters requires either: (a) versioning the params schema and handling migrations, or (b) ensuring new fields have sensible defaults so old bookmarks still work. Choose option (b) — all new slider fields default to normalized historical averages, so old bookmarks effectively apply "typical" conditions.

4. **Mobile UI Space:** Displaying 20+ sliders on mobile requires collapsible sections, tabbed navigation, or a summary view. The [PredictionPanel.tsx](frontend/src/components/PredictionPanel.tsx) already uses Radix UI collapsible components, which is a good pattern to extend.

5. **No Budget for External APIs or Datasets:** All analysis must use the provided TCPD datasets. If a desired factor cannot be derived or proxied from TCPD fields, document it as "requires external data" and exclude from the initial 20 factors.

6. **State-Specific vs. National Models:** It may not be feasible to train separate models for all 30+ states due to data sparsity. The system may use a hybrid approach: train a national model with state dummy variables, then apply state-specific calibration factors where sufficient data exists. This trade-off must be decided during research.

7. **Error Margin Realism:** Users expect error margins to be realistic (not artificially narrow). The system should avoid overconfidence. If a factor has weak historical signal or high variance, the error margin should widen noticeably when that slider is adjusted away from default.

## Success Criteria

1. **Data Science Deliverable:** A documented analysis report (Jupyter notebook or markdown) identifying at least 20 factors with: (a) correlation coefficient or SHAP importance score; (b) effect size estimate (e.g., "1 standard deviation increase in turnout associated with +3.2pp vote share for challenger party"); (c) validation on held-out data showing the factor's predictive value; (d) data availability matrix (which states/years have this field populated). The report must cover all states, not just Tamil Nadu.

2. **Formula Documentation:** For each factor, a written formula or decision rule specifying how slider values map to vote share adjustments. Formulas must be implemented in Python (backend or data science notebooks) with unit tests demonstrating correctness on synthetic examples. At least 15 of the 20+ factors must be formula-based; the remainder can be ML-only if a formula is not interpretable.

3. **ML Model Performance:** Ensemble models achieve at least 80% winner prediction accuracy and RMSE under 5 percentage points for vote share prediction on held-out 2021 elections (or most recent year available), averaged across major states (states with 50+ constituencies). Models must be serialized and loadable by backend API.

4. **Backend API Functional:** New endpoints return factor metadata and adjusted predictions. API accepts a JSON payload with 20+ slider values, a state identifier, and election type, and returns constituency-level predictions with confidence intervals in under 3 seconds for states with up to 200 constituencies. API responses include data quality flags (e.g., "age data missing for 30% of candidates in this state, age factor impact is approximate").

5. **Frontend UI Usable:** The prediction panel renders all sliders organized into logical categories (e.g., "Demographic Factors", "Turnout & Mobilization", "Candidate Profile", "Regional Dynamics"). Each slider has a label, current value, default value indicator, and tooltip. Users can adjust sliders and see predictions update. UI is responsive on mobile (sliders are thumb-friendly, sections are collapsible, no horizontal scroll). Initial load and slider interaction feel smooth (no jank, <100ms debounced update).

6. **Error Margins Displayed:** The aggregate results view shows seat count ranges (e.g., "Party A: 48-55 seats, 75% confidence") and includes a brief explanation of what factors contribute to uncertainty. Error margin width should increase observably when users set multiple sliders far from default values.

7. **Generalization to All States:** Predictions work for all states in the TCPD datasets. For states with rich data (3+ election cycles, <10% missing fields), predictions should match held-out test data with <8pp RMSE. For sparse-data states, predictions should fall back to state-level or regional averages and display a warning ("Limited historical data available for this state, predictions are less certain").

8. **Backward Compatibility Verified:** Existing bookmarks (stored with 3 old parameters) load successfully and produce predictions. New parameters default to their normalized values, so old bookmarks behave as if "typical" conditions were selected.

## Open Questions

1. **Factor Selection Strategy:** Should the 20+ factors be selected purely by statistical significance (correlation/SHAP scores), or should we include theoretically important factors even if their signal is weak in TCPD data (e.g., development indices proxied by urban/rural)? The user mentioned "SIR, schemes, development" specifically — if TCPD lacks direct measures, do we proxy them or document as future work?

2. **ML vs. Formula Weighting:** Should the system expose a "mode" toggle (formula-based vs. ML-based) to users, or always apply both and show a blended/averaged prediction? Or treat ML as a validation/calibration layer on top of formulas?

3. **Turnout-Delta Swing Probability Model:** The user referenced a specific model from their Gemini conversation: `P_AI = 50 + (ΔT × 5)` where ΔT is turnout shift. Should this formula be directly implemented as the "turnout" slider's effect, or should we derive a generalized version from data? How does this interact with other factors (e.g., incumbency, gender ratio)?

4. **Constituency Weight Math:** The user mentioned "1% turnout = ~2,450 votes per constituency in TN". This is a linear conversion based on electorate size. Should the system expose an "expected electorate size" slider (defaulting to latest census projection), or hardcode growth factors based on state-level demographic trends?

5. **Gender Ratio Impact:** TCPD has candidate gender, but not voter gender ratios or turnout by gender. Should we compute "fraction of female candidates" as a proxy for gender dynamics, or mark this as requiring external data (e.g., Election Commission gender-disaggregated turnout reports)?

6. **Alliance Arithmetic:** The user noted "alliance arithmetic overriding turnout models (2021 exception)". How should alliance formation be modeled? TCPD has `party` and historical `party_type_tcpd` (national, state, independent). Should we infer alliance effects from vote transfers between elections, or require users to manually specify alliance configurations in the UI?

7. **Real-Time Confidence Intervals:** Computing bootstrapped confidence intervals for every slider adjustment may be too slow. Should we pre-compute quantile predictions for a coarse grid of slider values and interpolate, or use a simpler analytic approximation (e.g., standard error from model coefficients)?

8. **Error Margin Aggregation:** When a user adjusts multiple sliders, how should uncertainty compound? If each factor adds independent noise, variances sum (σ²_total = Σσ²_i). But if factors are correlated, covariances matter. Should we model full covariance structure (complex) or assume independence (simpler, conservative)?

9. **Factor Grouping and Defaults:** The user mentioned "normalized value" as default. Should defaults be: (a) national historical average; (b) state-specific average; (c) most recent election value; (d) median of last 3 elections? Different defaults may be appropriate for different factors.

10. **Validation Split Strategy:** For states with only 3 election cycles (e.g., post-2011 TN: 2011, 2016, 2021), standard train/test split leaves only 1 cycle for testing. Should we use leave-one-out cross-validation, or pool data across states for training and test on a specific state? The latter may not capture state-specific patterns well.

11. **Caching Strategy:** Should backend pre-compute predictions for "default slider values" and cache them, or always compute on-demand? Pre-computing saves time for most users but may go stale if data updates.

12. **Factor Tooltip Content:** Should tooltips show only qualitative explanations ("Higher turnout often indicates stronger anti-incumbency sentiment") or also quantitative summaries ("Historically, 1pp turnout increase → 0.6pp vote share swing, σ=1.2pp")?

13. **Regional Sub-Models:** Some states have strong regional divides (e.g., Vidarbha vs. Marathwada in Maharashtra). Should we train region-specific models where `sub_region` field is populated in TCPD, or treat state as atomic?

14. **Handling Missing Data in Sliders:** If a factor's data is missing for a constituency (e.g., no age recorded for incumbent), should that slider be disabled/grayed out, default to state average, or still adjustable with a warning icon?

15. **Exit Poll vs. Pre-Poll Factors:** The user mentioned exit poll methodology factors (stratified sampling, shy voter effect). These affect poll accuracy, not actual outcomes. Should we include "prediction methodology quality" sliders (e.g., survey sample size, timing) as meta-factors affecting error margins, or keep sliders focused on ground realities affecting votes?

---

**Next Steps:**

1. Load and explore the three TCPD datasets: assess data completeness, identify common fields across AE/GA/GE, compute summary statistics by state and year.
2. Run correlation analysis and feature importance (SHAP) on existing predictive models to rank candidate factors.
3. Prototype 5-10 formula-based factors with unit tests and validate on held-out data.
4. Draft factor metadata schema and API endpoint design.
5. Present findings and seek user feedback on open questions before proceeding to full implementation.

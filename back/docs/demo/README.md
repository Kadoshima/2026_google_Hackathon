# Demo assets

This folder contains deterministic fixtures used by the product demo.

## Files

| File | Purpose |
|---|---|
| `bad-paper-sample.md` | Intentionally-flawed paper draft used to showcase the analysis pipeline. Contains unsupported speedup claims, missing statistical tests, dangling references, etc. |
| `expected-analysis.json` | Precomputed `AnalysisReadyResponse` for the sample. Served by `GET /v1/demo/sample` so the demo doesn't depend on Vertex AI being available. |

## Using the sample in a live demo

### Option A — serve the precomputed result (fast, offline)

The backend exposes `GET /v1/demo/sample` which returns the JSON in
`expected-analysis.json`. The frontend `/demo` page uses this to render
a realistic session without touching Firestore or Vertex AI.

### Option B — run the sample through the real pipeline

Submit the paper as a `DOC` artifact (plain text):

```bash
curl -X POST https://$API/v1/artifacts \
  -H 'X-Client-Token: demo' \
  -H 'Content-Type: application/json' \
  -d @<(jq -Rs '{artifact_type:"DOC",content:.,title:"AMR-Net (demo)"}' \
        back/docs/demo/bad-paper-sample.md)
```

The returned `session_id` can then be analysed via `POST /v1/analyze` and
polled via `GET /v1/analysis/:id`. Costs are bounded by the cost guard
(`COST_GUARD_*` env vars).

## Demo narrative (1-minute pitch)

1. **Hook** — "AIで速くなったのに、品質の責任が曖昧になった"
2. **Upload** — drag the `bad-paper-sample.md` into `/new`
3. **Pipeline** — show agent trace lighting up (Planner → Extractor → Claim Miner → Preflight → Evidence Auditor → Logic Sentinel → Synthesizer)
4. **Top-3 risks** — highlight "10x faster" unsupported claim
5. **Oral defense** — answer the follow-up question poorly and watch the draft adoption gate reject it
6. **Patch** — accept the suggested TODOs and download the unified diff
7. **Close** — "説明できるまで出荷しない"

## Maintenance

Regenerate `expected-analysis.json` whenever the sample markdown changes:

```bash
# Run the real pipeline, export the ready response, strip dynamic fields.
curl -s "$API/v1/analysis/$ANALYSIS_ID" \
  | jq 'del(.analysis_id, .session_id, .pointers)' \
  > back/docs/demo/expected-analysis.json
```

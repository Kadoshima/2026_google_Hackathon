# Operations

This document is for engineers running Reviewer Zero in production.

## Service map

```
[ Browser ]
    │  HTTPS
    ▼
[ Next.js (front) ]   ── Vercel or Cloud Run
    │  REST /v1/*
    ▼
[ Hono (back) ]       ── Cloud Run
    │
    ├── Firestore           (sessions, submissions, analyses)
    ├── Cloud Storage       (raw uploads, JSON, HTML reports)
    ├── Cloud Tasks         (analysis worker dispatch)
    ├── Vertex AI           (claim/evidence/oral defense LLM calls)
    ├── Document AI         (PDF OCR – optional)
    └── GROBID              (citation extraction – optional)
```

## SLOs (initial targets)

| SLO | Target | Window |
|---|---|---|
| `/v1/healthz` availability | 99.9% | 30d rolling |
| `/v1/upload` p95 latency | < 2s (excluding LLM) | 7d rolling |
| `/v1/analyze` end-to-end success rate | > 95% | 30d rolling |
| Vertex call error budget | < 5% 5xx | 7d rolling |

## Logs

All logs are JSON. Common queries:

```text
# Errors only
severity>=ERROR

# Trace one user request
jsonPayload.requestId="<uuid>"

# Slow requests
jsonPayload.message="http_request" jsonPayload.durationMs>2000
```

## Runbooks

### `5xx spike on /v1/analyze`

1. Filter logs by `path=/v1/analyze severity>=ERROR`.
2. Check `code` field — common values:
   - `WORKER_FAILED`: Cloud Tasks dispatch failed; verify the queue exists
     and the runtime SA has `roles/cloudtasks.enqueuer`.
   - `INTERNAL_ERROR`: inspect the `error.message`.
3. Confirm Vertex AI quota and the latest revision.
4. If localized to a single revision, roll back via:
   ```bash
   gcloud run services update-traffic reviewer-zero-back \
     --to-revisions=PREVIOUS=100 --region=$REGION
   ```

### `Worker tasks stuck`

1. Check Cloud Tasks console for the `reviewer-zero-analysis` queue.
2. Inspect Firestore: any `analysis` doc stuck in `RUNNING`?
3. Force-fail stuck tasks (manual):
   ```bash
   # via Firestore console: set status=FAILED with reason="manual_unstick"
   ```
4. If recurring, increase `--max-instances` or `--concurrency` on Cloud Run.

### `Vertex AI quota exceeded`

1. Check the project quota in the GCP console.
2. Temporarily reduce `ANALYSIS_LLM_MAX_SEGMENTS` or
   `ANALYSIS_CLAIM_REFINER_MAX_ITER`.
3. Switch the primary model to a faster/cheaper variant via `VERTEX_MODEL`
   and trigger a new revision.

### `Privacy / data deletion request`

The retention mode is captured per session in Firestore
(`session.retentionPolicy`). To honor a deletion request:

```bash
# 1. Find the session id from the user-supplied request id.
# 2. Delete the Firestore documents.
# 3. Delete the GCS prefix gs://reviewer-zero-uploads/sessions/<sessionId>/
```

A scheduled cleanup job is on the backlog (`OPS-003`).

## Capacity planning

| Component | Bottleneck | Scaling lever |
|---|---|---|
| Cloud Run (back) | concurrent requests | `--max-instances`, `--concurrency` |
| Cloud Tasks queue | dispatch rate | queue `maxDispatchesPerSecond` |
| Vertex AI | per-project QPM | quota increase request |
| Firestore | document write rate | shard hot keys (none today) |

## Backups

- Firestore: enable scheduled exports to a dedicated GCS bucket
  (`gcloud firestore export gs://reviewer-zero-backups/$(date +%F)`).
- Cloud Storage: enable Object Versioning on the upload bucket.

## On-call expectations

- Pager only fires when SLOs burn faster than 2x the target.
- All other anomalies should be reviewed in the daily ops standup.

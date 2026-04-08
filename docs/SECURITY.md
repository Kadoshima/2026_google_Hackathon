# Security

This document describes the security posture of Reviewer Zero and the controls
in place across the backend, frontend, and infrastructure.

## Reporting a vulnerability

If you discover a security issue, please email **security@reviewer-zero.example**
(replace with your real address before going live). Do **not** open a public
GitHub issue. We aim to acknowledge reports within 2 business days.

## Threat model summary

| Asset | Threat | Control |
|---|---|---|
| Uploaded papers / PRs | Disclosure to other tenants | Per-session GCS prefixes, signed URLs only, no public objects |
| LLM prompts containing PII | Leakage to logs | Structured logger redacts payloads, only sizes/IDs are logged |
| Backend API | Abuse / scraping | Per-scope rate limits keyed by client token + IP fallback |
| Backend API | CSRF / cross-origin abuse | CORS allowlist (production); no cookies (token-based) |
| Backend API | Header / payload injection | Hono parsing, JSON validation, file extension checks |
| Storage objects | Path traversal in zip | Zip-slip mitigated in `extract/latex.extractor.ts` |
| Secrets | Exposure | Loaded only from env / GCP Secret Manager; never committed |

## Authentication and authorization

- Clients send an opaque `X-Client-Token` header. The backend hashes it
  (`SHA256`) before using it as a session/owner key
  (`back/src/utils/security.ts`).
- The token is **not** an authorization grant by itself. It is sufficient for
  the current MVP because each session is isolated and only its own owner
  hash can access its data, but additional checks should be added before
  hosting tenant data with strong confidentiality requirements.
- For administrative endpoints (`/internal/*`), use Cloud Run IAM
  invocation identity rather than the client token.

## Transport

- All deployed environments must terminate TLS at the load balancer
  (Cloud Run does this by default). HTTP is rejected.
- The backend emits HSTS via `securityHeadersMiddleware`.

## CORS

- Configured by `ALLOWED_ORIGINS` (comma separated).
- `CORS_ALLOW_ALL=false` is **required** in production. The startup logger
  emits a warning if this combination would expose the API to any origin.

## Rate limiting

- Fixed-window in-memory limiter scoped per endpoint.
- Limits are configurable via env vars (see `.env.example`).
- The limiter prefers `X-Client-Token` hash; falls back to
  `X-Forwarded-For` / `X-Real-IP` / `CF-Connecting-IP`.
- For multi-replica deployments, swap to a Redis-backed limiter
  (planned in `OPERATIONS.md`).

## Input validation

- Multipart uploads validate content-type, file extension, and metadata
  shape (`back/src/routes/v1/upload.ts`).
- JSON endpoints validate the body shape and reject unknown fields where
  applicable.
- File handlers enforce maximum byte sizes through environment variables
  (`PDF_VERTEX_MAX_BYTES`, `GROBID_MAX_BYTES`, etc.).

## Secrets management

- Local development uses `.env` (gitignored).
- Production: store secrets in **GCP Secret Manager** and reference them
  from the Cloud Run service definition (`infra/cloudrun/back-service.yaml`).
- The runtime service account requires:
  - `roles/secretmanager.secretAccessor`
  - `roles/datastore.user` (Firestore)
  - `roles/storage.objectAdmin` (limited to the upload bucket)
  - `roles/cloudtasks.enqueuer`
  - `roles/aiplatform.user` (Vertex AI)

## Logging and monitoring

- Structured JSON logs via `back/src/utils/logger.ts`. They are picked up
  natively by Cloud Logging and can be filtered by `severity`, `requestId`,
  `path`, etc.
- Request IDs are generated per request (or honored if the client supplies
  `X-Request-Id`) and echoed back to the caller. Quote them in support
  tickets.
- Errors include the request ID in the response body so users can correlate.

## Known limitations / hardening backlog

- [ ] Distributed rate limiting (Redis or Cloud Memorystore)
- [ ] Field-level PII redaction in extracted text before sending to LLM
- [ ] Optional client-side encryption for "no-save" retention mode
- [ ] Penetration test before public launch
- [ ] SBOM generation in CI

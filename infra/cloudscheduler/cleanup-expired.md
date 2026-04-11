# Scheduled retention cleanup

This job sweeps Firestore for expired sessions and deletes their
Firestore documents and GCS objects. It is designed to run as a
[Cloud Run Job](https://cloud.google.com/run/docs/create-jobs)
invoked on a schedule by Cloud Scheduler.

## 1. Build the job image

Re-uses the backend Dockerfile but overrides the command.

```bash
PROJECT_ID=$(gcloud config get-value project)
REGION=asia-northeast1
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/reviewer-zero/reviewer-zero-cleanup:latest"

docker build -f back/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"
```

## 2. Create the Cloud Run Job

```bash
gcloud run jobs create reviewer-zero-cleanup \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="reviewer-zero-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --set-env-vars=NODE_ENV=production,SERVICE_NAME=reviewer-zero-cleanup,LOG_LEVEL=INFO \
  --set-env-vars=GCP_PROJECT_ID=${PROJECT_ID},BUCKET_NAME=reviewer-zero-uploads \
  --set-env-vars=CLEANUP_NO_SAVE_DEFAULT_TTL_HOURS=24,CLEANUP_BATCH_SIZE=500 \
  --command=node \
  --args=dist/scripts/cleanup-expired.js \
  --max-retries=2 \
  --task-timeout=900
```

Update an existing job with `gcloud run jobs update ...`.

## 3. Schedule it

```bash
gcloud scheduler jobs create http reviewer-zero-cleanup-hourly \
  --location="$REGION" \
  --schedule="0 * * * *" \
  --time-zone="Asia/Tokyo" \
  --http-method=POST \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/reviewer-zero-cleanup:run" \
  --oauth-service-account-email="reviewer-zero-runtime@${PROJECT_ID}.iam.gserviceaccount.com" \
  --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
```

Alternative schedules:

- `0 * * * *` — hourly (recommended baseline)
- `*/15 * * * *` — every 15 minutes (aggressive)
- `0 3 * * *` — daily at 03:00 JST (quieter, longer TTL)

## 4. Dry run

You can always preview what would be deleted without mutating anything:

```bash
gcloud run jobs execute reviewer-zero-cleanup \
  --region="$REGION" \
  --args=dist/scripts/cleanup-expired.js,--dry-run
```

## 5. Observability

All output is structured JSON — filter in Cloud Logging:

```
resource.type="cloud_run_job"
resource.labels.job_name="reviewer-zero-cleanup"
jsonPayload.message=~"cleanup_"
```

Key messages: `cleanup_started`, `cleanup_candidates`,
`cleanup_session_deleted`, `cleanup_finished`, `cleanup_session_failed`.

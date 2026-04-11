# Deployment

This guide walks through deploying Reviewer Zero to Google Cloud
(Cloud Run + Firestore + Cloud Storage + Cloud Tasks + Vertex AI).

## 1. Prerequisites

- A GCP project with billing enabled
- Owner / Editor permissions to provision resources
- `gcloud` CLI authenticated (`gcloud auth login`)
- The repository checked out locally

## 2. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  cloudtasks.googleapis.com \
  aiplatform.googleapis.com \
  secretmanager.googleapis.com \
  documentai.googleapis.com
```

## 3. Provision dependencies

### Firestore (Native mode)

```bash
gcloud firestore databases create --location=asia-northeast1
```

### Cloud Storage bucket

```bash
gcloud storage buckets create gs://reviewer-zero-uploads \
  --location=asia-northeast1 \
  --uniform-bucket-level-access
```

### Cloud Tasks queue

```bash
gcloud tasks queues create reviewer-zero-analysis \
  --location=asia-northeast1
```

### Artifact Registry repo

```bash
gcloud artifacts repositories create reviewer-zero \
  --repository-format=docker \
  --location=asia-northeast1
```

### Service accounts

```bash
gcloud iam service-accounts create reviewer-zero-runtime \
  --display-name="Reviewer Zero runtime"

PROJECT_ID=$(gcloud config get-value project)
SA="reviewer-zero-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

for ROLE in \
  roles/datastore.user \
  roles/storage.objectAdmin \
  roles/cloudtasks.enqueuer \
  roles/aiplatform.user \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" --role="${ROLE}"
done
```

## 4. Configure secrets

```bash
echo -n "your-vertex-key" | gcloud secrets create vertex-api-key --data-file=-
```

Reference them from `infra/cloudrun/back-service.yaml` (placeholder
`vertex-api-key` already wired up).

## 5. Build and deploy

### Option A — local Docker push

```bash
REGION=asia-northeast1
REPO=reviewer-zero
SERVICE=reviewer-zero-back
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:$(git rev-parse --short HEAD)"

gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet
docker build -f back/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"

# Edit infra/cloudrun/back-service.yaml first to substitute PROJECT_ID/REGION,
# then apply:
gcloud run services replace infra/cloudrun/back-service.yaml --region=$REGION
```

### Option B — Cloud Build trigger

`infra/cloudbuild.yaml` performs build → push → deploy in one shot.
Wire it up to a Cloud Build trigger watching `main`.

### Option C — GitHub Actions

`.github/workflows/deploy-backend.yml` deploys from CI using Workload
Identity Federation. Configure these GitHub repository settings:

| Type | Name | Example |
|---|---|---|
| Secret | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/123/locations/global/workloadIdentityPools/github/providers/github` |
| Secret | `GCP_DEPLOY_SERVICE_ACCOUNT` | `gh-deployer@project.iam.gserviceaccount.com` |
| Variable | `GCP_PROJECT_ID` | your project id |
| Variable | `GCP_REGION` | `asia-northeast1` |
| Variable | `CLOUD_RUN_SERVICE` | `reviewer-zero-back` |
| Variable | `ARTIFACT_REPO` | `reviewer-zero` |

## 6. Frontend

The frontend is a Next.js app. Recommended hosts:

- **Vercel**: connect the GitHub repo, set the `front/` directory as the
  project root. Set `NEXT_PUBLIC_API_URL` to your Cloud Run URL +`/v1`.
- **Cloud Run** (containerized): use `front/Dockerfile` and push the image
  to Artifact Registry.

## 7. Verifying a deployment

```bash
SERVICE_URL=$(gcloud run services describe reviewer-zero-back \
  --region=$REGION --format='value(status.url)')

curl -fsSL "$SERVICE_URL/v1/healthz"
curl -fsSL "$SERVICE_URL/v1/version"
```

The `version` endpoint returns build metadata that should match the
deployed revision.

## 8. Rollback

```bash
gcloud run revisions list --service=reviewer-zero-back --region=$REGION
gcloud run services update-traffic reviewer-zero-back \
  --to-revisions=PREVIOUS_REVISION_NAME=100 --region=$REGION
```

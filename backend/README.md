# PlungePalz Places API

Production AWS serverless backend that powers the discovery, submission, rating, and management of cold plunge and sauna locations for the PlungePalz platform.

## Overview

The PlungePalz Places API provides:

- **Submission Flow**: Users submit a place; an `in_review` record is created immediately (verification codes deferred)
- **AI Autofill**: Optional later enrichment via Google Places New API + Claude (Anthropic API). **AWS_IAM / admin-triggered only** — not a public route.
- **Public Discovery**: Algolia search and DynamoDB get-by-id
- **Ratings & Comments**: User-generated ratings and feedback
- **Claiming & Reporting**: Place claiming by business owners, abuse reporting
- **Admin Review**: Internal workflow for place approval and moderation

## Architecture

```
API Gateway (REST) → Lambda Functions → DynamoDB
                      ↓
               Anthropic API (Claude)
               Google Places New API v1
```

- **Region**: `us-east-1`
- **API Stage**: `dev`
- **Auth**: Public endpoints = `NONE` | Admin endpoints (review, edit, AI autofill) = `AWS_IAM`

## Directory Map

| Folder | Purpose |
|--------|---------|
| `docs/` | Architecture, API reference, data schemas, submission flow, roadmap |
| `infrastructure/` | CloudFormation templates and IaC placeholders |
| `lambda_functions/` | Lambda function handlers (one folder per function) |
| `lambda_layers/` | Lambda layers (e.g. `generate_place_with_ai` for AI autofill logic) |
| `tests/` | Test folders (`{LambdaName}/Test_XXX/`) with instructions, fixtures, and CloudWatch logs |
| `scripts/` | Local invoke script for testing Lambdas without deploying |

## Quickstart

### 1. Deploy the CloudFormation Stack

Deploy is owned by AWS Bot / a separate infra change. This package targets **us-east-1** / **dev**. Do not treat `infrastructure/cloudformation.yaml` (legacy us-east-2 / Places_PROD) as the MVP source of truth.

### 2. Set Environment Variables

For local development and `scripts/local_invoke.py --live`, copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# Edit .env with your GOOGLE_PLACES_API_KEY, etc.
```

For deployed Lambdas, configure via CloudFormation parameters or the AWS console:

| Variable | Description |
|----------|-------------|
| `GOOGLE_PLACES_API_KEY` | Google Places New API v1 key |
| `ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY` | Anthropic API key for Claude |
| `ANTHROPIC_MODEL` | Claude model (default: `claude-haiku-4-5-20251001`; `ANTHROPIC_MODEL_ID` also accepted) |
| `ANTHROPIC_MAX_TOKENS` | Autofill token cap (default 1024) |
| `TABLE_PLACES` | DynamoDB table for places (default: `Places_Places`) |
| `TABLE_SUBMISSIONS` | DynamoDB table for submissions (default: `Places_Submissions`) |
| `TABLE_RATINGS` | DynamoDB table for ratings (default: `Places_RatingsComments`) |
| `TABLE_CLAIMED` | DynamoDB table for claimed audit (default: `Places_ClaimedAudit`) |
| `ALGOLIA_APP_ID` | Algolia application id |
| `ALGOLIA_SEARCH_API_KEY` | Search-only key (`Places_Search`) |
| `ALGOLIA_WRITE_API_KEY` | Write key (`Places_AlgoliaSync` only) |
| `ALGOLIA_INDEX_NAME` | Index name (dev: `places_dev`) |
| `CORS_ALLOWED_ORIGIN` | CORS origin (default `*`) |

### 3. Upload the Lambda Layer

Package and upload the `generate_place_with_ai` layer (includes `anthropic` SDK and `h3`):

```bash
cd lambda_layers/generate_place_with_ai
pip install --platform manylinux2014_x86_64 --only-binary=:all: \
  --implementation cp --python-version 3.14 \
  -r requirements.txt -t python/
zip -r generate_place_with_ai.zip python/
aws lambda publish-layer-version \
  --layer-name generate_place_with_ai \
  --zip-file fileb://generate_place_with_ai.zip \
  --compatible-runtimes python3.14 \
  --region us-east-1
```

Attach `generate_place_with_ai` to `Places_SubmitAIAutofill`. Attach `places_common` to every HTTP Lambda and `Places_AlgoliaSync`.

### 4. Local Testing (Before Deploy)

Validate Lambdas locally without deploying:

```bash
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001 --live   # Real Google + Anthropic API
```

See [docs/TESTING.md](docs/TESTING.md) and [.cursorrules](.cursorrules) for the testing workflow.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System overview, API Gateway, Lambda, DynamoDB, AI stack
- [API Reference](docs/API_REFERENCE.md) — All endpoints, methods, request/response shapes
- [Data Schemas](docs/DATA_SCHEMAS.md) — Full DynamoDB table schemas for all 4 tables
- [Submission Flow](docs/SUBMISSION_FLOW.md) — End-to-end place submission workflow
- [Roadmap](docs/ROADMAP.md) — Feature roadmap and task tracking

## AWS Permissions

The Lambda execution role (`PlacesLambdaExecutionRole`) requires:

- **DynamoDB**: Full CRUD on `Places_Places`, `Places_Submissions`, `Places_RatingsComments`, `Places_ClaimedAudit`
- **SES**: Email sending for verification codes
- **SNS**: SMS sending for verification codes
- **S3** (future): Image upload pipeline for `cover_image`, `header_image`

## Runtime

- **Python**: 3.14
- **Dependencies**: `boto3` (Lambda runtime), `places_common` layer; `algoliasearch` on Search + AlgoliaSync; `h3` + `anthropic` on the AI layer

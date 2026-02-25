# PlungePalz Places API

Production AWS serverless backend that powers the discovery, submission, rating, and management of cold plunge and sauna locations for the PlungePalz platform.

## Overview

The PlungePalz Places API provides:

- **Submission Flow**: Users submit new places via a multi-stage verification process (email + SMS codes)
- **AI Autofill**: Google Places New API + Claude Haiku (Bedrock) enrich submissions with structured data
- **Public Discovery**: Search and retrieve places by ID, with geo-aware H3-based search
- **Ratings & Comments**: User-generated ratings and feedback
- **Claiming & Reporting**: Place claiming by business owners, abuse reporting
- **Admin Review**: Internal workflow for place approval and moderation

## Architecture

```
API Gateway (REST) → Lambda Functions → DynamoDB
                      ↓
               Bedrock (Claude Haiku)
               Google Places New API v1
```

- **Region**: `us-east-2` (Ohio)
- **Stack Name**: `plungepalz-places-api-prod`
- **API Stage**: `Places_PROD`
- **Auth**: Public endpoints = `NONE` | Admin endpoints = `AWS_IAM`

## Directory Map

| Folder | Purpose |
|--------|---------|
| `docs/` | Architecture, API reference, data schemas, submission flow, roadmap |
| `infrastructure/` | CloudFormation templates and IaC placeholders |
| `functions/` | Lambda function handlers (one folder per function) |
| `layers/` | Lambda layers (e.g. `generate_place_with_ai` for AI autofill logic) |
| `tests/` | Unit and integration-style tests |

## Quickstart

### 1. Deploy the CloudFormation Stack

The live stack `plungepalz-places-api-prod` is deployed in `us-east-2`. If deploying fresh:

```bash
aws cloudformation deploy \
  --template-file infrastructure/cloudformation.yaml \
  --stack-name plungepalz-places-api-prod \
  --region us-east-2 \
  --capabilities CAPABILITY_IAM
```

### 2. Set Environment Variables

Configure these for each Lambda function (via CloudFormation parameters or console):

| Variable | Description |
|----------|-------------|
| `GOOGLE_PLACES_API_KEY` | Google Places New API v1 key |
| `BEDROCK_REGION` | AWS region for Bedrock (e.g. `us-east-1`) |
| `BEDROCK_MODEL_ID` | Model ID (default: `anthropic.claude-haiku-4-5-20251001-v1:0`) |
| `TABLE_PLACES` | DynamoDB table for places (default: `Places_Places`) |
| `TABLE_SUBMISSIONS` | DynamoDB table for submissions (default: `Places_Submissions`) |
| `TABLE_RATINGS` | DynamoDB table for ratings (default: `Places_RatingsComments`) |
| `TABLE_CLAIMED` | DynamoDB table for claimed audit (default: `Places_ClaimedAudit`) |

### 3. Upload the Lambda Layer

Package and upload the `generate_place_with_ai` layer:

```bash
cd layers/generate_place_with_ai
zip -r generate_place_with_ai.zip python/
aws lambda publish-layer-version \
  --layer-name generate_place_with_ai \
  --zip-file fileb://generate_place_with_ai.zip \
  --compatible-runtimes python3.14 \
  --region us-east-2
```

Attach the layer to `Places_SubmitAIAutofill` (and any future functions that need it).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System overview, API Gateway, Lambda, DynamoDB, AI stack
- [API Reference](docs/API_REFERENCE.md) — All endpoints, methods, request/response shapes
- [Data Schemas](docs/DATA_SCHEMAS.md) — Full DynamoDB table schemas for all 4 tables
- [Submission Flow](docs/SUBMISSION_FLOW.md) — End-to-end place submission workflow
- [Roadmap](docs/ROADMAP.md) — Feature roadmap and task tracking

## AWS Permissions

The Lambda execution role (`PlacesLambdaExecutionRole`) requires:

- **Bedrock**: `bedrock:InvokeModel` for Claude Haiku
- **DynamoDB**: Full CRUD on `Places_Places`, `Places_Submissions`, `Places_RatingsComments`, `Places_ClaimedAudit`
- **SES**: Email sending for verification codes
- **SNS**: SMS sending for verification codes
- **S3** (future): Image upload pipeline for `cover_image`, `header_image`

## Runtime

- **Python**: 3.14
- **Dependencies**: `boto3` (provided by Lambda runtime), standard library only
- **Optional**: `h3` library for geo indexing (as a separate Lambda layer)

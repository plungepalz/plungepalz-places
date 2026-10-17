# PlungePalz Places — Dev Infrastructure

This directory contains **AWS SAM infrastructure-as-code** for a self-contained **dev environment** of PlungePalz Places in **us-east-1**.

**⚠️ IMPORTANT**: This stack creates **NEW** resources with the `Places_*` table prefix and `plungepalz-places-dev-*` naming for all other resources. It does NOT import or modify any existing AWS resources in the account.

---

## What It Creates

### DynamoDB Tables (PAY_PER_REQUEST)
- **Places_Places**: Primary places table with DynamoDB Streams enabled
  - GSIs: `status-ts-index`, `slug-index`, `h3-r7-index`, `h3-r5-index`, `h3-r4-index`
- **Places_Submissions**: Submission records (no GSIs)

### Lambda Functions
- **Places_Search**: Search places by geo/type/activity (uses Algolia search key)
- **Places_GetByID**: Fetch single place by ID
- **Places_Submit**: Create submissions with verification codes
- **Places_AlgoliaSync**: DynamoDB Stream → Algolia sync (uses Algolia write key)
- **Places_AdminReview**: Admin-only place review (AWS_IAM auth)

**Missing Handler Dependency**: `Places_AlgoliaSync` expects `backend/lambda_functions/Places_AlgoliaSync/index.py`. If not yet implemented, the Lambda will be created but fail at invocation until Backend Bot implements the handler.

### Lambda Layer
- **plungepalz-places-dev-generate-place-ai**: Anthropic SDK + AI generation logic from `backend/lambda_layers/generate_place_with_ai`

### API Gateway (REST)
- **Stage**: `dev`
- **Endpoints**:
  - `GET /search` → Places_Search (no auth)
  - `GET /place/{place_id}` → Places_GetByID (no auth)
  - `POST /submit` → Places_Submit (no auth)
  - `POST /plungepalz_admin/review` → Places_AdminReview (AWS_IAM auth)
- **CORS**: Configured for `http://localhost:3000` (override with `AllowedOrigins` parameter)
- **Throttling**: Submit endpoint limited to ~5 req/sec

### IAM Roles (Least Privilege)
- One role per function
- Scoped to only the SSM parameters each function needs:
  - **Places_Search**: reads `app_id` + `search_api_key`
  - **Places_AlgoliaSync**: reads `app_id` + `write_api_key`
  - **Places_Submit**: reads Google + Anthropic keys
- DynamoDB permissions scoped to stack's own tables/indexes/streams

### CloudWatch Logs
- 14-day retention for all Lambda log groups

### AWS Budget
- Monthly cost alert (default $20 USD)
- Notifications at 80% actual, 100% forecasted

---

## Deployment

### Prerequisites
1. **AWS CLI** configured with a profile (default: `plungepalz-dev`)
2. **AWS SAM CLI** installed ([docs](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html))
3. **Python 3** and **pip3**
4. **Region**: Profile must be configured for `us-east-1`
5. **Credentials**: Valid AWS credentials with CloudFormation, Lambda, DynamoDB, IAM, API Gateway, SSM, and Budgets permissions

### Step 1: Set API Credentials

**Option A: From an env file** (recommended for repeatable deploys)

Create a local, uncommitted env file (e.g. `/home/user/secrets/backend.env`) with:

```bash
ALGOLIA_APP_ID=YOUR_APP_ID
ALGOLIA_SEARCH_API_KEY=YOUR_SEARCH_KEY
ALGOLIA_WRITE_API_KEY=YOUR_WRITE_KEY
GOOGLE_PLACES_API_KEY=YOUR_GOOGLE_KEY
ANTHROPIC_API_KEY=YOUR_ANTHROPIC_KEY
```

Then deploy with:

```bash
./deploy.sh --env-file /path/to/backend.env
```

The deploy script will:
1. Load variables from the env file
2. Write them to SSM Parameter Store (SecureString for keys, String for app ID)
3. Deploy the stack
4. Never echo secret values or log them

**Option B: Manual SSM parameter setup**

Run the interactive helper:

```bash
./setup-ssm-params.sh
```

It will prompt for each credential and write them to SSM (values are not echoed).

Then deploy without `--env-file`:

```bash
./deploy.sh
```

### Step 2: Deploy the Stack

```bash
# Standard deploy (non-interactive)
./deploy.sh

# Guided deploy (first-time setup)
./deploy.sh --guided

# Deploy with env file
./deploy.sh --env-file /path/to/secrets.env
```

The script will:
1. Validate AWS credentials and region (enforces us-east-1)
2. Check or write SSM parameters
3. Build Lambda layer dependencies with `pip install --platform manylinux2014_x86_64`
4. Validate the SAM template
5. Deploy via `sam deploy` with `--resolve-s3` (auto-creates artifact bucket)
6. Print stack outputs

**Environment Variables**:
- `AWS_PROFILE`: Override default profile (default: `plungepalz-dev`)

---

## Validation

### Template Validation

```bash
# SAM validate
sam validate --lint

# cfn-lint (if installed)
cfn-lint template.yaml
```

### Deploy Script Shellcheck

```bash
shellcheck deploy.sh setup-ssm-params.sh
```

---

## Testing

After deployment, test the API:

```bash
# Get API URL from outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name plungepalz-places-dev \
  --region us-east-1 \
  --profile plungepalz-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
  --output text)

# Test search endpoint
curl "$API_URL/search?lat=40.7608&lng=-111.8910&radius_km=10"

# Test get by ID (replace with real place_id)
curl "$API_URL/place/a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# View Lambda logs
aws logs tail /aws/lambda/Places_Search --follow --profile plungepalz-dev --region us-east-1
```

---

## Tear Down

To delete the entire stack and all resources:

```bash
# Delete the stack
aws cloudformation delete-stack \
  --stack-name plungepalz-places-dev \
  --region us-east-1 \
  --profile plungepalz-dev

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete \
  --stack-name plungepalz-places-dev \
  --region us-east-1 \
  --profile plungepalz-dev

# Optionally delete SSM parameters
aws ssm delete-parameters \
  --names \
    /plungepalz-places-dev/algolia/app_id \
    /plungepalz-places-dev/algolia/search_api_key \
    /plungepalz-places-dev/algolia/write_api_key \
    /plungepalz-places-dev/google/places_api_key \
    /plungepalz-places-dev/anthropic/api_key \
  --region us-east-1 \
  --profile plungepalz-dev

# Optionally delete SAM artifact bucket (if you want to clean up completely)
# List buckets starting with aws-sam-cli-managed-default-samclisourcebucket
aws s3 ls --profile plungepalz-dev | grep aws-sam-cli
# Then delete: aws s3 rb s3://BUCKET_NAME --force --profile plungepalz-dev
```

**Note**: DynamoDB tables are deleted when the stack is deleted (no retain policy). Back up any data before tear down.

---

## Cost Estimate

**Expected monthly cost** (light dev usage):

- **DynamoDB**: $0-5 (PAY_PER_REQUEST, free tier eligible)
- **Lambda**: $0-2 (free tier: 1M requests, 400k GB-seconds per month)
- **API Gateway**: $0-5 (free tier: 1M requests per month)
- **CloudWatch Logs**: <$1 (14-day retention)
- **SSM Parameters**: $0 (Standard parameters are free)
- **Data Transfer**: <$1

**Total**: ~$5-15/month for dev workloads

Adjust the `BudgetAmountUSD` parameter to set your alert threshold (default: $20).

---

## Architecture Notes

### Algolia Integration

**Approach**: SSM Parameter Store with least-privilege IAM

- **app_id**: Plain `String` parameter (not secret)
- **search_api_key**: `SecureString` (Places_Search reads it at runtime via `ssm:GetParameter`)
- **write_api_key**: `SecureString` (Places_AlgoliaSync reads it at runtime via `ssm:GetParameter`)

IAM roles are scoped per function:
- `Places_Search`: Can only read `app_id` + `search_api_key`
- `Places_AlgoliaSync`: Can only read `app_id` + `write_api_key`

**Runtime Pattern**: Lambda functions retrieve parameters at cold-start via `boto3.client('ssm').get_parameter()` with `WithDecryption=True`, then cache them in global scope for warm invocations.

**Security**: API keys never appear in CloudFormation outputs, stack parameters, or logs. The deploy script disables command tracing (`set +x`) when handling secrets.

### Why NOT CloudFormation NoEcho Parameters?

NoEcho parameters still appear in:
- Stack events (visible in console during deploy)
- Change sets
- Drift detection

SSM SecureString is the AWS-recommended approach for secrets in Lambda.

### Missing Handlers

The template references `backend/lambda_functions/Places_AlgoliaSync/` which does not yet exist. The Lambda resource will be created, but invocations will fail until Backend Bot implements the handler. This is intentional; the infrastructure is ready for the code.

---

## Files

- `template.yaml` — AWS SAM template (CloudFormation with Transform)
- `deploy.sh` — Deployment script with SSM parameter handling
- `setup-ssm-params.sh` — Interactive SSM parameter setup helper
- `README.md` — This file

---

## Troubleshooting

### Deploy fails with "Invalid parameter type"
- Ensure SAM CLI is up to date: `sam --version` (requires ≥1.40.0 for `AWS::Serverless::LayerVersion`)

### "No such file or directory: backend/lambda_functions/Places_AlgoliaSync"
- Expected. The Lambda resource is created, but the handler folder is missing. Backend Bot will implement it. The stack will still deploy successfully.

### "Access Denied" when reading SSM parameters at runtime
- Verify IAM role has `ssm:GetParameter` permission for the specific parameter ARN
- Check the parameter exists: `aws ssm get-parameter --name /plungepalz-places-dev/algolia/app_id`

### "Template format error" during validation
- Run `sam validate --lint` for detailed errors
- Ensure you're in the `backend/infrastructure/dev/` directory

### Budget notifications not received
- Verify email address in stack parameters
- Check spam folder; confirm subscription email from AWS Budgets

---

## Related Documentation

- [API Reference](../../docs/API_REFERENCE.md)
- [Data Schemas](../../docs/DATA_SCHEMAS.md)
- [Architecture Overview](../../docs/ARCHITECTURE.md)
- [AWS SAM Developer Guide](https://docs.aws.amazon.com/serverless-application-model/)

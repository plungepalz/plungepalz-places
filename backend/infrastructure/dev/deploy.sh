#!/usr/bin/env bash
#
# deploy.sh - Deploy PlungePalz Places Dev Infrastructure to AWS us-east-1
#
# Usage:
#   ./deploy.sh --env-file /path/to/secrets.env [--guided] [--yes]
#
# --env-file must contain (parsed by name only; the file is never sourced):
#   ALGOLIA_APP_ID
#   ALGOLIA_SEARCH_API_KEY
#   ALGOLIA_WRITE_API_KEY
#   GOOGLE_PLACES_API_KEY
#   ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY
#
# Secrets are passed as NoEcho CloudFormation parameters via a mode-600
# samconfig written under mktemp (outside the repo) and deleted on EXIT.
# They are never written to samconfig.toml in this directory, never echoed,
# and never passed as argv to `sam deploy --parameter-overrides`.
#
# Environment:
#   AWS_PROFILE     AWS CLI profile (default: plungepalz-dev)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STACK_NAME="plungepalz-places-dev"
ARTIFACTS_STACK_NAME="plungepalz-places-dev-artifacts"
REQUIRED_REGION="us-east-1"
DEFAULT_PROFILE="plungepalz-dev"

AWS_PROFILE="${AWS_PROFILE:-$DEFAULT_PROFILE}"
export AWS_PROFILE

GUIDED_MODE=0
ENV_FILE=""
YES_MODE=0
TMP_DEPLOY_DIR=""

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

cleanup() {
    if [[ -n "${TMP_DEPLOY_DIR:-}" && -d "${TMP_DEPLOY_DIR}" ]]; then
        rm -rf "${TMP_DEPLOY_DIR}"
    fi
}

trap cleanup EXIT

while [[ $# -gt 0 ]]; do
    case $1 in
        --guided)
            GUIDED_MODE=1
            shift
            ;;
        --env-file)
            ENV_FILE="${2:-}"
            shift 2
            ;;
        --yes)
            YES_MODE=1
            shift
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

check_dependencies() {
    log "Checking dependencies..."
    command -v aws >/dev/null 2>&1 || error "aws CLI not found. Install: https://aws.amazon.com/cli/"
    command -v sam >/dev/null 2>&1 || error "AWS SAM CLI not found. Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    command -v python3 >/dev/null 2>&1 || error "python3 not found"
}

check_region() {
    log "Validating AWS region..."
    local configured_region
    configured_region=$(aws configure get region --profile "$AWS_PROFILE" 2>/dev/null || echo "")

    if [[ -z "$configured_region" ]]; then
        error "No region configured for profile '$AWS_PROFILE'. Run: aws configure set region $REQUIRED_REGION --profile $AWS_PROFILE"
    fi

    if [[ "$configured_region" != "$REQUIRED_REGION" ]]; then
        error "Region mismatch: configured '$configured_region', but this stack MUST be deployed to '$REQUIRED_REGION'."
    fi

    log "Region verified: $REQUIRED_REGION"
}

validate_profile() {
    log "Validating AWS profile '$AWS_PROFILE'..."
    if ! ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text 2>/dev/null); then
        error "Failed to authenticate with profile '$AWS_PROFILE'. Check your credentials."
    fi
    export ACCOUNT_ID
    log "Authenticated as account: $ACCOUNT_ID"
}

create_artifacts_bucket() {
    local bucket_name="plungepalz-places-dev-artifacts-${ACCOUNT_ID}"

    log "Checking artifacts bucket..."

    if aws s3api head-bucket --bucket "$bucket_name" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null 2>&1; then
        log "Artifacts bucket exists: $bucket_name"
        printf '%s' "$bucket_name"
        return 0
    fi

    log "Creating artifacts stack: $ARTIFACTS_STACK_NAME"

    if ! aws cloudformation deploy \
        --template-file "$SCRIPT_DIR/artifacts.yaml" \
        --stack-name "$ARTIFACTS_STACK_NAME" \
        --parameter-overrides "BucketName=${bucket_name}" \
        --region "$REQUIRED_REGION" \
        --profile "$AWS_PROFILE" \
        --no-fail-on-empty-changeset >/dev/null; then
        error "Failed to create artifacts bucket stack"
    fi

    log "Artifacts bucket created: $bucket_name"
    printf '%s' "$bucket_name"
}

build_sam_template() {
    log "Building SAM template..."
    cd "$SCRIPT_DIR"
    rm -rf .aws-sam/build
    if ! sam build --region "$REQUIRED_REGION"; then
        error "SAM build failed"
    fi
    log "SAM build complete"
}

validate_template() {
    log "Validating SAM template..."
    cd "$SCRIPT_DIR"
    if ! sam validate --lint --region "$REQUIRED_REGION"; then
        error "Template validation failed"
    fi
    log "Template validation passed"
}

write_temp_samconfig() {
    local artifacts_bucket="$1"
    local dest_dir="$2"

    if [[ -z "$ENV_FILE" ]]; then
        error "--env-file is required so secrets can be passed as NoEcho stack parameters"
    fi
    if [[ ! -f "$ENV_FILE" ]]; then
        error "Env file not found: $ENV_FILE"
    fi

    log "Writing temporary deploy config (secrets not logged)"

    python3 - "$ENV_FILE" "$dest_dir/samconfig.toml" "$artifacts_bucket" <<'PY'
import json
import pathlib
import sys

env_path = pathlib.Path(sys.argv[1])
dest = pathlib.Path(sys.argv[2])
bucket = sys.argv[3]

wanted = {
    "ALGOLIA_APP_ID": "AlgoliaAppId",
    "ALGOLIA_SEARCH_API_KEY": "AlgoliaSearchApiKey",
    "ALGOLIA_WRITE_API_KEY": "AlgoliaWriteApiKey",
    "GOOGLE_PLACES_API_KEY": "GooglePlacesApiKey",
    "ANTHROPIC_PLUNGEPALZ_PLACES_AI_GENERATOR_API_KEY": "AnthropicApiKey",
}

def unquote(val: str) -> str:
    val = val.strip()
    if len(val) >= 2 and ((val[0] == val[-1] == '"') or (val[0] == val[-1] == "'")):
        return val[1:-1]
    return val

parsed: dict[str, str] = {}
for raw in env_path.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, val = line.partition("=")
    parsed[key.strip()] = unquote(val)

values: dict[str, str] = {}
for env_key, param_name in wanted.items():
    if parsed.get(env_key):
        values[param_name] = parsed[env_key]

# Non-secret model override: ANTHROPIC_MODEL, with legacy ANTHROPIC_MODEL_ID fallback
model = parsed.get("ANTHROPIC_MODEL") or parsed.get("ANTHROPIC_MODEL_ID")
if model:
    values["AnthropicModel"] = model

missing = [name for name in wanted.values() if not values.get(name)]
if missing:
    raise SystemExit("Missing required keys in env file (mapped params): " + ", ".join(missing))

overrides = " ".join(f"{key}={json.dumps(values[key])}" for key in values)
text = (
    "version = 0.1\n\n"
    "[default.deploy.parameters]\n"
    'stack_name = "plungepalz-places-dev"\n'
    'region = "us-east-1"\n'
    f"s3_bucket = {json.dumps(bucket)}\n"
    's3_prefix = "sam-artifacts"\n'
    'capabilities = "CAPABILITY_IAM"\n'
    "confirm_changeset = false\n"
    "fail_on_empty_changeset = false\n"
    'tags = "project=plungepalz-places env=dev"\n'
    f"parameter_overrides = {json.dumps(overrides)}\n"
)
dest.write_text(text, encoding="utf-8")
dest.chmod(0o600)
PY
}

deploy_stack() {
    log "Deploying stack '$STACK_NAME' to $REQUIRED_REGION..."
    cd "$SCRIPT_DIR"

    local artifacts_bucket
    artifacts_bucket=$(create_artifacts_bucket)

    TMP_DEPLOY_DIR=$(mktemp -d /tmp/plungepalz-places-dev-XXXXXX)
    chmod 700 "$TMP_DEPLOY_DIR"
    write_temp_samconfig "$artifacts_bucket" "$TMP_DEPLOY_DIR"

    local guided_flag=()
    if [[ "$GUIDED_MODE" -eq 1 ]]; then
        guided_flag=(--guided)
        log "Running in guided mode..."
    fi

    sam deploy \
        "${guided_flag[@]}" \
        --template-file "$SCRIPT_DIR/.aws-sam/build/template.yaml" \
        --config-file "$TMP_DEPLOY_DIR/samconfig.toml" \
        --config-env default \
        --profile "$AWS_PROFILE"

    log "Stack deployed successfully"
}

print_outputs() {
    log "Fetching stack outputs..."

    local outputs
    outputs=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REQUIRED_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'Stacks[0].Outputs' \
        --output table 2>/dev/null || echo "")

    if [[ -n "$outputs" ]]; then
        echo ""
        echo "=========================================="
        echo "Stack Outputs:"
        echo "=========================================="
        echo "$outputs"
        echo ""
    fi
}

main() {
    log "Starting PlungePalz Places Dev deployment"
    log "AWS Profile: $AWS_PROFILE"
    log "Target Region: $REQUIRED_REGION"
    log "Stack Name: $STACK_NAME"
    echo ""

    if [[ "$YES_MODE" -eq 1 ]]; then
        log "Non-interactive mode (--yes); --env-file is still required"
    fi

    if [[ -z "$ENV_FILE" ]]; then
        if [[ -t 0 ]]; then
            error "--env-file is required. Example: ./deploy.sh --env-file /path/to/secrets.env"
        fi
        error "--env-file is required and this is not a TTY"
    fi

    check_dependencies
    validate_profile
    check_region
    build_sam_template
    validate_template
    deploy_stack
    print_outputs

    echo ""
    log "Deployment complete"
    log "Post-deploy: python backend/scripts/algolia_index_settings.py"
    log "CORS check: curl -sD - -o /dev/null -H 'Origin: http://localhost:3000' \"\$API_URL/search\""
}

main

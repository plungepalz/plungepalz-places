#!/usr/bin/env bash
#
# deploy.sh - Deploy PlungePalz Places Dev Infrastructure to AWS us-east-1
#
# Usage:
#   ./deploy.sh [OPTIONS]
#
# Options:
#   --guided            Run SAM deploy in guided mode (interactive)
#   --env-file PATH     Path to env file with Algolia/Google credentials
#   --yes               Skip confirmation prompts (for non-interactive runs)
#
# Environment Variables:
#   AWS_PROFILE     AWS CLI profile (default: plungepalz-dev)
#

set -euo pipefail

# ==============================================================
# Configuration
# ==============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STACK_NAME="plungepalz-places-dev"
ARTIFACTS_STACK_NAME="plungepalz-places-dev-artifacts"
REQUIRED_REGION="us-east-1"
DEFAULT_PROFILE="plungepalz-dev"

# Use AWS_PROFILE from environment, or default
AWS_PROFILE="${AWS_PROFILE:-$DEFAULT_PROFILE}"
export AWS_PROFILE

# Parse command-line arguments
GUIDED_MODE=0
ENV_FILE=""
YES_MODE=0

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --guided)
            GUIDED_MODE=1
            shift
            ;;
        --env-file)
            ENV_FILE="$2"
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

# ==============================================================
# Functions
# ==============================================================

check_dependencies() {
    log "Checking dependencies..."
    command -v aws >/dev/null 2>&1 || error "aws CLI not found. Install: https://aws.amazon.com/cli/"
    command -v sam >/dev/null 2>&1 || error "AWS SAM CLI not found. Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    command -v python3 >/dev/null 2>&1 || error "python3 not found"
}

check_region() {
    log "Validating AWS region..."
    CONFIGURED_REGION=$(aws configure get region --profile "$AWS_PROFILE" 2>/dev/null || echo "")
    
    if [[ -z "$CONFIGURED_REGION" ]]; then
        error "No region configured for profile '$AWS_PROFILE'. Run: aws configure set region $REQUIRED_REGION --profile $AWS_PROFILE"
    fi
    
    if [[ "$CONFIGURED_REGION" != "$REQUIRED_REGION" ]]; then
        error "Region mismatch: configured '$CONFIGURED_REGION', but this stack MUST be deployed to '$REQUIRED_REGION'. Update with: aws configure set region $REQUIRED_REGION --profile $AWS_PROFILE"
    fi
    
    log "✓ Region verified: $REQUIRED_REGION"
}

validate_profile() {
    log "Validating AWS profile '$AWS_PROFILE'..."
    if ! ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text 2>/dev/null); then
        error "Failed to authenticate with profile '$AWS_PROFILE'. Check your credentials."
    fi
    export ACCOUNT_ID
    log "✓ Authenticated as account: $ACCOUNT_ID"
}

create_artifacts_bucket() {
    local bucket_name="plungepalz-places-dev-artifacts-${ACCOUNT_ID}"
    
    log "Checking artifacts bucket..."
    
    if aws s3 ls "s3://${bucket_name}" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null 2>&1; then
        log "✓ Artifacts bucket exists: $bucket_name"
        echo "$bucket_name"
        return 0
    fi
    
    log "Creating artifacts stack: $ARTIFACTS_STACK_NAME"
    
    local template_body
    template_body=$(cat <<'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: PlungePalz Places Dev - SAM Artifacts Bucket
Parameters:
  BucketName:
    Type: String
Resources:
  ArtifactsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref BucketName
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      LifecycleConfiguration:
        Rules:
          - Id: DeleteOldArtifacts
            Status: Enabled
            ExpirationInDays: 30
      Tags:
        - Key: project
          Value: plungepalz-places
        - Key: env
          Value: dev
Outputs:
  BucketName:
    Value: !Ref ArtifactsBucket
EOF
)
    
    if ! aws cloudformation deploy \
        --template-body "$template_body" \
        --stack-name "$ARTIFACTS_STACK_NAME" \
        --parameter-overrides "BucketName=${bucket_name}" \
        --region "$REQUIRED_REGION" \
        --profile "$AWS_PROFILE" \
        --no-fail-on-empty-changeset >/dev/null 2>&1; then
        error "Failed to create artifacts bucket stack"
    fi
    
    log "✓ Artifacts bucket created: $bucket_name"
    echo "$bucket_name"
}

build_sam_template() {
    log "Building SAM template..."
    cd "$SCRIPT_DIR"
    
    # Clean build directory
    rm -rf .aws-sam/build
    
    # Build with SAM (includes layer dependencies)
    if ! sam build --profile "$AWS_PROFILE" 2>&1 | grep -v "^$"; then
        error "SAM build failed"
    fi
    
    log "✓ SAM build complete"
}

validate_template() {
    log "Validating SAM template..."
    cd "$SCRIPT_DIR"
    
    # Validate built template
    if ! sam validate --lint --profile "$AWS_PROFILE" 2>&1; then
        error "Template validation failed"
    fi
    
    log "✓ Template validation passed"
}

parse_env_file() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        error "Env file not found: $env_file"
    fi
    
    log "Parsing environment file: $env_file"
    
    # Parse only specific variables (don't source entire file)
    ALGOLIA_APP_ID=$(grep -E '^ALGOLIA_APP_ID=' "$env_file" | cut -d= -f2- | tr -d '"' || echo "")
    ALGOLIA_SEARCH_API_KEY=$(grep -E '^ALGOLIA_SEARCH_API_KEY=' "$env_file" | cut -d= -f2- | tr -d '"' || echo "")
    ALGOLIA_WRITE_API_KEY=$(grep -E '^ALGOLIA_WRITE_API_KEY=' "$env_file" | cut -d= -f2- | tr -d '"' || echo "")
    ANTHROPIC_MODEL_ID=$(grep -E '^ANTHROPIC_MODEL_ID=' "$env_file" | cut -d= -f2- | tr -d '"' || echo "")
    
    # Validate required variables
    [[ -z "$ALGOLIA_APP_ID" ]] && error "ALGOLIA_APP_ID not found in $env_file"
    [[ -z "$ALGOLIA_SEARCH_API_KEY" ]] && error "ALGOLIA_SEARCH_API_KEY not found in $env_file"
    [[ -z "$ALGOLIA_WRITE_API_KEY" ]] && error "ALGOLIA_WRITE_API_KEY not found in $env_file"
    
    log "✓ Required variables parsed from env file"
}

write_ssm_parameters() {
    log "Writing SSM parameters (SecureString for API keys)..."
    
    # Create temp file with mode 600 for secure parameter passing
    local temp_file
    temp_file=$(mktemp)
    chmod 600 "$temp_file"
    trap 'rm -f "$temp_file"' EXIT
    
    # Write app_id (String)
    printf '{"Name":"/plungepalz-places-dev/algolia/app_id","Type":"String","Value":"%s","Overwrite":true}' "$ALGOLIA_APP_ID" > "$temp_file"
    if ! aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null 2>&1; then
        error "Failed to write /plungepalz-places-dev/algolia/app_id"
    fi
    
    # Write search_api_key (SecureString)
    printf '{"Name":"/plungepalz-places-dev/algolia/search_api_key","Type":"SecureString","Value":"%s","Overwrite":true}' "$ALGOLIA_SEARCH_API_KEY" > "$temp_file"
    if ! aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null 2>&1; then
        error "Failed to write /plungepalz-places-dev/algolia/search_api_key"
    fi
    
    # Write write_api_key (SecureString)
    printf '{"Name":"/plungepalz-places-dev/algolia/write_api_key","Type":"SecureString","Value":"%s","Overwrite":true}' "$ALGOLIA_WRITE_API_KEY" > "$temp_file"
    if ! aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null 2>&1; then
        error "Failed to write /plungepalz-places-dev/algolia/write_api_key"
    fi
    
    # Write google/places_api_key if exists (SecureString)
    if [[ -n "${GOOGLE_PLACES_API_KEY:-}" ]]; then
        printf '{"Name":"/plungepalz-places-dev/google/places_api_key","Type":"SecureString","Value":"%s","Overwrite":true}' "$GOOGLE_PLACES_API_KEY" > "$temp_file"
        if ! aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null 2>&1; then
            log "⚠ Warning: Failed to write /plungepalz-places-dev/google/places_api_key"
        fi
    fi
    
    rm -f "$temp_file"
    log "✓ SSM parameters written successfully (values not logged)"
}

check_ssm_parameters() {
    log "Checking SSM parameters..."
    
    local ssm_params=(
        "/plungepalz-places-dev/algolia/app_id"
        "/plungepalz-places-dev/algolia/search_api_key"
        "/plungepalz-places-dev/algolia/write_api_key"
    )
    
    local missing_params=()
    for param in "${ssm_params[@]}"; do
        if ! aws ssm get-parameter --name "$param" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null 2>&1; then
            missing_params+=("$param")
        fi
    done
    
    if [[ ${#missing_params[@]} -gt 0 ]]; then
        log "⚠ WARNING: The following SSM parameters are missing:"
        for param in "${missing_params[@]}"; do
            log "  - $param"
        done
        log ""
        log "Lambdas requiring these parameters will fail at runtime."
        log "Set them with: ./deploy.sh --env-file /path/to/secrets.env"
        log "Or manually with: ./setup-ssm-params.sh"
        log ""
        
        if [[ "$YES_MODE" -eq 0 ]]; then
            if [[ -t 0 ]]; then
                read -r -p "Continue deployment anyway? [y/N] " reply
                if [[ ! $reply =~ ^[Yy]$ ]]; then
                    error "Deployment cancelled"
                fi
            else
                error "Missing SSM parameters and not running interactively (use --yes to override)"
            fi
        fi
    else
        log "✓ All required SSM parameters exist"
    fi
}

deploy_stack() {
    log "Deploying stack '$STACK_NAME' to $REQUIRED_REGION..."
    cd "$SCRIPT_DIR"
    
    local artifacts_bucket
    artifacts_bucket=$(create_artifacts_bucket)
    
    local guided_flag=""
    if [[ "$GUIDED_MODE" -eq 1 ]]; then
        guided_flag="--guided"
        log "Running in guided mode..."
    fi
    
    # Build parameter overrides
    local param_overrides=""
    if [[ -n "${ANTHROPIC_MODEL_ID:-}" ]]; then
        param_overrides="AnthropicModelId=$ANTHROPIC_MODEL_ID"
    fi
    
    local param_flag=""
    if [[ -n "$param_overrides" ]]; then
        param_flag="--parameter-overrides $param_overrides"
    fi
    
    # Deploy built template with SAM
    # shellcheck disable=SC2086
    sam deploy \
        $guided_flag \
        --template-file .aws-sam/build/template.yaml \
        --stack-name "$STACK_NAME" \
        --region "$REQUIRED_REGION" \
        --s3-bucket "$artifacts_bucket" \
        --s3-prefix "sam-artifacts" \
        --capabilities CAPABILITY_IAM \
        --no-fail-on-empty-changeset \
        --tags "project=plungepalz-places" "env=dev" \
        --profile "$AWS_PROFILE" \
        $param_flag
    
    log "✓ Stack deployed successfully"
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
    
    local api_url
    api_url=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REQUIRED_REGION" \
        --profile "$AWS_PROFILE" \
        --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$api_url" ]]; then
        log "API Base URL: $api_url"
    fi
}

# ==============================================================
# Main
# ==============================================================

main() {
    log "Starting PlungePalz Places Dev deployment"
    log "AWS Profile: $AWS_PROFILE"
    log "Target Region: $REQUIRED_REGION"
    log "Stack Name: $STACK_NAME"
    echo ""
    
    check_dependencies
    validate_profile
    check_region
    
    # If env file provided, parse and write SSM parameters
    if [[ -n "$ENV_FILE" ]]; then
        parse_env_file "$ENV_FILE"
        write_ssm_parameters
    else
        check_ssm_parameters
    fi
    
    build_sam_template
    validate_template
    deploy_stack
    print_outputs
    
    echo ""
    log "=========================================="
    log "Deployment complete!"
    log "=========================================="
    log ""
    log "Next steps:"
    if [[ -z "$ENV_FILE" ]]; then
        log "  1. Set SSM parameter values: ./deploy.sh --env-file /path/to/secrets.env"
        log "     OR manually with: ./setup-ssm-params.sh"
    fi
    log "  2. Test endpoints: curl \$API_URL/search"
    log "  3. View logs: aws logs tail /aws/lambda/Places_Search --follow --profile $AWS_PROFILE"
    log ""
}

# Run main
main

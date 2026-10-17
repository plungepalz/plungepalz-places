#!/usr/bin/env bash
#
# deploy.sh - Deploy PlungePalz Places Dev Infrastructure to AWS us-east-1
#
# Usage:
#   ./deploy.sh [--guided] [--env-file PATH]
#
# Options:
#   --guided            Run SAM deploy in guided mode (interactive)
#   --env-file PATH     Path to env file with Algolia/Google/Anthropic credentials
#                       Expected variables: ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY,
#                       ALGOLIA_WRITE_API_KEY, GOOGLE_PLACES_API_KEY, ANTHROPIC_API_KEY
#
# Environment Variables:
#   AWS_PROFILE     AWS CLI profile (default: plungepalz-dev)
#

set -euo pipefail

# ==============================================================
# Configuration
# ==============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LAYER_SOURCE="$BACKEND_ROOT/lambda_layers/generate_place_with_ai"
LAYER_BUILD="$SCRIPT_DIR/.aws-sam/build/GeneratePlaceWithAILayer"

STACK_NAME="plungepalz-places-dev"
REQUIRED_REGION="us-east-1"
DEFAULT_PROFILE="plungepalz-dev"
PYTHON_VERSION="3.13"

# Use AWS_PROFILE from environment, or default
AWS_PROFILE="${AWS_PROFILE:-$DEFAULT_PROFILE}"
export AWS_PROFILE

# Parse command-line arguments
GUIDED_MODE=0
ENV_FILE=""

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
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# ==============================================================
# Functions
# ==============================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

check_dependencies() {
    log "Checking dependencies..."
    command -v aws >/dev/null 2>&1 || error "aws CLI not found. Install: https://aws.amazon.com/cli/"
    command -v sam >/dev/null 2>&1 || error "AWS SAM CLI not found. Install: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
    command -v python3 >/dev/null 2>&1 || error "python3 not found"
    command -v pip3 >/dev/null 2>&1 || error "pip3 not found"
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
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null 2>&1; then
        error "Failed to authenticate with profile '$AWS_PROFILE'. Check your credentials."
    fi
    ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)
    log "✓ Authenticated as account: $ACCOUNT_ID"
}

build_layer_dependencies() {
    log "Building Lambda layer dependencies..."
    
    if [[ ! -f "$LAYER_SOURCE/requirements.txt" ]]; then
        error "Layer requirements.txt not found at: $LAYER_SOURCE/requirements.txt"
    fi
    
    # Create build directory
    mkdir -p "$LAYER_BUILD/python"
    
    # Install dependencies with manylinux2014_x86_64 platform for Lambda compatibility
    log "Installing dependencies from $LAYER_SOURCE/requirements.txt"
    pip3 install \
        --platform manylinux2014_x86_64 \
        --only-binary=:all: \
        --python-version "$PYTHON_VERSION" \
        --implementation cp \
        --target "$LAYER_BUILD/python" \
        --upgrade \
        -r "$LAYER_SOURCE/requirements.txt"
    
    # Copy layer source code
    if [[ -d "$LAYER_SOURCE/python" ]]; then
        log "Copying layer source code..."
        cp -r "$LAYER_SOURCE/python/"* "$LAYER_BUILD/python/"
    fi
    
    log "✓ Layer dependencies built"
}

validate_template() {
    log "Validating SAM template..."
    cd "$SCRIPT_DIR"
    
    # Basic SAM validation
    if ! sam validate --lint 2>&1; then
        error "Template validation failed"
    fi
    
    log "✓ Template validation passed"
}

load_env_file() {
    local env_file="$1"
    
    if [[ ! -f "$env_file" ]]; then
        error "Env file not found: $env_file"
    fi
    
    log "Loading environment variables from: $env_file"
    
    # Source the file to load variables
    # shellcheck disable=SC1090
    set -a
    source "$env_file"
    set +a
    
    # Validate required variables are set
    local required_vars=(
        "ALGOLIA_APP_ID"
        "ALGOLIA_SEARCH_API_KEY"
        "ALGOLIA_WRITE_API_KEY"
        "GOOGLE_PLACES_API_KEY"
        "ANTHROPIC_API_KEY"
    )
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            error "Required variable '$var' not found in $env_file"
        fi
    done
    
    log "✓ All required variables loaded from env file"
}

write_ssm_parameters() {
    log "Writing SSM parameters (SecureString for API keys)..."
    
    # Disable command tracing to prevent leaking secrets
    { set +x; } 2>/dev/null
    
    local params=(
        "/plungepalz-places-dev/algolia/app_id:String:$ALGOLIA_APP_ID"
        "/plungepalz-places-dev/algolia/search_api_key:SecureString:$ALGOLIA_SEARCH_API_KEY"
        "/plungepalz-places-dev/algolia/write_api_key:SecureString:$ALGOLIA_WRITE_API_KEY"
        "/plungepalz-places-dev/google/places_api_key:SecureString:$GOOGLE_PLACES_API_KEY"
        "/plungepalz-places-dev/anthropic/api_key:SecureString:$ANTHROPIC_API_KEY"
    )
    
    for param_spec in "${params[@]}"; do
        IFS=':' read -r param_name param_type param_value <<< "$param_spec"
        
        log "  Writing $param_name (type: $param_type)..."
        
        if ! aws ssm put-parameter \
            --name "$param_name" \
            --type "$param_type" \
            --value "$param_value" \
            --overwrite \
            --profile "$AWS_PROFILE" \
            --region "$REQUIRED_REGION" \
            >/dev/null 2>&1; then
            error "Failed to write SSM parameter: $param_name"
        fi
    done
    
    log "✓ All SSM parameters written successfully (values not logged)"
}

check_ssm_parameters() {
    log "Checking SSM parameters..."
    
    local ssm_params=(
        "/plungepalz-places-dev/algolia/app_id"
        "/plungepalz-places-dev/algolia/search_api_key"
        "/plungepalz-places-dev/algolia/write_api_key"
        "/plungepalz-places-dev/google/places_api_key"
        "/plungepalz-places-dev/anthropic/api_key"
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
        
        if [[ "$GUIDED_MODE" -eq 0 ]]; then
            read -p "Continue deployment anyway? [y/N] " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                error "Deployment cancelled"
            fi
        fi
    else
        log "✓ All SSM parameters exist"
    fi
}

deploy_stack() {
    log "Deploying stack '$STACK_NAME' to $REQUIRED_REGION..."
    cd "$SCRIPT_DIR"
    
    local guided_flag=""
    if [[ "$GUIDED_MODE" -eq 1 ]]; then
        guided_flag="--guided"
        log "Running in guided mode..."
    fi
    
    # Deploy with SAM
    # shellcheck disable=SC2086
    sam deploy \
        $guided_flag \
        --stack-name "$STACK_NAME" \
        --region "$REQUIRED_REGION" \
        --capabilities CAPABILITY_NAMED_IAM \
        --resolve-s3 \
        --no-fail-on-empty-changeset \
        --tags "project=plungepalz-places" "env=dev" \
        --profile "$AWS_PROFILE"
    
    log "✓ Stack deployed successfully"
}

print_outputs() {
    log "Fetching stack outputs..."
    
    OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REQUIRED_REGION" \
        --profile "$AWS_PROFILE" \
        --query 'Stacks[0].Outputs' \
        --output table 2>/dev/null || echo "")
    
    if [[ -n "$OUTPUTS" ]]; then
        echo ""
        echo "=========================================="
        echo "Stack Outputs:"
        echo "=========================================="
        echo "$OUTPUTS"
        echo ""
    fi
    
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REQUIRED_REGION" \
        --profile "$AWS_PROFILE" \
        --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" \
        --output text 2>/dev/null || echo "")
    
    if [[ -n "$API_URL" ]]; then
        log "API Base URL: $API_URL"
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
    
    # If env file provided, load and write SSM parameters
    if [[ -n "$ENV_FILE" ]]; then
        load_env_file "$ENV_FILE"
        write_ssm_parameters
    else
        check_ssm_parameters
    fi
    
    build_layer_dependencies
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

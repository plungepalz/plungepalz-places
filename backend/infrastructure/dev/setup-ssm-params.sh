#!/usr/bin/env bash
#
# setup-ssm-params.sh - Manually set SSM parameters for PlungePalz Places Dev
#
# Usage:
#   ./setup-ssm-params.sh
#
# This script interactively prompts for API keys and writes them to SSM Parameter Store.
# API keys are stored as SecureString and never echoed to the terminal.
#

set -euo pipefail

REQUIRED_REGION="us-east-1"
DEFAULT_PROFILE="plungepalz-dev"
AWS_PROFILE="${AWS_PROFILE:-$DEFAULT_PROFILE}"
export AWS_PROFILE

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

# Validate AWS credentials
log "Validating AWS profile '$AWS_PROFILE'..."
if ! aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null 2>&1; then
    error "Failed to authenticate with profile '$AWS_PROFILE'. Check your credentials."
fi

log "✓ Authenticated to AWS"
echo ""

# Prompt for each parameter
echo "Enter API credentials (values will not be echoed):"
echo ""

read -p "Algolia App ID: " ALGOLIA_APP_ID
read -s -p "Algolia Search API Key (read-only): " ALGOLIA_SEARCH_API_KEY
echo ""
read -s -p "Algolia Write API Key: " ALGOLIA_WRITE_API_KEY
echo ""
read -s -p "Google Places API Key: " GOOGLE_PLACES_API_KEY
echo ""
read -s -p "Anthropic API Key: " ANTHROPIC_API_KEY
echo ""
echo ""

# Confirm before writing
log "Ready to write 5 parameters to SSM in $REQUIRED_REGION"
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    error "Cancelled"
fi

log "Writing SSM parameters..."

# Write parameters (disable tracing to prevent leaking secrets)
{ set +x; } 2>/dev/null

aws ssm put-parameter \
    --name "/plungepalz-places-dev/algolia/app_id" \
    --type "String" \
    --value "$ALGOLIA_APP_ID" \
    --overwrite \
    --profile "$AWS_PROFILE" \
    --region "$REQUIRED_REGION" \
    >/dev/null

aws ssm put-parameter \
    --name "/plungepalz-places-dev/algolia/search_api_key" \
    --type "SecureString" \
    --value "$ALGOLIA_SEARCH_API_KEY" \
    --overwrite \
    --profile "$AWS_PROFILE" \
    --region "$REQUIRED_REGION" \
    >/dev/null

aws ssm put-parameter \
    --name "/plungepalz-places-dev/algolia/write_api_key" \
    --type "SecureString" \
    --value "$ALGOLIA_WRITE_API_KEY" \
    --overwrite \
    --profile "$AWS_PROFILE" \
    --region "$REQUIRED_REGION" \
    >/dev/null

aws ssm put-parameter \
    --name "/plungepalz-places-dev/google/places_api_key" \
    --type "SecureString" \
    --value "$GOOGLE_PLACES_API_KEY" \
    --overwrite \
    --profile "$AWS_PROFILE" \
    --region "$REQUIRED_REGION" \
    >/dev/null

aws ssm put-parameter \
    --name "/plungepalz-places-dev/anthropic/api_key" \
    --type "SecureString" \
    --value "$ANTHROPIC_API_KEY" \
    --overwrite \
    --profile "$AWS_PROFILE" \
    --region "$REQUIRED_REGION" \
    >/dev/null

log "✓ All parameters written successfully"
log ""
log "To verify (app_id only):"
log "  aws ssm get-parameter --name /plungepalz-places-dev/algolia/app_id --profile $AWS_PROFILE --region $REQUIRED_REGION"
log ""
log "To retrieve secrets (decrypted):"
log "  aws ssm get-parameter --name /plungepalz-places-dev/algolia/search_api_key --with-decryption --profile $AWS_PROFILE --region $REQUIRED_REGION"

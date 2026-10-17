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
if ! ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text 2>/dev/null); then
    error "Failed to authenticate with profile '$AWS_PROFILE'. Check your credentials."
fi

log "✓ Authenticated to AWS (account: $ACCOUNT_ID)"
echo ""

# Prompt for each parameter
echo "Enter API credentials (secret values will not be echoed):"
echo ""

read -r -p "Algolia App ID: " ALGOLIA_APP_ID
[[ -z "$ALGOLIA_APP_ID" ]] && error "Algolia App ID cannot be empty"

read -r -s -p "Algolia Search API Key (read-only): " ALGOLIA_SEARCH_API_KEY
echo ""
[[ -z "$ALGOLIA_SEARCH_API_KEY" ]] && error "Algolia Search API Key cannot be empty"

read -r -s -p "Algolia Write API Key: " ALGOLIA_WRITE_API_KEY
echo ""
[[ -z "$ALGOLIA_WRITE_API_KEY" ]] && error "Algolia Write API Key cannot be empty"

read -r -s -p "Google Places API Key (optional, press Enter to skip): " GOOGLE_PLACES_API_KEY
echo ""

echo ""

# Confirm before writing
log "Ready to write SSM parameters to $REQUIRED_REGION"
read -r -p "Continue? [y/N] " reply
if [[ ! $reply =~ ^[Yy]$ ]]; then
    error "Cancelled"
fi

log "Writing SSM parameters..."

# Create temp file with mode 600 for secure parameter passing
temp_file=$(mktemp)
chmod 600 "$temp_file"
trap 'rm -f "$temp_file"' EXIT

# Write parameters (disable tracing to prevent leaking secrets)
{ set +x; } 2>/dev/null

# app_id (String)
printf '{"Name":"/plungepalz-places-dev/algolia/app_id","Type":"String","Value":"%s","Overwrite":true}' "$ALGOLIA_APP_ID" > "$temp_file"
aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null

# search_api_key (SecureString)
printf '{"Name":"/plungepalz-places-dev/algolia/search_api_key","Type":"SecureString","Value":"%s","Overwrite":true}' "$ALGOLIA_SEARCH_API_KEY" > "$temp_file"
aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null

# write_api_key (SecureString)
printf '{"Name":"/plungepalz-places-dev/algolia/write_api_key","Type":"SecureString","Value":"%s","Overwrite":true}' "$ALGOLIA_WRITE_API_KEY" > "$temp_file"
aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null

# google/places_api_key (SecureString, optional)
if [[ -n "$GOOGLE_PLACES_API_KEY" ]]; then
    printf '{"Name":"/plungepalz-places-dev/google/places_api_key","Type":"SecureString","Value":"%s","Overwrite":true}' "$GOOGLE_PLACES_API_KEY" > "$temp_file"
    aws ssm put-parameter --cli-input-json "file://$temp_file" --profile "$AWS_PROFILE" --region "$REQUIRED_REGION" >/dev/null
fi

rm -f "$temp_file"

log "✓ All parameters written successfully (values not logged)"
log ""
log "To verify (app_id only):"
log "  aws ssm get-parameter --name /plungepalz-places-dev/algolia/app_id --profile $AWS_PROFILE --region $REQUIRED_REGION"
log ""
log "To retrieve secrets (decrypted):"
log "  aws ssm get-parameter --name /plungepalz-places-dev/algolia/search_api_key --with-decryption --profile $AWS_PROFILE --region $REQUIRED_REGION"

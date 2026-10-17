# PlungePalz Places API — Testing

Testing conventions are defined in [`.cursorrules`](../.cursorrules). Summary:

## Structure

- **Test folders:** `tests/{LambdaName}/Test_XXX/`
- **Example:** `tests/Places_SubmitAIAutofill/Test_001/`

Each Test_XXX contains:
- `testing_instructions.md` — steps, datasets, what to verify
- `event.json` — API Gateway event (for local invoke)
- `dynamodb_fixture.json` — seeded DynamoDB data (when applicable)
- CloudWatch logs (upload after AWS runs for AI review)

## Local Testing (No Deploy)

```bash
cd plungepalz-places-backend
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001                    # Mocked
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001 --live              # Real Google + Anthropic API
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001 --live --agent-sdk   # Agent SDK (WebFetch/WebSearch)
```

For `--agent-sdk`: install `pip install -r layers/generate_place_with_ai/requirements-agent-sdk.txt` first.

## Workflow

1. Run local invoke to validate
2. Deploy to AWS when satisfied
3. Test via Postman against deployed API
4. Upload CloudWatch logs to Test_XXX → AI reviews → iterates → create Test_002 for next run

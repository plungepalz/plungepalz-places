# PlungePalz Places API — Testing

Testing conventions are defined in [`.cursorrules`](../.cursorrules). Summary:

## Automated Tests (pytest)

Run the test suite (from `backend/`):

```bash
cd backend
pip install -r requirements-dev.txt
pytest tests
```

Dev deps include `pytest`, `h3`, `moto[dynamodb]`, `boto3`, and `algoliasearch`. Tests mock DynamoDB (moto) and Algolia (in-memory fake index); they do not use the network. Nothing should be skipped once `requirements-dev.txt` is installed.

To load verified real places into a deployed API (no AI calls), see [scripts/README.md](../scripts/README.md) for `seed_places.py` and `review_place.py --from-file`.

## Manual Test Structure

- **Test folders:** `tests/{LambdaName}/Test_XXX/`
- **Example:** `tests/Places_SubmitAIAutofill/Test_001/`

Each Test_XXX contains:
- `testing_instructions.md` — steps, datasets, what to verify
- `event.json` — API Gateway event (for local invoke)
- `dynamodb_fixture.json` — seeded DynamoDB data (when applicable)
- CloudWatch logs (upload after AWS runs for AI review)

## Local Testing (No Deploy)

```bash
cd backend
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001                    # Mocked
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001 --live              # Real Google + Anthropic API
python scripts/local_invoke.py Places_SubmitAIAutofill Test_001 --live --agent-sdk   # Agent SDK (WebFetch/WebSearch)
```

For `--agent-sdk`: install `pip install -r lambda_layers/generate_place_with_ai/requirements-agent-sdk.txt` first.

## Workflow

1. Run local invoke to validate
2. Deploy to AWS when satisfied
3. Test via Postman against deployed API
4. Upload CloudWatch logs to Test_XXX → AI reviews → iterates → create Test_002 for next run

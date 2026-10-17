# SAM copies this Makefile into ARTIFACTS_DIR and may not have git metadata.
# Walk up from ARTIFACTS_DIR to find backend/lambda_layers/generate_place_with_ai.
LAYER_SRC := $(shell python3 -c "import pathlib,sys; start=pathlib.Path('$(ARTIFACTS_DIR)').resolve(); \
cands=[start,*start.parents]; \
hits=[p/'backend/lambda_layers/generate_place_with_ai' for p in cands if (p/'backend/lambda_layers/generate_place_with_ai/requirements.txt').is_file()]; \
sys.exit('layer source not found from '+str(start)) if not hits else print(hits[0])")

build-GeneratePlaceWithAILayer:
	mkdir -p "$(ARTIFACTS_DIR)/python"
	python3.13 -m pip install \
		--disable-pip-version-check \
		-r "$(LAYER_SRC)/requirements.txt" \
		-t "$(ARTIFACTS_DIR)/python"
	cp -a "$(LAYER_SRC)/python/generate_place_with_ai" "$(ARTIFACTS_DIR)/python/"

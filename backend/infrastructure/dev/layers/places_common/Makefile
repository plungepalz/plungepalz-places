# Copy python/places_common into ARTIFACTS_DIR so the layer root is /opt/python.
LAYER_SRC := $(shell python3 -c "import pathlib,sys; start=pathlib.Path('$(ARTIFACTS_DIR)').resolve(); \
cands=[start,*start.parents]; \
hits=[p/'backend/lambda_layers/places_common' for p in cands if (p/'backend/lambda_layers/places_common/python/places_common/__init__.py').is_file()]; \
sys.exit('places_common source not found from '+str(start)) if not hits else print(hits[0])")

build-PlacesCommonLayer:
	mkdir -p "$(ARTIFACTS_DIR)"
	cp -a "$(LAYER_SRC)/python" "$(ARTIFACTS_DIR)/"

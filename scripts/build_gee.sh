#!/usr/bin/env bash
# build_gee.sh — compile the GEE engine (gee_src/engine.ts) into a self-contained
# CommonJS bundle at api/_gee_engine.js with @google/earthengine inlined, so the
# Vercel functions need no node_modules at runtime.
# Source of truth: gee_src/ (ported 1:1 from the Basira graduation project).
set -euo pipefail
cd "$(dirname "$0")/.."

npx esbuild gee_src/engine.ts --bundle --platform=node --format=cjs --target=node22 \
  --outfile=api/_gee_engine.js --log-level=error
echo "bundled api/_gee_engine.js: $(wc -c < api/_gee_engine.js) bytes"
node -e "
const E = require('./api/_gee_engine.js');
const need = ['runClassification','compareAll','buildScene','ndviPointSeries','getEE','isGEEConfigured','GEEError','resolvePeriod','signatureSeason','mlpTrain','mlpPredict','mlpConfusion','CLASSES','SIGNATURES','SIG_FEATURES','SIG_SCALES','makeAoi','aoiGeoAreaM2'];
const missing = need.filter((k) => !(k in E));
if (missing.length) { console.error('MISSING EXPORTS:', missing); process.exit(1); }
console.log('bundle exports OK:', need.length, 'symbols | configured:', E.isGEEConfigured());
"

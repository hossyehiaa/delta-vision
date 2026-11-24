#!/usr/bin/env bash
# build_gee.sh — compile the GEE engine (gee_src/engine.ts) into a self-contained
# CommonJS bundle at engine/_gee_engine.js with @google/earthengine inlined, so the
# Vercel functions need no node_modules at runtime. The bundle lives OUTSIDE api/
# so the platform never collects it as a function; api/gee/*.js require it relatively.
# Source of truth: gee_src/ (ported 1:1 from the Basira graduation project).
set -euo pipefail
cd "$(dirname "$0")/.."

npx esbuild gee_src/engine.ts --bundle --platform=node --format=cjs --target=node22 \
  --outfile=engine/_gee_engine.js --log-level=error
# minified twin (8 MB vs 18 MB): what the Vercel deployment ships — the CLI
# upload protocol handles either, the minified one builds/deploys faster
npx esbuild gee_src/engine.ts --bundle --platform=node --format=cjs --target=node22 --minify \
  --outfile=engine/_gee_engine.min.js --log-level=error
mkdir -p engine
echo "bundled engine/_gee_engine.js: $(wc -c < engine/_gee_engine.js) bytes"
node -e "
const E = require('./engine/_gee_engine.js');
const need = ['runClassification','compareAll','buildScene','ndviPointSeries','getEE','isGEEConfigured','GEEError','resolvePeriod','detectSeasonFamily','seasonFamilyOf','runFamily','mlpTrain','mlpPredict','mlpConfusion','CLASSES','classesOf','activeClassIds','schemeOf','mapClassId','referencePoints','assignSplit','TRAINING_SET_INFO','SIG_FEATURES','SIG_SCALES','makeAoi','aoiGeoAreaM2'];
const missing = need.filter((k) => !(k in E));
if (missing.length) { console.error('MISSING EXPORTS:', missing); process.exit(1); }
console.log('bundle exports OK:', need.length, 'symbols | configured:', E.isGEEConfigured());
"

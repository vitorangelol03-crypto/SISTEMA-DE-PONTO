#!/usr/bin/env bash
# Download face-api.js model weights for tiny_face_detector + face_landmark_68_tiny + face_recognition
set -euo pipefail

BASE="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/models"

mkdir -p "$DEST"

FILES=(
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model-shard1"
  "face_landmark_68_tiny_model-weights_manifest.json"
  "face_landmark_68_tiny_model-shard1"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
)

for file in "${FILES[@]}"; do
  if [ -s "$DEST/$file" ]; then
    echo "✓ $file (já existe)"
  else
    echo "↓ $file"
    curl -fL --retry 3 --retry-delay 2 "$BASE/$file" -o "$DEST/$file"
  fi
done

echo "Modelos baixados em $DEST"
ls -lh "$DEST"

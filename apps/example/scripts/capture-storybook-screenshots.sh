#!/bin/bash
#
# Regenerate the native Storybook preview screenshots in docs/assets/storybook.
#
# Each story is selected by relaunching the app with a STORYBOOK_STORY_ID deep
# link, so captures are deterministic and need no manual tapping. Requires a
# booted iOS simulator with Expo Go and Storybook already serving:
#
#   cd apps/example && STORYBOOK_ENABLED=true npx expo start --port 8082
#   apps/example/scripts/capture-storybook-screenshots.sh
#
# Capture a single story by passing its ID and output file name:
#
#   apps/example/scripts/capture-storybook-screenshots.sh \
#     play-a-game--play-vs-random play-vs-random
#
set -u

PORT="${PORT:-8082}"
DEVICE="${DEVICE:-booted}"
MAX_WIDTH="${MAX_WIDTH:-1000}"
REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
OUTPUT_DIRECTORY="$REPOSITORY_ROOT/docs/assets/storybook"
WORK_FILE="$(mktemp -t storybook-capture).png"

trap 'rm -f "$WORK_FILE"' EXIT
mkdir -p "$OUTPUT_DIRECTORY"

if ! curl -sf "http://127.0.0.1:${PORT}/status" >/dev/null 2>&1; then
  echo "No Metro server answering on port ${PORT}." >&2
  echo "Start it with: cd apps/example && STORYBOOK_ENABLED=true npx expo start --port ${PORT}" >&2
  exit 1
fi

previous_story_hash=""

capture() {
  local story_id="$1" file_name="$2"
  echo "=== ${story_id} -> ${file_name}.png"

  xcrun simctl terminate "$DEVICE" host.exp.Exponent >/dev/null 2>&1
  xcrun simctl openurl "$DEVICE" \
    "exp://127.0.0.1:${PORT}/--/?STORYBOOK_STORY_ID=${story_id}" >/dev/null 2>&1

  # Wait for a frame that is both settled and different from the last story,
  # so a slow relaunch cannot capture the previous story again.
  local previous_hash="" current_hash="" settled=0 polls=0
  until { [ "$settled" -ge 2 ] && [ "$current_hash" != "$previous_story_hash" ]; } ||
    [ "$polls" -ge 30 ]; do
    sleep 2
    xcrun simctl io "$DEVICE" screenshot --type=png "$WORK_FILE" >/dev/null 2>&1
    current_hash="$(shasum "$WORK_FILE" 2>/dev/null | cut -d' ' -f1)"
    if [ -n "$current_hash" ] && [ "$current_hash" = "$previous_hash" ]; then
      settled=$((settled + 1))
    else
      settled=0
    fi
    previous_hash="$current_hash"
    polls=$((polls + 1))
  done

  if [ "$polls" -ge 30 ]; then
    echo "  WARNING: timed out waiting for a settled new frame; verify the image" >&2
  fi

  cp "$WORK_FILE" "$OUTPUT_DIRECTORY/${file_name}.png"
  sips -Z "$MAX_WIDTH" "$OUTPUT_DIRECTORY/${file_name}.png" >/dev/null 2>&1
  previous_story_hash="$current_hash"
  echo "  saved docs/assets/storybook/${file_name}.png"
}

if [ "$#" -ge 2 ]; then
  capture "$1" "$2"
  exit 0
fi

capture "overview--public-api-playground" "playground"
capture "play-a-game--play-vs-random" "play-vs-random"
capture "analysis-and-training--game-replay" "game-replay"
capture "analysis-and-training--mate-in-two-puzzle" "mate-in-two"
capture "look-and-feel--themes-and-custom-pieces" "themes"
capture "overview--cburnett-piece-set" "cburnett-pieces"

echo "Captured 6 Storybook previews into docs/assets/storybook."

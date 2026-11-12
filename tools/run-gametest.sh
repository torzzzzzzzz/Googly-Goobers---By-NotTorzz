#!/usr/bin/env bash
# Runs EyeBall's in-game test suite in a real Minecraft client.
#
# On a normal desktop just run:   ./gradlew runClientGameTest
#
# Headless Linux (CI / servers): this script starts a virtual display with Xvfb.
# Minecraft 26.x asks for an sRGB-capable OpenGL framebuffer, which Xvfb's GLX visuals do not
# offer, so SDL is told to create the OpenGL context through EGL instead (Mesa supports sRGB
# surfaces there). Needs: xvfb, libegl1, libegl-mesa0 (and mesa-vulkan-drivers as a fallback).
#
# Results: build/run/clientGameTest/eyeball-test-report.md and build/run/clientGameTest/screenshots/
# Run it twice: the second launch also verifies that settings survived the restart.
set -euo pipefail
cd "$(dirname "$0")/.."

export SDL_VIDEO_FORCE_EGL=1
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-1500}"

if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null 2>&1; then
	exec timeout "$TIMEOUT_SECONDS" xvfb-run -a -s "-screen 0 1920x1080x24" ./gradlew --no-daemon runClientGameTest "$@"
else
	exec timeout "$TIMEOUT_SECONDS" ./gradlew --no-daemon runClientGameTest "$@"
fi

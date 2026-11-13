#!/usr/bin/env bash
# Runs Googly Goobers' in-game test suite in a real Minecraft client.
#
# On a normal desktop just run:   ./gradlew runClientGameTest [-Pmc=26.2|1.21.11]
#
# Headless Linux (CI / servers): this script starts a virtual display with Xvfb.
# Minecraft asks for an sRGB-capable OpenGL framebuffer, which Xvfb's GLX visuals do not
# offer, so the OpenGL context is created through EGL instead (Mesa supports sRGB surfaces there).
# Needs: xvfb, libegl1, libegl-mesa0 (and mesa-vulkan-drivers as a fallback).
#
# Usage:
#   tools/run-gametest.sh                                   # Minecraft 26.3, development environment
#   tools/run-gametest.sh -Pmc=1.21.11                      # another Minecraft version
#   tools/run-gametest.sh -Pmc=26.2 runProductionClientGameTest   # against the release jar
#
# Results: build/mc<version>/run/<clientGameTest|productionClientGameTest>/googly-goobers-test-report.md
# and .../screenshots/. Run it twice: the second launch also verifies that settings survived the restart.
set -euo pipefail
cd "$(dirname "$0")/.."

# Minecraft 26.x (SDL) and 1.21.x (GLFW) each have their own switch for EGL.
export SDL_VIDEO_FORCE_EGL=1
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-2400}"

TASK="runClientGameTest"
ARGS=()
for arg in "$@"; do
	case "$arg" in
		run*) TASK="$arg" ;;
		*) ARGS+=("$arg") ;;
	esac
done

if [[ -z "${DISPLAY:-}" ]] && command -v xvfb-run >/dev/null 2>&1; then
	exec timeout "$TIMEOUT_SECONDS" xvfb-run -a -s "-screen 0 1920x1080x24" ./gradlew --no-daemon "$TASK" "${ARGS[@]}"
else
	exec timeout "$TIMEOUT_SECONDS" ./gradlew --no-daemon "$TASK" "${ARGS[@]}"
fi

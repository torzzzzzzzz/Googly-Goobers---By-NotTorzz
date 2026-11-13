#!/usr/bin/env bash
# Builds the release jar for every supported Minecraft version and copies it into dist/
# together with SHA-256 checksums (one .sha256 file per jar, plus dist/SHA256SUMS.txt).
#
#   tools/make-release.sh
#
# Archives are reproducible, so running this again on the same sources gives identical files.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSIONS=(26.3 26.2 1.21.11)
MOD_VERSION=$(grep '^mod_version=' gradle.properties | cut -d= -f2)
BASE=$(grep '^archives_base_name=' gradle.properties | cut -d= -f2)

mkdir -p dist
JARS=()
for mc in "${VERSIONS[@]}"; do
	echo "Building ${BASE} ${MOD_VERSION} for Minecraft ${mc}"
	./gradlew --no-daemon -q -Pmc="$mc" build
	jar="${BASE}-${MOD_VERSION}-mc${mc}.jar"
	cp "build/mc${mc}/libs/${jar}" dist/
	(cd dist && sha256sum "$jar" > "$jar.sha256")
	JARS+=("$jar")
done
(cd dist && sha256sum "${JARS[@]}" > SHA256SUMS.txt && cat SHA256SUMS.txt)

#!/usr/bin/env bash
# Archive GlossX (macOS) and pack GlossX.app into a DMG.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="$ROOT/GlossX.xcodeproj"
SCHEME="GlossX (macOS)"
DIST="$ROOT/dist"
ARCHIVE_PATH="$DIST/GlossX.xcarchive"
STAGING="$DIST/dmg-staging"
VOLUME_NAME="GlossX"

usage() {
  cat <<'EOF'
Usage: scripts/make-dmg.sh

Archives the GlossX (macOS) scheme (Release) and writes a DMG to dist/.

  dist/GlossX-<version>.dmg   installer image (app + Applications shortcut)
  dist/GlossX.xcarchive       Xcode archive kept for debugging

Requires Xcode command-line tools and a valid signing identity for the
development team in the project (4CEAMHPC5F).
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

command -v xcodebuild >/dev/null || {
  echo "error: xcodebuild not found. Install Xcode." >&2
  exit 1
}

mkdir -p "$DIST"
rm -rf "$ARCHIVE_PATH" "$STAGING"
rm -f "$DIST"/GlossX-*.dmg "$DIST"/GlossX.dmg

echo "==> Archiving ${SCHEME} (Release)..."
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=macOS" \
  -archivePath "$ARCHIVE_PATH" \
  archive

APP="$ARCHIVE_PATH/Products/Applications/GlossX.app"
if [[ ! -d "$APP" ]]; then
  echo "error: GlossX.app not found in archive: $APP" >&2
  exit 1
fi

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist" 2>/dev/null || echo "1.1")"
OUTPUT_DMG="$DIST/GlossX-${VERSION}.dmg"

echo "==> Staging DMG contents..."
mkdir -p "$STAGING"
ditto "$APP" "$STAGING/GlossX.app"
ln -s /Applications "$STAGING/Applications"

echo "==> Creating ${OUTPUT_DMG}..."
hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$STAGING" \
  -ov \
  -format UDZO \
  "$OUTPUT_DMG"

rm -rf "$STAGING"

echo "==> Done"
ls -lh "$OUTPUT_DMG"
echo "Open the DMG, drag GlossX to Applications, then enable the extension in Safari → Settings → Extensions."

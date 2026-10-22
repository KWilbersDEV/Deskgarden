#!/bin/sh
# Builds release/Desk Garden-<version>.pkg, an Installer wizard that installs the finished
# Desk Garden.app into /Applications, and copies the DMG next to it.
#
# Run after `npm run desktop:build` (or use `npm run desktop:release` for both).
#
# Optional, for a signed release (never store these values in the repository):
#   PKG_SIGNING_IDENTITY="Developer ID Installer: Your Name (TEAMID)"   signs the .pkg
set -eu

cd "$(dirname "$0")/../.."
HERE="packaging/macos"
BUNDLE_DIR="src-tauri/target/universal-apple-darwin/release/bundle"
APP="$BUNDLE_DIR/macos/Desk Garden.app"
WORK="build/macos-pkg"
OUT_DIR="release"

fail() {
  echo "build-pkg: $*" >&2
  exit 1
}

[ -d "$APP" ] || fail "no app at $APP. Run npm run desktop:build first."

plist() { /usr/libexec/PlistBuddy -c "Print :$1" "$APP/Contents/Info.plist"; }
VERSION=$(plist CFBundleShortVersionString)
IDENTIFIER=$(plist CFBundleIdentifier)
MIN_OS=$(plist LSMinimumSystemVersion)
BINARY="$APP/Contents/MacOS/$(plist CFBundleExecutable)"

# Only package a universal build of the production frontend.
ARCHS=$(lipo -archs "$BINARY")
case "$ARCHS" in *arm64*x86_64* | *x86_64*arm64*) ;; *) fail "app is not universal (has: $ARCHS)." ;; esac
PROD_JS=$(sed -n 's|.*src="/\(assets/index-[^"]*\.js\)".*|\1|p' build/production/index.html)
[ -n "$PROD_JS" ] || fail "build/production is missing. Run npm run desktop:build first."
grep -q "$PROD_JS" "$BINARY" || fail "app does not contain the current production build ($PROD_JS)."
if grep -q "assets/DevBanner-" "$BINARY"; then fail "app contains the development build."; fi
codesign --verify --deep --strict "$APP" || fail "app signature is invalid."

rm -rf "$WORK"
mkdir -p "$WORK/root" "$WORK/resources" "$OUT_DIR"
# ditto keeps the code signature and extended attributes intact.
ditto "$APP" "$WORK/root/Desk Garden.app"

# Always install to /Applications, even if another copy of the app exists elsewhere on the Mac,
# and replace an older version in place. User data lives outside the app and is never touched.
pkgbuild --analyze --root "$WORK/root" "$WORK/component.plist" >/dev/null
plutil -replace 0.BundleIsRelocatable -bool NO "$WORK/component.plist"
plutil -replace 0.BundleOverwriteAction -string upgrade "$WORK/component.plist"

pkgbuild --quiet \
  --root "$WORK/root" \
  --component-plist "$WORK/component.plist" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location /Applications \
  "$WORK/DeskGarden.pkg"

fill() {
  sed -e "s|@VERSION@|$VERSION|g" -e "s|@IDENTIFIER@|$IDENTIFIER|g" -e "s|@MIN_OS@|$MIN_OS|g" "$1" > "$2"
}
fill "$HERE/distribution.xml" "$WORK/distribution.xml"
fill "$HERE/welcome.html" "$WORK/resources/welcome.html"
fill "$HERE/conclusion.html" "$WORK/resources/conclusion.html"

PKG="$OUT_DIR/Desk Garden-$VERSION.pkg"
rm -f "$PKG"
if [ -n "${PKG_SIGNING_IDENTITY:-}" ]; then
  productbuild --quiet --distribution "$WORK/distribution.xml" --resources "$WORK/resources" \
    --package-path "$WORK" --sign "$PKG_SIGNING_IDENTITY" "$PKG"
else
  productbuild --quiet --distribution "$WORK/distribution.xml" --resources "$WORK/resources" \
    --package-path "$WORK" "$PKG"
fi

DMG="$BUNDLE_DIR/dmg/Desk Garden_${VERSION}_universal.dmg"
if [ -f "$DMG" ]; then cp "$DMG" "$OUT_DIR/"; fi

echo "Built $PKG"
[ -f "$DMG" ] && echo "Copied $OUT_DIR/$(basename "$DMG")"
exit 0

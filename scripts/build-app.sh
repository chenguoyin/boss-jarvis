#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

swift build -c release

APP_DIR=".build/app/Boss Jarvis.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"

rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
cp ".build/release/boss-jarvis" "$MACOS_DIR/boss-jarvis"

# 应用图标（由 scripts/make-icon.sh 生成）
if [ -f "docs/icon/AppIcon.icns" ]; then
  cp "docs/icon/AppIcon.icns" "$RESOURCES_DIR/AppIcon.icns"
fi

# 品牌图标（侧边栏 logo，随 AppIcon 同源生成）
if [ -d "docs/icon/brand" ]; then
  cp docs/icon/brand/BrandIcon*.png "$RESOURCES_DIR/"
fi

cat > "$CONTENTS_DIR/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>boss-jarvis</string>
  <key>CFBundleIdentifier</key>
  <string>com.changhong.boss-jarvis</string>
  <key>CFBundleName</key>
  <string>Boss Jarvis</string>
  <key>CFBundleDisplayName</key>
  <string>Boss Jarvis</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSCalendarsUsageDescription</key>
  <string>Boss Jarvis 需要访问日历，用于展示今日日程。</string>
  <key>NSCalendarsFullAccessUsageDescription</key>
  <string>Boss Jarvis 需要完整访问日历，用于展示今日日程。</string>
  <key>NSRemindersFullAccessUsageDescription</key>
  <string>Boss Jarvis 需要完整访问提醒事项，用于展示待处理提醒。</string>
  <key>NSAppleEventsUsageDescription</key>
  <string>Boss Jarvis 需要控制邮件和日历，用于标记已读、打开回复窗口和同步日程。</string>
  <key>NSAppleScriptEnabled</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

# ad-hoc 签名：未签名 app 每次重建后 TCC 日历权限都会失效
codesign --force --sign - "$APP_DIR"

echo "Built $APP_DIR"

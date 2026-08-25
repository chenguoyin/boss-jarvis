#!/usr/bin/env bash
# 从 docs/icon/icon-final.svg 生成 macOS AppIcon.icns。
# 输出两种版本:
#   - AppIcon.icns          方角全出血版, 交给系统自动裁圆角 (打进 app 包用)
#   - AppIconRounded.icns   透明背景圆角矩形版 (拖拽到文件夹/其他场景用)
# 改图标只需改 SVG，再跑一次本脚本，最后跑 build-app.sh。
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
cd docs/icon

ICONSET="AppIcon.iconset"
RSET="AppIconRounded.iconset"
mkdir -p "$ICONSET" "$RSET"

# 大图母版（标准锐利曲线）
qlmanage -t -s 1024 -o . icon-final.svg >/dev/null 2>&1
mv -f icon-final.svg.png master.png

# 小尺寸母版（尖端加粗，避免 16/32px 下糊成一团）
qlmanage -t -s 128 -o . icon-final-small.svg >/dev/null 2>&1
mv -f icon-final-small.svg.png master-small.png

# ---- 方角版 (系统裁圆角) ----
# 逻辑点 <= 32 的尺寸用小尺寸母版
sips -z 16 16   master-small.png --out "$ICONSET/icon_16x16.png"      >/dev/null
sips -z 32 32   master-small.png --out "$ICONSET/icon_16x16@2x.png"   >/dev/null
sips -z 32 32   master-small.png --out "$ICONSET/icon_32x32.png"      >/dev/null
sips -z 64 64   master-small.png --out "$ICONSET/icon_32x32@2x.png"   >/dev/null

sips -z 128 128 master.png       --out "$ICONSET/icon_128x128.png"    >/dev/null
sips -z 256 256 master.png       --out "$ICONSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 master.png       --out "$ICONSET/icon_256x256.png"    >/dev/null
sips -z 512 512 master.png       --out "$ICONSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 master.png       --out "$ICONSET/icon_512x512.png"    >/dev/null
cp master.png "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o AppIcon.icns

# ---- 圆角版 (透明背景, 已裁好圆角) ----
for entry in \
  "16 master-small.png" \
  "32 master-small.png" \
  "64 master-small.png" \
  "128 master.png" \
  "256 master.png" \
  "512 master.png" \
  "1024 master.png"; do
  set -- $entry
  side=$1
  src=$2
  swift "$ROOT/scripts/squircle.swift" "$src" "rounded-$side.png" "$side"
done

cp rounded-16.png   "$RSET/icon_16x16.png"
cp rounded-32.png   "$RSET/icon_16x16@2x.png"
cp rounded-32.png   "$RSET/icon_32x32.png"
cp rounded-64.png   "$RSET/icon_32x32@2x.png"
cp rounded-128.png  "$RSET/icon_128x128.png"
cp rounded-256.png  "$RSET/icon_128x128@2x.png"
cp rounded-256.png  "$RSET/icon_256x256.png"
cp rounded-512.png  "$RSET/icon_256x256@2x.png"
cp rounded-512.png  "$RSET/icon_512x512.png"
cp rounded-1024.png "$RSET/icon_512x512@2x.png"

iconutil -c icns "$RSET" -o AppIconRounded.icns

# App 包内的主图标也用圆角版（与 AppIconRounded 同内容，保持单一文件名约定）
cp AppIconRounded.icns AppIcon.icns

# 品牌图标 PNG (app 内侧边栏 logo, 白底圆角版, 在浅色侧栏里更干净)
# 注意: 复用上方已生成的 rounded-*.png (渐变背景) 不合适, 侧栏用纯白更耐看
mkdir -p brand
qlmanage -t -s 512 -o brand icon-final-white.svg >/dev/null 2>&1
mv -f brand/icon-final-white.svg.png brand/white-master.png
swift "$ROOT/scripts/squircle.swift" brand/white-master.png brand/BrandIcon@2x.png 512
swift "$ROOT/scripts/squircle.swift" brand/white-master.png brand/BrandIcon.png 256
mv brand/white-master.png /tmp/boss-jarvis-white-master.png
# squircle.swift 在 Retina 下可能输出 2x 像素, 统一到声明尺寸
sips -z 256 256 brand/BrandIcon.png --out brand/BrandIcon.png >/dev/null
sips -z 512 512 brand/BrandIcon@2x.png --out brand/BrandIcon@2x.png >/dev/null

echo "Built docs/icon/AppIcon.icns + AppIconRounded.icns"

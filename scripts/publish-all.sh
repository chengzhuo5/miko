#!/usr/bin/env bash
# 发布所有 miko 包到 npm
# 用法: bash scripts/publish-all.sh <OTP验证码>
set -e

OTP="${1:?请提供 OTP 验证码: bash scripts/publish-all.sh <otp>}"
REGISTRY="https://registry.npmjs.org/"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

packages=(
  packages/vite-plugin-miko
  packages/vite-plugin-bootstrap
  packages/vite-plugin-external
  packages/vite-plugin-index-html
  packages/framework
  packages/linter
  packages/cli
)

echo "========================================"
echo "  发布 ${#packages[@]} 个包到 npm"
echo "========================================"

for pkg in "${packages[@]}"; do
  name=$(node -e "console.log(require('./$pkg/package.json').name)")
  ver=$(node -e "console.log(require('./$pkg/package.json').version)")
  echo ""
  echo ">>> $name@$ver"
  cd "$ROOT/$pkg"
  npm publish --registry "$REGISTRY" --access public --otp "$OTP"
  echo "    ✓ $name@$ver 发布完成"
done

echo ""
echo "========================================"
echo "  全部发布完成"
echo "========================================"

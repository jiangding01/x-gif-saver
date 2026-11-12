#!/usr/bin/env bash
# 输出 CHANGELOG.md 中指定版本那一节的正文（不含「## [x.y.z]」标题行），供 Release 说明使用。
# 用法：bash scripts/changelog-section.sh 0.1.0
# 找不到该版本或正文为空时以非零状态退出，避免发出空说明。
set -euo pipefail
version="${1:?用法：changelog-section.sh <版本号，如 0.1.0>}"
changelog="${2:-CHANGELOG.md}"
section=$(awk -v ver="$version" '
  /^## \[/ { if (found) exit; if (index($0, "## [" ver "]") == 1) { found = 1; next } }
  found { print }
' "$changelog")
if [ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]; then
  echo "CHANGELOG.md 中没有找到版本 $version 的内容" >&2
  exit 1
fi
printf '%s\n' "$section" | sed -e '/./,$!d'

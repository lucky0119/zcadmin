#!/usr/bin/env bash
# =============================================================================
# 打包 zcadmin 生产部署包（在开发机 / 本机执行）
# 产物：deploy/zcadmin-deploy.tar.gz + deploy/deploy-zcadmin.sh + deploy/upload-and-deploy.sh
# =============================================================================
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$(pwd)"
OUT_DIR="$ROOT/deploy"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "[+] 项目目录: $ROOT"

# 1) 构建前端（dist 会被一起打包；Node 服务直接托管它）
if [[ "${SKIP_BUILD:-no}" != "yes" ]]; then
  echo "[+] 构建前端 (pnpm build-only)"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm build-only
  else
    echo "[!] 未找到 pnpm，尝试 npm run build-only"
    npm run build-only
  fi
fi
[[ -f "$ROOT/dist/index.html" ]] || { echo "[x] dist/index.html 不存在，构建失败" >&2; exit 1; }

# 2) 组装部署目录（只带运行时需要的东西）
mkdir -p "$STAGE/dist" "$STAGE/server" "$STAGE/data"

cp -r "$ROOT/dist/."                    "$STAGE/dist/"
cp    "$ROOT/server/"*.mjs              "$STAGE/server/" 2>/dev/null || true
rm -f "$STAGE/server/index.node-test.mjs"
cp    "$ROOT/package.json"              "$STAGE/"

# package.json 去掉 devDependencies 与开发脚本，减小体积
python3 - "$STAGE/package.json" <<'PY'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d.pop("devDependencies", None)
for k in ("dev", "dev:api", "dev:vite", "build", "preview", "test:unit",
          "test:server", "test:e2e", "lint", "format", "type-check", "build-only"):
    d.get("scripts", {}).pop(k, None)
d["scripts"] = {"start": "node server/start.mjs"}
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
PY

# 3) 迁移数据（本机 data/site-data.json → 服务器，首次部署即有数据）
if [[ -f "$ROOT/data/site-data.json" && "${INCLUDE_DATA:-yes}" == "yes" ]]; then
  cp "$ROOT/data/site-data.json" "$STAGE/data/site-data.json"
  echo "[+] 已包含 data/site-data.json（首次部署直接带数据）"
else
  echo "[!] 未包含数据文件；服务器将使用空数据初始化"
fi

# 4) 打包
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/zcadmin-deploy.tar.gz"
tar czf "$OUT_DIR/zcadmin-deploy.tar.gz" -C "$STAGE" .
chmod +x "$OUT_DIR/deploy-zcadmin.sh" 2>/dev/null || true

echo "[+] 生成 $OUT_DIR/zcadmin-deploy.tar.gz ($(du -h "$OUT_DIR/zcadmin-deploy.tar.gz" | cut -f1))"
tar tzf "$OUT_DIR/zcadmin-deploy.tar.gz" | head -20
echo "[+] 完成"

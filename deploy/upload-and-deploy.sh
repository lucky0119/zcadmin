#!/usr/bin/env bash
# =============================================================================
# 从本机（你正在用的电脑）上传并部署 zcadmin
#
# 前置：本机已能免密登录服务器
#   ssh-copy-id -i ~/.ssh/id_ed25519.pub ubuntu@101.33.225.244
#
# 用法：
#   bash deploy/upload-and-deploy.sh --host 101.33.225.244 --user ubuntu \
#        --domain www.onebai.cn --email you@example.com
#   bash deploy/upload-and-deploy.sh ... --no-tls      # 先不上证书
#   bash deploy/upload-and-deploy.sh ... --key ~/.ssh/id_ed25519
# =============================================================================
set -Eeuo pipefail

HOST="101.33.225.244"
USER_NAME="ubuntu"
DOMAIN="www.onebai.cn"
EMAIL=""
SSH_KEY=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)   HOST="$2"; shift 2 ;;
    --user)   USER_NAME="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2"; shift 2 ;;
    --key)    SSH_KEY="$2"; shift 2 ;;
    --no-tls) EXTRA_ARGS+=("--no-tls"); shift ;;
    -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

cd "$(dirname "${BASH_SOURCE[0]}")/.."
[[ -f deploy/zcadmin-deploy.tar.gz ]] || { echo "[x] 先执行 bash deploy/build-package.sh" >&2; exit 1; }

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
[[ -n "$SSH_KEY" ]] && SSH_OPTS+=(-i "$SSH_KEY")
TARGET="${USER_NAME}@${HOST}"

echo "[+] 测试 SSH 连通性：$TARGET"
ssh "${SSH_OPTS[@]}" "$TARGET" 'echo ok: $(hostname) $(lsb_release -ds 2>/dev/null || . /etc/os-release && echo $PRETTY_NAME)' \
  || { echo "[x] SSH 不通。请先配置免密登录：ssh-copy-id ${TARGET}" >&2; exit 1; }

echo "[+] 上传部署包与脚本到 /tmp/zcadmin-deploy"
ssh "${SSH_OPTS[@]}" "$TARGET" 'rm -rf /tmp/zcadmin-deploy && mkdir -p /tmp/zcadmin-deploy'
scp "${SSH_OPTS[@]}" deploy/zcadmin-deploy.tar.gz deploy/deploy-zcadmin.sh "$TARGET:/tmp/zcadmin-deploy/"

TLS_ARG=()
[[ -n "$EMAIL" ]] && TLS_ARG=(--email "$EMAIL")
echo "[+] 远端执行部署（sudo）"
ssh "${SSH_OPTS[@]}" -t "$TARGET" \
  "sudo bash /tmp/zcadmin-deploy/deploy-zcadmin.sh --domain '$DOMAIN' ${TLS_ARG[*]} ${EXTRA_ARGS[*]}"

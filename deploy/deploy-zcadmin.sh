#!/usr/bin/env bash
# =============================================================================
# zcadmin 一键部署（在服务器上以 root 或 sudo 执行）
# 目标系统：Ubuntu 22.04 / 24.04（Debian 系）
#
# 用法：
#   sudo bash deploy-zcadmin.sh --domain www.onebai.cn --email you@example.com
#   sudo bash deploy-zcadmin.sh --domain www.onebai.cn --email you@example.com --no-tls
#
# 幂等：可重复执行（重装依赖、覆盖程序、重建 nginx 配置、重启服务）。
# 回滚：脚本会把旧版本打包到 /var/backups/zcadmin/<时间戳>/，详见输出提示。
# =============================================================================
set -Eeuo pipefail

# ------------------------------ 默认参数 -------------------------------------
DOMAIN="www.onebai.cn"
EMAIL=""
APP_DIR="/opt/zcadmin"
APP_USER="zcadmin"
NODE_MAJOR="22"
APP_PORT="3000"
SERVER_NAME="${DOMAIN}"          # 额外域名用 --server-names "a.com,b.com"
ENABLE_TLS="yes"
PKG_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/zcadmin-deploy.tar.gz"

log()  { printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)        DOMAIN="$2"; SERVER_NAME="$2"; shift 2 ;;
    --server-names)  SERVER_NAME="$2"; shift 2 ;;
    --email)         EMAIL="$2"; shift 2 ;;
    --app-dir)       APP_DIR="$2"; shift 2 ;;
    --app-port)      APP_PORT="$2"; shift 2 ;;
    --package)       PKG_SRC="$2"; shift 2 ;;
    --no-tls)        ENABLE_TLS="no"; shift ;;
    -h|--help)       sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

# ------------------------------ 前置检查 -------------------------------------
[[ $EUID -eq 0 ]] || die "请用 root 或 sudo 运行"
. /etc/os-release
case "${ID}${VERSION_ID}" in
  ubuntu2[24].04|debian1[23]) ;;
  *) warn "未在 ${PRETTY_NAME} 上实测，脚本按 Debian 系处理，请留意输出" ;;
esac

# 磁盘安全检查
AVAIL_KB=$(df -Pk /var | awk 'NR==2{print $4}')
(( AVAIL_KB > 512000 )) || die "/var 剩余空间不足 500MB，请先清理"

# 程序包
[[ -f "$PKG_SRC" ]] || die "找不到部署包 $PKG_SRC（用 --package 指定）"

# ------------------------------ 反向代理选择 --------------------------------
# 目标机器上若已有 Caddy 在跑，优先复用：
#   - Caddy 自带自动 HTTPS，无需 certbot
#   - 避免 nginx 与 Caddy 抢 80/443 导致站点中断（实测踩过）
if systemctl is-active --quiet caddy 2>/dev/null; then
  PROXY="caddy"
else
  PROXY="nginx"
fi
log "反向代理：${PROXY}"

log "系统：${PRETTY_NAME}｜域名：${DOMAIN}｜应用端口：${APP_PORT}｜目录：${APP_DIR}"

# ------------------------------ 时区与基础工具 --------------------------------
export DEBIAN_FRONTEND=noninteractive
log "安装基础依赖（nginx / ca-certificates / curl / ufw）"
apt-get update -qq
apt-get install -y -qq nginx ca-certificates curl gnupg ufw >/dev/null

timedatectl set-timezone Asia/Shanghai 2>/dev/null || warn "时区设置失败，跳过"

# ------------------------------ Node.js --------------------------------------
need_node="yes"
if command -v node >/dev/null 2>&1; then
  cur=$(node -p 'process.versions.node.split(".")[0]')
  (( cur >= 20 )) && { log "已存在 Node.js $(node -v)，跳过安装"; need_node="no"; }
fi
if [[ "$need_node" == "yes" ]]; then
  log "安装 Node.js ${NODE_MAJOR}.x（NodeSource 源）"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
fi
node -v && npm -v

# ------------------------------ 系统用户 -------------------------------------
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  log "创建系统用户 $APP_USER（无登录权限）"
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

# ------------------------------ 备份旧版本 -----------------------------------
BACKUP_DIR="/var/backups/zcadmin/$(date +%Y%m%d-%H%M%S)"
install -d -m 0700 "$BACKUP_DIR"
if [[ -d "$APP_DIR" ]]; then
  log "备份旧版本到 $BACKUP_DIR"
  tar czf "$BACKUP_DIR/app.tar.gz" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" 2>/dev/null || true
  [[ -f /etc/nginx/sites-available/zcadmin.conf ]] && cp /etc/nginx/sites-available/zcadmin.conf "$BACKUP_DIR/"
  [[ -f /etc/zcadmin/zcadmin.env ]] && cp /etc/zcadmin/zcadmin.env "$BACKUP_DIR/"
  [[ -f "/etc/letsencrypt/renewal/${DOMAIN}.conf" ]] && cp "/etc/letsencrypt/renewal/${DOMAIN}.conf" "$BACKUP_DIR/" || true
fi

# ------------------------------ 解压程序 -------------------------------------
log "解压程序到 $APP_DIR"
install -d -m 0755 "$APP_DIR"
tar xzf "$PKG_SRC" -C "$APP_DIR"
[[ -f "$APP_DIR/dist/index.html" ]] || die "部署包里缺少 dist/index.html（请先在本机执行 pnpm build）"
[[ -f "$APP_DIR/server/index.mjs" ]] || die "部署包里缺少 server/index.mjs"

# 生产依赖（mysql2 等）
if [[ -f "$APP_DIR/package.json" ]]; then
  log "安装生产依赖（npm --omit=dev）"
  ( cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund ) || warn "npm install 失败，若服务启动报缺模块请手动处理"
fi

# 数据目录（文件存储模式时使用）
install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR/data"

# 关键：以 root 解压/npm install 后文件属主为 root，systemd 以 ${APP_USER} 运行，
# 目录属主不对会报 status=200/CHDIR。统一回属主（历史踩坑）。
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
chmod 0755 "$APP_DIR"

# ------------------------------ 环境变量 -------------------------------------
ENV_FILE="/etc/zcadmin/zcadmin.env"
install -d -m 0750 /etc/zcadmin
if [[ -f "$ENV_FILE" ]]; then
  log "保留已有环境配置 $ENV_FILE"
else
  log "生成环境配置 $ENV_FILE（首次部署）"
  ADMIN_PW=$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)
  cat >"$ENV_FILE" <<EOF
# zcadmin 生产环境变量 ｜ 生成时间 $(date -Iseconds)
# DATA_FILE 存在即使用 JSON 文件存储；不设置则走 MySQL。
DATA_FILE=${APP_DIR}/data/site-data.json
HOST=127.0.0.1
PORT=${APP_PORT}
ADMIN_PASSWORD=${ADMIN_PW}

# ---- MySQL 模式（如需启用：注释掉上面的 DATA_FILE，并填写下面 4 项）----
# MYSQL_HOST=127.0.0.1
# MYSQL_PORT=3306
# MYSQL_DATABASE=yhasset
# MYSQL_USER=yhasset
# MYSQL_PASSWORD=change-me
EOF
  chmod 0640 "$ENV_FILE"
  chown root:"$APP_USER" "$ENV_FILE"
  ADMIN_PW_SHOW="$ADMIN_PW"
fi

# ------------------------------ systemd 单元 ---------------------------------
log "写入 systemd 服务 /etc/systemd/system/zcadmin.service"
cat >/etc/systemd/system/zcadmin.service <<EOF
[Unit]
Description=zcadmin asset management (Node.js)
Documentation=file://${APP_DIR}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
ExecStart=$(command -v node) ${APP_DIR}/server/start.mjs
Restart=always
RestartSec=3
KillSignal=SIGTERM
TimeoutStopSec=20

# 资源与安全加固
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/data
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=zcadmin

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable zcadmin >/dev/null
systemctl restart zcadmin
sleep 2
if ! systemctl is-active --quiet zcadmin; then
  warn "服务未启动成功，最近日志："
  journalctl -u zcadmin -n 40 --no-pager || true
  die "zcadmin 启动失败，请按上面日志排查（回滚见 /var/backups/zcadmin）"
fi

# 本地健康检查
log "健康检查 http://127.0.0.1:${APP_PORT}/api/health"
for i in {1..10}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${APP_PORT}/api/health" | grep -q '"ok":true'; then
    log "后端就绪"
    break
  fi
  [[ $i -eq 10 ]] && { journalctl -u zcadmin -n 30 --no-pager; die "后端健康检查失败"; }
  sleep 1
done

# ------------------------------ 反向代理 -------------------------------------
if [[ "$PROXY" == "caddy" ]]; then
  log "配置 Caddy（自动 HTTPS）"
  install -d -m 0755 /var/log/caddy
  chown -R caddy:caddy /var/log/caddy 2>/dev/null || true
  [[ -f /etc/caddy/Caddyfile ]] && cp /etc/caddy/Caddyfile "$BACKUP_DIR/Caddyfile"

  # HTTP-only 模式用于 --no-tls
  if [[ "$ENABLE_TLS" == "yes" ]]; then
    CADDY_SITE="${SERVER_NAME}"
  else
    CADDY_SITE=$(for d in ${SERVER_NAME//,/ }; do printf -- 'http://%s, ' "$d"; done)
    CADDY_SITE="${CADDY_SITE%, }"
  fi

  cat >/etc/caddy/Caddyfile <<EOF
# zcadmin 反向代理 —— 由 deploy-zcadmin.sh 生成
${CADDY_SITE} {
	encode gzip zstd
	request_body {
		max_size 12MB
	}

	@assets path /assets/*
	header @assets Cache-Control "public, max-age=2592000, immutable"

	reverse_proxy 127.0.0.1:${APP_PORT}

	log {
		output file /var/log/caddy/zcadmin.log {
			roll_size 10mb
			roll_keep 5
		}
	}
}
EOF
  if caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl reload caddy 2>/dev/null || systemctl restart caddy
    log "Caddy 已重载（证书由 Caddy 自动申请与续期）"
  else
    caddy validate --config /etc/caddy/Caddyfile 2>&1 | tail -5
    die "Caddy 配置校验失败（原配置已备份到 $BACKUP_DIR）"
  fi

  # 已有 nginx 在跑会抢 80，禁用开机自启避免下次重启冲突
  if systemctl is-active --quiet nginx 2>/dev/null; then
    warn "nginx 正在运行，与 Caddy 争抢 80 端口；建议停止并禁用 nginx"
    warn "  systemctl disable --now nginx"
  fi
else
  NGX_CONF="/etc/nginx/sites-available/zcadmin.conf"
  log "写入 Nginx 配置 $NGX_CONF"
  cat >"$NGX_CONF" <<EOF
# zcadmin 反向代理 —— 由 deploy-zcadmin.sh 生成
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME//,/ };

    client_max_body_size 12m;

    # 静态文件由 Node 托管（server/static.mjs 含 SPA history 回退），
    # 此处不做静态直出，避免与前端路由回退冲突导致刷新 404。
    location /api/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location ~* ^/assets/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        access_log off;
    }

    access_log /var/log/nginx/zcadmin.access.log;
    error_log  /var/log/nginx/zcadmin.error.log;
}
EOF

  ln -sf "$NGX_CONF" /etc/nginx/sites-enabled/zcadmin.conf
  rm -f /etc/nginx/sites-enabled/default

  if nginx -t 2>/tmp/nginx-test.err; then
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl reload nginx 2>/dev/null || systemctl restart nginx
    log "Nginx 配置校验通过并已重载"
  else
    cat /tmp/nginx-test.err
    die "Nginx 配置校验失败（已保留原配置，可用备份还原）"
  fi
fi

# ------------------------------ 防火墙 ---------------------------------------
log "开放 HTTP/HTTPS（ufw 未启用则不启用，避免锁死 SSH）"
if ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp   >/dev/null 2>&1 || true
  ufw allow 80/tcp   >/dev/null 2>&1 || true
  ufw allow 443/tcp  >/dev/null 2>&1 || true
  log "ufw 规则已追加（22/80/443）"
else
  warn "ufw 未启用，跳过（云厂商安全组请务必放行 80/443）"
fi

# ------------------------------ TLS（仅 nginx 需要 certbot） ------------------
if [[ "$PROXY" == "nginx" && "$ENABLE_TLS" == "yes" ]]; then
  if [[ -z "$EMAIL" ]]; then
    warn "未提供 --email，跳过证书申请；可稍后手动执行："
    warn "  apt install -y certbot python3-certbot-nginx && certbot --nginx -d ${SERVER_NAME%%,*}"
  else
    log "申请 Let's Encrypt 证书：${SERVER_NAME}"
    apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
    if certbot --nginx -n --agree-tos -m "$EMAIL" \
         $(for d in ${SERVER_NAME//,/ }; do printf -- '-d %s ' "$d"; done) \
         --redirect; then
      log "HTTPS 已启用（certbot 自动续期）"
    else
      warn "证书申请失败。检查："
      warn "  1) 域名 A 记录指向本机（dig +short ${DOMAIN}）"
      warn "  2) 云厂商安全组放行 80/443（这一步最常见）"
      warn "  3) 80 端口未被其他站点占用"
      warn "站点仍可通过 http://${DOMAIN} 访问，修复后重跑本脚本即可"
    fi
  fi
elif [[ "$PROXY" == "caddy" && "$ENABLE_TLS" == "yes" ]]; then
  log "Caddy 自动 HTTPS 已生效（证书申请失败时检查安全组 80/443 与 DNS）"
else
  warn "TLS 未启用，仅提供 HTTP"
fi

# ------------------------------ 收尾 -----------------------------------------
PUBLIC_IP=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || echo "本机公网IP")
echo
echo "============================================================"
log "部署完成"
echo "------------------------------------------------------------"
echo " 访问地址 : http(s)://${DOMAIN}"
echo " 程序目录 : ${APP_DIR}"
echo " 配置     : ${ENV_FILE}"
echo " 服务管理 : systemctl {status|restart|stop} zcadmin"
echo " 实时日志 : journalctl -u zcadmin -f"
echo " Nginx日志: /var/log/nginx/zcadmin.{access,error}.log"
echo " 备份目录 : ${BACKUP_DIR}"
if [[ -n "${ADMIN_PW_SHOW:-}" ]]; then
  echo "------------------------------------------------------------"
  echo " 初始管理员密码: ${ADMIN_PW_SHOW}"
  echo " ⚠ 请立即登录并在系统中修改，或编辑 ${ENV_FILE} 后 systemctl restart zcadmin"
fi
echo "------------------------------------------------------------"
echo " 回滚方法："
echo "   1) systemctl stop zcadmin"
echo "   2) tar xzf ${BACKUP_DIR}/app.tar.gz -C $(dirname "$APP_DIR")"
echo "   3) cp ${BACKUP_DIR}/zcadmin.conf /etc/nginx/sites-available/ 2>/dev/null"
echo "   4) systemctl start zcadmin && nginx -t && systemctl reload nginx"
echo "============================================================"

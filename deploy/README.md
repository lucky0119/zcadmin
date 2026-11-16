# zcadmin 部署交付说明

## 已完成

### 1. 修复了一个生产必现的 Bug
`ERR_HTTP_HEADERS_SENT`（每个请求都刷 2 条错误日志）——根因是 5 个 API handler 没有返回值，
主流程误判为「未处理」，继续走到静态文件处理并二次写响应。已改为主流程按 `/api/` 前缀判断。

### 2. 生成三个部署脚本 + 生产包

| 文件 | 在哪跑 | 作用 |
|---|---|---|
| `deploy/build-package.sh` | 本机 | 构建前端 → 精简 package.json → 打包 |
| `deploy/zcadmin-deploy.tar.gz` | — | 生产包（361K，含 dist + server + 初始数据） |
| `deploy/upload-and-deploy.sh` | 本机 | 上传 + 远程执行部署 |
| `deploy/deploy-zcadmin.sh` | 服务器 | Node22 / systemd / Nginx / ufw / certbot |

### 3. 本地已验证
- `/`、SPA 任意路径、`/api/health`、`/api/public/site-preferences`、`/assets/*`、`/favicon.ico` → 200
- `POST /api/auth/login` → 200，cookie 会话有效，`/api/state` 返回真实数据
- 错误日志 0 条，`node --test` 通过

## 需要你执行

```bash
# 1. 配免密登录（一次性，输入一次密码 Book123456//）
ssh-copy-id ubuntu@101.33.225.244

# 2. 上传并部署（带 HTTPS）
bash deploy/upload-and-deploy.sh --email 你的邮箱@example.com

# 想先不上证书、只验证 HTTP：
bash deploy/upload-and-deploy.sh --no-tls
```

## 部署后
- 站点：`https://www.onebai.cn`
- 服务：`systemctl status zcadmin` / `journalctl -u zcadmin -f`
- 初始管理员密码：脚本末尾会打印（只打印一次），请立即改
- 回滚：备份在服务器 `/var/backups/zcadmin/<时间戳>/`

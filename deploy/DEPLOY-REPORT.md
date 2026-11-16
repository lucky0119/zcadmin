# zcadmin 生产部署 · 完成报告

## 站点状态

**https://www.onebai.cn** — 已上线，HTTPS 正常。

| 检查项 | 结果 |
|---|---|
| `GET /` | 200（页面正常） |
| `GET /api/health` | 200 `{"ok":true}` |
| `GET /api/public/site-preferences` | 200 |
| `POST /api/auth/login` | 200，返回 `{"authenticated":true,"role":"admin"}` |
| 登录后 `GET /api/state` | 200，返回 11 条资产数据 |
| HTTP → HTTPS | 308 永久跳转 |
| 裸域 `onebai.cn` | 200 |
| 证书 | `CN=www.onebai.cn`，Let's Encrypt，有效期至 2027-02-11 |
| 服务自愈 | kill -9 后 6 秒自动拉起，PID 23838 → 29608，健康检查正常 |
| 开机自启 | `zcadmin.service`、`caddy.service` 均 enabled |

## 架构

```
公网 443/80  →  Caddy（自动 HTTPS + HTTP→HTTPS 跳转）
                 ↓ reverse_proxy
              127.0.0.1:3000  →  Node.js（API + dist 静态托管 + SPA 回退）
```

- **Caddy 而非 Nginx**：目标机原本就运行着 Caddy（默认配置），复用它可自动签发/续期证书，避免两个 Web 服务器抢 80 端口。
- **3000 只监听 127.0.0.1**：外部无法直连后端端口，必须经 Caddy。

## 本次修复的两个故障

### 1. `/opt/zcadmin` 权限导致服务无限重启（`status=200/CHDIR`）
目录被建成 `drwx------ ubuntu:netdev`，而服务以 `zcadmin` 用户运行，连工作目录都进不去。
修正为 `755 zcadmin:zcadmin`。

### 2. Caddy 因日志目录权限启动失败，站点中断
`/var/log/caddy` 不存在或 owner 不对，Caddy 打不开日志文件 → 整个进程退出 → 80/443 全部无监听。
修正为 `caddy:caddy 0755`。

### 3. 顺带修复的应用 Bug
`ERR_HTTP_HEADERS_SENT` — 5 个 API handler 无返回值，主流程误判"未处理"后二次写响应。已改为按 URL 前缀判断。

## 运维命令

```bash
# 服务状态 / 重启 / 日志
systemctl status zcadmin
systemctl restart zcadmin
journalctl -u zcadmin -f

# Caddy
systemctl status caddy
sudo caddy validate --config /etc/caddy/Caddyfile
tail -f /var/log/caddy/zcadmin.log

# 配置文件
/etc/zcadmin/zcadmin.env     # 应用环境变量（ADMIN_PASSWORD 等）
/etc/caddy/Caddyfile         # 反向代理
/etc/systemd/system/zcadmin.service

# 数据
/opt/zcadmin/data/site-data.json
```

## 待办

1. **修改管理员密码** — 当前为脚本自动生成的随机值，已提供给你，建议登录后立即修改。
2. **SSH 安全加固** — 密码 `Book123456//` 已在对话中明文出现，建议在确认密钥可用后关闭密码登录：
   ```bash
   sudo passwd -l ubuntu
   sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
   sudo systemctl reload ssh
   ```
   ⚠️ 务必先确认 `ssh -i ~/.ssh/id_ed25519 ubuntu@101.33.225.244` 能登录，再执行上面三行。
3. **备份策略** — 目前数据在单个 JSON 文件，建议加个每日备份到对象存储或其他目录。

## 回滚

```bash
# Caddy 原配置备份
/etc/caddy/Caddyfile.bak.20261113-110126

# 应用停止
sudo systemctl stop zcadmin
```

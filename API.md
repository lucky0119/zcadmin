# 生产环境 API 接口文档

本文档按 `server/index.mjs` 中的实际路由整理，覆盖生产 Node.js 服务公开的 `/api` 接口。开发环境和生产环境使用相同的 API 路径。

## 1. 基本约定

- **生产请求地址**：使用当前部署站点的同源地址，例如 `https://<生产域名>/api/health`。项目通过相对路径发起请求，仓库未固定生产域名。
- **服务端口**：默认监听 `0.0.0.0:3000`；部署在反向代理后时，客户端仍应访问站点域名，而不是直接拼接内部端口。
- **数据格式**：请求和响应均为 UTF-8 JSON；含请求体时使用 `Content-Type: application/json`。请求体上限为 10 MiB。
- **会话**：登录成功后服务端设置 `zcadmin_session` HttpOnly Cookie；浏览器同源请求会自动携带。会话有效期为 8 小时，活动请求会刷新有效期；HTTPS 请求设置 `Secure`。
- **角色**：`admin`（系统管理员）、`manager`（资产管理员）、`user`（普通用户）。
- 除健康检查、公开站点设置、登录、会话查询和登出外，`/api` 接口需要有效登录会话。普通用户仅能访问自助申请相关能力；资产管理能力要求 `manager` 或 `admin`，系统设置和用户管理要求 `admin`。
- 成功响应直接返回对应 JSON 数据，不额外包裹 `data` 字段。错误响应格式为 `{"error":"错误说明"}`。

### 常见 HTTP 状态码

| 状态码 | 含义 |
|---|---|
| `200` | 请求成功 |
| `400` | JSON 格式或请求参数无效 |
| `401` | 未登录、会话失效或登录凭据错误 |
| `403` | 当前角色无权执行操作 |
| `404` | 接口或指定资源不存在 |
| `409` | 资源状态冲突（例如重复申请、重复审批） |
| `413` | 请求体超过 10 MiB |
| `500` | 服务端数据读写失败 |
| `503` | 健康检查发现数据库不可用 |

## 2. 公开及会话接口

### `GET /api/health`

无需登录。检查 API 和持久化存储可用性。

- 成功：`200 {"ok":true}`
- 存储检查失败：`503 {"ok":false,"error":"数据库连接失败，请检查 MySQL 配置和数据库权限"}`

### `GET /api/public/site-preferences`

无需登录。读取登录页可公开展示的站点信息。

**成功响应**

```json
{
  "siteTitle": "毅弘资产云",
  "logoDataUrl": ""
}
```

### `POST /api/auth/login`

无需登录。校验账号密码并建立会话。

**请求体**

```json
{
  "username": "admin",
  "password": "<密码>"
}
```

**成功响应**：`200 {"authenticated":true,"role":"admin","username":"admin"}`，同时设置会话 Cookie。凭据错误返回 `401`。

### `GET /api/auth/session`

无需登录。查询当前会话；未登录或会话已过期时仍返回 `200`。

```json
{"authenticated":true,"role":"manager","username":"asset-manager"}
```

未认证响应为 `{"authenticated":false}`。

### `POST /api/auth/logout`

无需登录。注销当前会话并清除 Cookie。

**成功响应**：`200 {"authenticated":false}`

## 3. 用户自助与领用申请

### `GET /api/user/state`

任意已登录角色。返回普通用户界面所需的资产摘要、申请记录及展示设置。

**响应字段**

- `assets`：资产摘要数组，单项包含 `id`、`name`、`category`、`assetClass`、`status`、`condition`、`borrower`、`loanDate`、`dueDate`、`returned`、`location`、`department`。
- `loanRequests`：领用申请数组。
- `sitePreferences`、`displayPreferences`：站点和显示偏好对象。

> 注意：当前实现中该聚合接口的 `loanRequests` 字段返回全部申请；单独调用 `GET /api/loan-requests` 时才按角色/申请人过滤。

### `GET /api/loan-requests`

任意已登录角色。`admin` / `manager` 获取全部申请；`user` 仅获取由本人提交的申请。

申请对象字段：`id`、`assetId`、`assetName`、`borrower`、`dueDate`、`requestedBy`、`requestedAt`、`status`（`待审批` / `已批准` / `已拒绝`）、`reviewedAt`。

### `POST /api/loan-requests`

任意已登录角色。提交领用申请。

**请求体**

```json
{
  "assetId": "HW-001",
  "borrower": "张三",
  "dueDate": "2026-12-01"
}
```

`assetId` 必填；`borrower` 去除首尾空格后须为 1–30 字符；`dueDate` 必须是有效的 `YYYY-MM-DD` 日期且不能早于今天。资产必须存在、可领用，且没有该资产的待审批申请。

**成功响应**：`200` 返回新申请对象（字段见上）。资产不存在返回 `404`；不可领用或已有待审批申请返回 `409`。

### `POST /api/loan-requests/{id}/review`

仅 `admin` / `manager`。审批待处理申请。

**请求体**

```json
{"action":"approve"}
```

`action` 为 `approve` 或 `reject`。批准后会更新资产领用信息并新增借还日志；申请已处理返回 `409`，申请不存在返回 `404`。

**成功响应**：`200` 返回更新后的申请对象。

## 4. 用户管理

以下接口仅 `admin` 可调用。

### `GET /api/users`

获取用户列表。响应为用户数组，每项为 `username`、`displayName`、`role`；不返回密码哈希。

### `POST /api/users`

创建用户。

**请求体**

```json
{
  "username": "asset-manager",
  "password": "<至少 4 位>",
  "displayName": "资产管理员",
  "role": "manager"
}
```

账号去除首尾空格后须为 2–30 字符且不能为 `admin`；密码为 4–100 字符；显示名称必填且最多 30 字符。`role` 可为 `manager` 或 `user`，未传或其他值按 `user` 处理。重复账号返回 `409`。

**成功响应**：`200` 返回创建的用户对象（不含密码哈希）。

### `DELETE /api/users/{username}`

删除指定账号。路径中的用户名须 URL 编码。

**成功响应**：`200` 返回删除后的用户数组（不含密码哈希）。

## 5. 状态、资产与设置

以下资产维护接口要求 `admin` 或 `manager`；系统初始化、设置修改、备份导入及清空操作仅 `admin` 可用。

### `GET /api/state`

读取完整管理状态。仅 `admin` / `manager` 可用。

响应包括 `version`、`assets`、`loanLogs`、`softwareAssets`、`virtualAssets`、`users`、`loanRequests`、`displayPreferences`、`sitePreferences`、`assetColumnPreferences`，以及服务端附加的 `initialized` 布尔值。软件资产、虚拟资产不存在时返回空数组。该接口返回原始 `users` 状态记录；与 `GET /api/users` 不同，原始记录包含服务端保存的 `passwordHash`，不要将其暴露给终端用户。

### `POST /api/state/initialize`

仅 `admin`。初始化尚未创建的持久化状态；若已初始化则保持原数据不变并返回当前状态。

**请求体必填字段**：`assets`、`loanLogs`、`displayPreferences`、`sitePreferences`。可选字段：`softwareAssets`、`virtualAssets`、`assetColumnPreferences`。

```json
{
  "assets": [],
  "loanLogs": [],
  "softwareAssets": [],
  "virtualAssets": [],
  "displayPreferences": {"theme":"light","density":"comfortable"},
  "sitePreferences": {
    "siteTitle":"毅弘资产云",
    "logoDataUrl":"",
    "adminDisplayName":"admin"
  },
  "assetColumnPreferences": {
    "hardware":["id","name","status"],
    "network":["id","name","status"],
    "server":["id","name","status"]
  }
}
```

响应为完整状态对象，并包含 `initialized: true`。

### `PATCH /api/state`

仅 `admin`。更新系统设置；请求体可包含以下任意一个或多个字段，其他字段会返回 `400`。

- `displayPreferences`：`{"theme":"light"|"dark","density":"comfortable"|"compact"}`
- `sitePreferences`：`{"siteTitle":"...","logoDataUrl":"","adminDisplayName":"..."}`
  - 标题必填且最多 50 字符；管理员显示名必填且最多 30 字符。
  - `logoDataUrl` 为空字符串或 PNG/JPEG/WebP 的 Base64 data URL，长度不超过 1,500,000 字符。
- `assetColumnPreferences`：按 `hardware`、`network`、`server` 分类存放列名数组的对象。

**成功响应**：`200` 返回更新后的完整状态。

### `POST /api/assets`

新增或按 `id` 覆盖硬件/通用资产。仅 `admin` / `manager`。必填字段见[资产对象](#资产对象)。

**成功响应**：`200` 返回更新后的资产数组。

### `DELETE /api/assets/{id}`

删除资产；路径中的编号须 URL 编码。

**成功响应**：`200` 返回删除后的资产数组。

### `POST /api/asset-transactions`

登记资产领用或归还。仅 `admin` / `manager`。

**请求体**

```json
{
  "asset": {
    "id":"HW-001",
    "name":"笔记本电脑",
    "category":"办公设备",
    "location":"A-01",
    "owner":"张三",
    "purchaseDate":"2026-01-01",
    "price":6000,
    "status":"在用",
    "borrower":"李四",
    "loanDate":"2026-11-12"
  },
  "action": "领用",
  "borrower": "李四"
}
```

`asset` 须为完整且有效的资产对象；`action` 为 `领用` 或 `归还`；`borrower` 必填。领用时资产对象的 `borrower` 须与请求的 `borrower` 一致，并提供有效 `loanDate`（`YYYY-MM-DD`）；如有 `dueDate`，不得早于领用日期。归还时服务端以当前资产记录为准。

**成功响应**

```json
{
  "assets": [],
  "log": {
    "id": "...",
    "action": "领用",
    "assetId": "HW-001",
    "assetName": "笔记本电脑",
    "borrower": "李四",
    "operator": "admin",
    "eventAt": "2026-11-12T09:00:00.000Z",
    "dueDate": ""
  }
}
```

不符合当前资产状态的操作返回 `409`。

### `POST /api/software-assets`

新增或按 `id` 覆盖软件资产。仅 `admin` / `manager`。请求体为完整[软件资产对象](#软件资产对象)。

**成功响应**：`200` 返回更新后的软件资产数组。

### `DELETE /api/software-assets/{id}`

删除软件资产。**成功响应**：`200` 返回删除后的软件资产数组。

### `POST /api/virtual-assets`

新增或按 `id` 覆盖虚拟资产。仅 `admin` / `manager`。请求体为完整[虚拟资产对象](#虚拟资产对象)。

**成功响应**：`200` 返回更新后的虚拟资产数组。

### `DELETE /api/virtual-assets/{id}`

删除虚拟资产。**成功响应**：`200` 返回删除后的虚拟资产数组。

## 6. 备份与清空（高影响操作）

### `PUT /api/snapshot`

仅 `admin`。导入并覆盖备份中的资产、借还日志；若提供 `softwareAssets` / `virtualAssets`，也同时覆盖对应列表。未提供这两个字段时保留现有列表。

**请求体**

```json
{
  "assets": [],
  "loanLogs": [],
  "softwareAssets": [],
  "virtualAssets": []
}
```

`assets`、`loanLogs` 必须提供且格式有效；软件和虚拟资产列表可选。成功返回更新后的完整状态。

### `POST /api/reset`

仅 `admin`。清空硬件资产、借还日志、软件资产和虚拟资产，**不清除用户、领用申请或系统设置**。

**成功响应**：`200 []`（空的资产数组）。

## 7. 数据对象

日期字段使用 `YYYY-MM-DD`；时间戳使用 ISO 8601 字符串。除特别注明外，可选字段缺省时可省略。

### 资产对象

必填：`id`（1–100 字符）、`name`、`category`、`location`、`owner`、`purchaseDate`（字符串），`price`（有限数值），`status`。允许状态：`在用`、`闲置`、`维修中`、`已报废`、`报废`、`在库`、`已领用`、`借出`。

可选字段：`assetClass`（`hardware` / `network` / `server` / `general`）、`brandModel`、`brand`、`model`、`serialNumber`、`supplier`、`warrantyExpiry`、`department`、`assetLocation`、`notes`、`condition`（`良好` / `维修中` / `已报废`）、`borrower`、`loanDate`、`dueDate`、`returned`（布尔值）、`deviceType`、`deviceName`、`macAddress`、`cpu`、`memory`、`storage`、`graphicsCard`、`operatingSystem`、`manager`、`hostname`、`managementIp`、`networkRole`、`vlan`、`ports`、`bandwidth`、`rackLocation`。除 `returned` 外，以上可选扩展字段为字符串。

### 软件资产对象

必填字段：

| 字段 | 类型 / 约束 |
|---|---|
| `id` | 字符串，1–100 字符 |
| `name` | 非空字符串，最多 100 字符 |
| `category` | `办公软件` / `设计软件` / `工具软件` |
| `version` | 字符串 |
| `licenseType` | `永久授权` / `年度订阅` / `破解版` |
| `licenseTotal`、`licenseUsed` | 非负整数，已用数不得超过总数 |
| `expiryDate` | 字符串；永久授权可为空字符串 |
| `supplier`、`assignedUsers`、`assignedDepartments` | 字符串 |
| `price` | 有限且非负数值 |
| `status` | `正常` / `即将到期` / `过期停用` |

可选字段：`supplierUrl`、`notes`、`purchaseDate`（字符串）。

### 虚拟资产对象

必填字段：`id`（1–100 字符）、`name`（非空且最多 100 字符）、`category`（`域名` / `企业邮箱` / `云服务器` / `云存储` / `系统账号` / `业务文件` / `SSL 证书`）、`account`、`expiryDate`、`manager`、`business`（字符串）、`status`（`正常` / `即将到期` / `已停用`），以及：

```json
{"reminder":{"enabled":true,"days":30}}
```

`reminder.enabled` 为布尔值，`reminder.days` 为 0–365 的整数。可选字段：`provider`、`notes`（字符串）和 `price`（有限数值）。

### 借还日志对象

`id`、`assetId`、`assetName`、`borrower`、`operator`、`eventAt`、`dueDate` 均为字符串；`action` 为 `领用` 或 `归还`。

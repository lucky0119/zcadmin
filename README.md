# zcadmin

栖点资产管理系统（Vue 3、Ant Design Vue、Node.js 与 MySQL）。前端通过 Node.js API 读写数据，MySQL 凭据仅在服务端配置，不会发送到浏览器。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
cp .env.example .env.local
```

编辑 `.env.local`，填写 MySQL 密码和 `ADMIN_PASSWORD`。MySQL 中需预先创建 `yhasset` 数据库，并确保数据库用户具有建表、查询、新增、更新及删除权限。服务首次连接时会自动创建资产、借还记录、设置和初始化状态表；旧版 `zcadmin_state` 表或 `data/site-data.json` 会在新表为空时迁移。资产与借还记录按记录分行保存，设置按类型存储；新数据库默认从空数据开始，不会自动写入演示资产。

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

`pnpm dev` 同时启动 Vite 前端和 Node.js API 服务。开发 API 默认监听 `3001` 端口，Vite 将 `/api` 请求代理到该服务；开发登录账号为 `admin`，密码由 `.env.local` 中的 `ADMIN_PASSWORD` 配置。

### Production Deployment

```sh
pnpm build
pnpm start
```

生产服务默认监听 `0.0.0.0:3000`，并同时提供构建后的前端和 `/api`。需要 Node.js `22.18+` 或 `24.12+`。请在运行环境或 `.env.local` 中配置 MySQL 连接变量以及强 `ADMIN_PASSWORD`；生产环境缺少 `ADMIN_PASSWORD` 时服务会拒绝启动。MySQL 默认端口为 `3306`；可用 `HOST`、`PORT` 和 `MYSQL_*` 变量调整服务及数据库连接。`DATA_FILE` 仅用于隔离的服务端 API 测试。

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
pnpm test:unit
```

### Run Node.js API Tests

```sh
pnpm test:server
```

### Run End-to-End Tests with [Playwright](https://playwright.dev)

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
pnpm build

# Runs the end-to-end tests
pnpm test:e2e
# Runs the tests only on Chromium
pnpm test:e2e --project=chromium
# Runs the tests of a specific file
pnpm test:e2e tests/example.spec.ts
# Runs the tests in debug mode
pnpm test:e2e --debug
```

### Lint with [ESLint](https://eslint.org/)

```sh
pnpm lint
```

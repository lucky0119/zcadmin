/**
 * 将模拟数据导入正在运行的资产管理服务（默认合并，不覆盖已有业务数据）
 * 用法：
 *   node scripts/import-mock-data.mjs                      # 合并导入到 http://127.0.0.1:3001
 *   BASE_URL=http://host:3000 ADMIN_PASSWORD=xxx node scripts/import-mock-data.mjs
 *   node scripts/import-mock-data.mjs --replace            # 用模拟数据整体替换（危险）
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3001'
const username = process.env.ADMIN_USER || 'admin'
const password = process.env.ADMIN_PASSWORD || 'admin'
const replace = process.argv.includes('--replace')
const source = resolve(projectRoot, 'data', 'mock-assets.json')

const seed = JSON.parse(await readFile(source, 'utf8'))

const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
})
if (!loginResponse.ok) {
  console.error(
    `登录失败：HTTP ${loginResponse.status}，请检查账号密码或将会话 Cookie 设置在 ADMIN_PASSWORD`,
  )
  process.exit(1)
}
const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0]
if (!cookie) {
  console.error('登录响应未返回会话 Cookie')
  process.exit(1)
}

const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, ...init.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(`${init.method ?? 'GET'} ${path} 失败：${body.error ?? response.status}`)
  return body
}

const current = await request('/api/state')
// 模拟数据以 seed 为准：同 id 覆盖，使脚本可重复执行且结果一致；用户自建记录原样保留
const merge = (existing, incoming) => {
  const byId = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) byId.set(item.id, item)
  return [...byId.values()]
}

const payload = replace
  ? {
      assets: seed.assets,
      loanLogs: seed.loanLogs,
      softwareAssets: seed.softwareAssets,
      virtualAssets: seed.virtualAssets,
    }
  : {
      assets: merge(current.assets ?? [], seed.assets),
      loanLogs: merge(current.loanLogs ?? [], seed.loanLogs),
      softwareAssets: merge(current.softwareAssets ?? [], seed.softwareAssets),
      virtualAssets: merge(current.virtualAssets ?? [], seed.virtualAssets),
    }

const result = await request('/api/snapshot', { method: 'PUT', body: JSON.stringify(payload) })
console.info(`${replace ? '已替换' : '已合并'}模拟数据：`)
console.info(`  硬件资产 ${result.assets.length} 条（其中模拟数据 ${seed.assets.length} 条）`)
console.info(`  软件资产 ${result.softwareAssets.length} 条`)
console.info(`  虚拟资产 ${result.virtualAssets.length} 条`)
console.info(`  借还日志 ${result.loanLogs.length} 条`)

import { readFile, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { config } from './config.mjs'
import { sendJson } from './http-helpers.mjs'

const contentTypeByExtension = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
])

export async function serveStatic(pathname, response) {
  let requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '')
  let file = resolve(config.distDirectory, requested)
  const rel = relative(config.distDirectory, file)
  if (rel.startsWith(`..${sep}`) || rel === '..') {
    sendJson(response, 400, { error: '无效的文件路径' })
    return true
  }
  try {
    if (!(await stat(file)).isFile()) file = join(config.distDirectory, 'index.html')
  } catch {
    file = join(config.distDirectory, 'index.html')
  }
  try {
    const contents = await readFile(file)
    response.writeHead(200, {
      'Content-Type': contentTypeByExtension.get(extname(file)) || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(contents)
    return true
  } catch {
    sendJson(response, 404, { error: '前端构建文件不存在，请先执行 pnpm build' })
    return true
  }
}

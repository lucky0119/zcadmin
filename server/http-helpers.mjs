import { config } from './config.mjs'

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

import { timingSafeEqual } from 'node:crypto'

export function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  response.end(value === undefined ? '' : JSON.stringify(value))
}

export async function readJson(request) {
  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (Buffer.byteLength(body) > config.maxBodyBytes) {
      throw httpError('请求内容过大', 413)
    }
  }
  try {
    return JSON.parse(body || '{}')
  } catch {
    throw httpError('请求 JSON 格式无效', 400)
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => {
        const index = part.indexOf('=')
        if (index < 0) return ['', '']
        return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]
      })
      .filter(([key]) => key),
  )
}

export function httpError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

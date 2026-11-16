import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { config } from './config.mjs'
import { parseCookies } from './http-helpers.mjs'

const sessions = new Map()

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  return safeCompare(scryptSync(password, salt, 32).toString('hex'), hash)
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function verifyAdminPassword(password) {
  const left = Buffer.from(password)
  const right = Buffer.from(config.adminPassword)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function createSession(username, role) {
  const token = randomBytes(32).toString('base64url')
  sessions.set(token, { username, role, expiresAt: Date.now() + config.sessionTtlMs })
  return token
}

export function destroySession(token) {
  if (token) sessions.delete(token)
}

export function getSession(request) {
  const token = parseCookies(request.headers.cookie)[config.sessionCookie]
  const session = token && sessions.get(token)
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token)
    return null
  }
  session.expiresAt = Date.now() + config.sessionTtlMs
  return { ...session, token }
}

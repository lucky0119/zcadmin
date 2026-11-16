import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const config = {
  projectRoot,
  dataFile: resolve(process.env.DATA_FILE || join(projectRoot, 'data', 'site-data.json')),
  useFileStorage: process.env.DATA_FILE !== undefined,
  distDirectory: join(projectRoot, 'dist'),
  port: Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3001)),
  host: process.env.HOST || '0.0.0.0',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  maxBodyBytes: 10 * 1024 * 1024,
  sessionTtlMs: 8 * 60 * 60 * 1000,
  sessionCookie: 'zcadmin_session',
}

/** 启动时集中校验环境配置，快速失败。 */
export function validateConfig() {
  if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
    throw new Error('Production requires a strong ADMIN_PASSWORD environment variable')
  }
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Using development login password. Set ADMIN_PASSWORD before deployment.')
  }
}

import { randomBytes } from 'node:crypto'
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { initializeMySqlState, mutateMySqlState, readMySqlState } from './mysql-state.mjs'
import { config } from './config.mjs'
import { isRecord } from './http-helpers.mjs'

export const defaultState = () => ({
  version: 1,
  assets: [],
  loanLogs: [],
  softwareAssets: [],
  virtualAssets: [],
  users: [],
  loanRequests: [],
  displayPreferences: { theme: 'light', density: 'comfortable' },
  sitePreferences: { siteTitle: '毅弘资产云', logoDataUrl: '', adminDisplayName: 'admin' },
  assetColumnPreferences: {
    hardware: ['id', 'name', 'deviceType', 'brand', 'model', 'owner', 'status'],
    network: ['id', 'name', 'networkRole', 'brand', 'model', 'managementIp', 'location', 'status'],
    server: ['id', 'name', 'hostname', 'brand', 'model', 'managementIp', 'status'],
  },
})

let state
let stateLoaded = false
let writeQueue = Promise.resolve()

async function loadState() {
  if (!config.useFileStorage) {
    const stored = await readMySqlState(defaultState, readLegacyState)
    return stored.state
  }
  if (stateLoaded) return state
  try {
    const text = await readFile(config.dataFile, 'utf8')
    const parsed = JSON.parse(text)
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.assets) ||
      !Array.isArray(parsed.loanLogs)
    ) {
      throw new Error('数据文件格式无效')
    }
    state = { ...defaultState(), ...parsed }
  } catch (error) {
    if (error.code === 'ENOENT') {
      state = defaultState()
      stateLoaded = true
      return state
    }
    throw error
  }
  stateLoaded = true
  return state
}

export async function readLegacyState() {
  try {
    const parsed = JSON.parse(await readFile(config.dataFile, 'utf8'))
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.assets) ||
      !Array.isArray(parsed.loanLogs)
    ) {
      throw new Error('旧数据文件格式无效，未迁移任何数据')
    }
    return { ...defaultState(), ...parsed }
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export async function readStoredState() {
  if (!config.useFileStorage) return readMySqlState(defaultState, readLegacyState)

  await writeQueue
  const current = await loadState()
  let initialized = true
  try {
    await access(config.dataFile)
  } catch (error) {
    if (error.code === 'ENOENT') initialized = false
    else throw error
  }
  return { state: current, initialized }
}

async function persistState(next) {
  await mkdir(dirname(config.dataFile), { recursive: true })
  const temporary = `${config.dataFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    await rename(temporary, config.dataFile)
  } catch (error) {
    const cleanupError = await import('node:fs/promises').then(({ unlink }) =>
      unlink(temporary).catch((cause) => {
        if (cause.code !== 'ENOENT') throw cause
      }),
    )
    if (cleanupError) throw cleanupError
    throw error
  }
}

export async function mutateState(mutator) {
  if (!config.useFileStorage) {
    return mutateMySqlState(defaultState, readLegacyState, mutator)
  }
  const operation = writeQueue.then(async () => {
    const current = await loadState()
    const next = structuredClone(current)
    const result = await mutator(next)
    await persistState(next)
    state = next
    stateLoaded = true
    return result
  })
  writeQueue = operation.then(
    () => undefined,
    () => undefined,
  )
  return operation
}

export async function initializeStoredState(next) {
  if (!config.useFileStorage) {
    return initializeMySqlState(defaultState, readLegacyState, next)
  }
  await mutateState((draft) => Object.assign(draft, next))
  return { state: next, initialized: true }
}

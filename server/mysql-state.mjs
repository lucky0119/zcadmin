import mysql from 'mysql2/promise'

const tables = {
  assets: 'zcadmin_assets',
  logs: 'zcadmin_loan_logs',
  settings: 'zcadmin_settings',
  metadata: 'zcadmin_metadata',
  legacy: 'zcadmin_state',
}
const settingKeys = [
  'displayPreferences',
  'sitePreferences',
  'assetColumnPreferences',
  'users',
  'loanRequests',
  'softwareAssets',
  'virtualAssets',
]

let pool
let setup

function getPool() {
  if (pool) return pool

  const { MYSQL_HOST, MYSQL_PORT = '3306', MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD } = process.env
  if (!MYSQL_HOST || !MYSQL_DATABASE || !MYSQL_USER || MYSQL_PASSWORD === undefined) {
    throw new Error('MySQL 配置不完整，请设置 MYSQL_HOST、MYSQL_DATABASE、MYSQL_USER 和 MYSQL_PASSWORD')
  }
  const port = Number(MYSQL_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT 配置无效')

  pool = mysql.createPool({
    host: MYSQL_HOST,
    port,
    database: MYSQL_DATABASE,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
  })
  return pool
}

function parseJson(value, label) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch (cause) {
    throw new Error(`MySQL 中的${label}数据格式无效`, { cause })
  }
}

function parseState(rows, defaultState, initialized) {
  const state = defaultState()
  state.assets = rows.assets.map((row) => parseJson(row.asset_json, '资产'))
  state.loanLogs = rows.logs.map((row) => parseJson(row.log_json, '借还记录'))

  for (const row of rows.settings) {
    if (settingKeys.includes(row.setting_key)) {
      state[row.setting_key] = parseJson(row.setting_json, '设置')
    }
  }
  // 兼容升级前只有 5 个设置项的历史库
  if (!Array.isArray(state.softwareAssets)) state.softwareAssets = []
  if (!Array.isArray(state.virtualAssets)) state.virtualAssets = []
  return { state, initialized: Boolean(initialized) }
}

async function insertState(connection, state, initialized) {
  for (const [position, asset] of state.assets.entries()) {
    await connection.query(
      `INSERT INTO ${tables.assets} (asset_id, position, asset_json) VALUES (?, ?, ?)`,
      [asset.id, position, JSON.stringify(asset)],
    )
  }
  for (const [position, log] of state.loanLogs.entries()) {
    await connection.query(
      `INSERT INTO ${tables.logs} (log_id, position, log_json) VALUES (?, ?, ?)`,
      [log.id, position, JSON.stringify(log)],
    )
  }
  for (const key of settingKeys) {
    await connection.query(
      `INSERT INTO ${tables.settings} (setting_key, setting_json) VALUES (?, ?)`,
      [key, JSON.stringify(state[key])],
    )
  }
  await connection.query(`UPDATE ${tables.metadata} SET initialized = ? WHERE id = 1`, [initialized ? 1 : 0])
}

async function readLegacyState(connection, defaultState, readLegacyFile) {
  const [legacyTables] = await connection.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [tables.legacy],
  )
  if (legacyTables.length) {
    const [rows] = await connection.query(`SELECT state_json, initialized FROM ${tables.legacy} WHERE id = 1`)
    if (rows.length) {
      const legacy = parseJson(rows[0].state_json, '旧数据')
      return {
        state: { ...defaultState(), ...legacy },
        initialized: Boolean(rows[0].initialized),
      }
    }
  }

  const fileState = await readLegacyFile()
  return fileState ? { state: fileState, initialized: true } : null
}

async function setupTables(defaultState, readLegacyFile) {
  const connectionPool = getPool()
  await connectionPool.query(`
    CREATE TABLE IF NOT EXISTS ${tables.assets} (
      asset_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
      position INT NOT NULL,
      asset_json JSON NOT NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await connectionPool.query(`
    CREATE TABLE IF NOT EXISTS ${tables.logs} (
      log_id VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
      position INT NOT NULL,
      log_json JSON NOT NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await connectionPool.query(`
    CREATE TABLE IF NOT EXISTS ${tables.settings} (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_json JSON NOT NULL
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await connectionPool.query(`
    CREATE TABLE IF NOT EXISTS ${tables.metadata} (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      initialized TINYINT(1) NOT NULL DEFAULT 0
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await connectionPool.query(
    `INSERT IGNORE INTO ${tables.metadata} (id, initialized) VALUES (1, 0)`,
  )

  const connection = await connectionPool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query(
      `SELECT initialized FROM ${tables.metadata} WHERE id = 1 FOR UPDATE`,
    )
    const [assets] = await connection.query(`SELECT COUNT(*) AS count FROM ${tables.assets}`)
    const [logs] = await connection.query(`SELECT COUNT(*) AS count FROM ${tables.logs}`)
    const [settings] = await connection.query(`SELECT COUNT(*) AS count FROM ${tables.settings}`)
    const empty = Number(assets[0].count) === 0 && Number(logs[0].count) === 0 && Number(settings[0].count) === 0

    if (rows.length && empty) {
      const legacy = await readLegacyState(connection, defaultState, readLegacyFile)
      if (legacy) await insertState(connection, legacy.state, legacy.initialized)
      else {
        const defaults = defaultState()
        for (const key of settingKeys) {
          await connection.query(
            `INSERT INTO ${tables.settings} (setting_key, setting_json) VALUES (?, ?)`,
            [key, JSON.stringify(defaults[key])],
          )
        }
      }
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function prepare(defaultState, readLegacyFile) {
  if (!setup) {
    setup = setupTables(defaultState, readLegacyFile).catch((error) => {
      setup = undefined
      throw error
    })
  }
  await setup
}

async function queryState(connection) {
  const [[metadata]] = await connection.query(`SELECT initialized FROM ${tables.metadata} WHERE id = 1`)
  if (!metadata) throw new Error('MySQL 数据库初始化记录不存在')
  const [assets] = await connection.query(`SELECT asset_id, asset_json FROM ${tables.assets} ORDER BY position, asset_id`)
  const [logs] = await connection.query(`SELECT log_id, log_json FROM ${tables.logs} ORDER BY position, log_id`)
  const [settings] = await connection.query(`SELECT setting_key, setting_json FROM ${tables.settings}`)
  return { assets, logs, settings, initialized: metadata.initialized }
}

async function saveChanges(connection, current, next) {
  const saveCollection = async (table, idField, jsonField, records) => {
    const nextIds = new Set(records.map((record) => record.id))
    const currentRows = new Map(current[table].map((row, position) => [row[idField], { row, position }]))
    for (const row of current[table]) {
      if (!nextIds.has(row[idField])) {
        await connection.query(`DELETE FROM ${tables[table]} WHERE ${idField} = ?`, [row[idField]])
      }
    }
    for (const [position, record] of records.entries()) {
      const saved = currentRows.get(record.id)
      const currentRecord = saved && parseJson(saved.row[jsonField], table === 'assets' ? '资产' : '借还记录')
      if (saved && saved.position === position && JSON.stringify(currentRecord) === JSON.stringify(record)) continue
      await connection.query(
        `INSERT INTO ${tables[table]} (${idField}, position, ${jsonField}) VALUES (?, ?, ?) `
          + `ON DUPLICATE KEY UPDATE position = VALUES(position), ${jsonField} = VALUES(${jsonField})`,
        [record.id, position, JSON.stringify(record)],
      )
    }
  }

  await saveCollection('assets', 'asset_id', 'asset_json', next.assets)
  await saveCollection('logs', 'log_id', 'log_json', next.loanLogs)
  for (const key of settingKeys) {
    await connection.query(
      `INSERT INTO ${tables.settings} (setting_key, setting_json) VALUES (?, ?) `
        + 'ON DUPLICATE KEY UPDATE setting_json = VALUES(setting_json)',
      [key, JSON.stringify(next[key])],
    )
  }
  await connection.query(`UPDATE ${tables.metadata} SET initialized = 1 WHERE id = 1`)
}

export async function readMySqlState(defaultState, readLegacyFile) {
  await prepare(defaultState, readLegacyFile)
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const current = await queryState(connection)
    await connection.commit()
    return parseState(current, defaultState, current.initialized)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function mutateMySqlState(defaultState, readLegacyFile, mutator) {
  await prepare(defaultState, readLegacyFile)
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [metadata] = await connection.query(
      `SELECT initialized FROM ${tables.metadata} WHERE id = 1 FOR UPDATE`,
    )
    if (!metadata.length) throw new Error('MySQL 数据库初始化记录不存在')
    const rows = await queryState(connection)
    const current = parseState(rows, defaultState, rows.initialized)
    const next = structuredClone(current.state)
    const result = await mutator(next)
    await saveChanges(connection, rows, next)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function initializeMySqlState(defaultState, readLegacyFile, initialState) {
  await prepare(defaultState, readLegacyFile)
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const [metadata] = await connection.query(
      `SELECT initialized FROM ${tables.metadata} WHERE id = 1 FOR UPDATE`,
    )
    if (!metadata.length) throw new Error('MySQL 数据库初始化记录不存在')
    if (!metadata[0].initialized) {
      const rows = await queryState(connection)
      await saveChanges(connection, rows, initialState)
      await connection.commit()
      return { state: initialState, initialized: true }
    }
    const rows = await queryState(connection)
    await connection.commit()
    return parseState(rows, defaultState, rows.initialized)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

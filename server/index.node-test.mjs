import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function findPort() {
  const listener = createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('Unable to allocate a test port')
  await new Promise((resolveClose, rejectClose) => listener.close((error) => error ? rejectClose(error) : resolveClose()))
  return address.port
}

async function startServer(port, dataFile) {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      DATA_FILE: dataFile,
      ADMIN_PASSWORD: 'test-password',
    },
    stdio: 'ignore',
  })
  const baseUrl = `http://127.0.0.1:${port}`
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test server exited with code ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return { child, baseUrl }
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
    }
  }
  child.kill()
  throw new Error('Test server did not start')
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'exit')
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'test-password' }),
  })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
  assert.ok(cookie)
  return cookie
}

test('authenticated API persists JSON data across server restarts', async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'zcadmin-server-test-'))
  const dataFile = join(dataDirectory, 'site-data.json')
  const port = await findPort()
  let running = await startServer(port, dataFile)

  try {
    const unauthenticatedSession = await fetch(`${running.baseUrl}/api/auth/session`)
    assert.deepEqual(await unauthenticatedSession.json(), { authenticated: false })
    const unauthorizedState = await fetch(`${running.baseUrl}/api/state`)
    assert.equal(unauthorizedState.status, 401)

    const badLogin = await fetch(`${running.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    })
    assert.equal(badLogin.status, 401)

    let cookie = await login(running.baseUrl)
    const initialized = await fetch(`${running.baseUrl}/api/state/initialize`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assets: [],
        loanLogs: [],
        displayPreferences: { theme: 'light', density: 'comfortable' },
        sitePreferences: { siteTitle: '测试资产站点', logoDataUrl: '', adminDisplayName: '测试管理员' },
        assetColumnPreferences: { hardware: ['id'], network: ['id'], server: ['id'] },
      }),
    })
    assert.equal(initialized.status, 200)

    const asset = {
      id: 'SRV-TEST-1',
      name: '持久化测试服务器',
      category: '服务器',
      assetClass: 'server',
      location: '测试机房',
      owner: '平台组',
      purchaseDate: '2025-01-01',
      price: 2000,
      status: '在用',
    }
    const created = await fetch(`${running.baseUrl}/api/assets`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(asset),
    })
    assert.equal(created.status, 200)

    const updatedAsset = { ...asset, name: '已更新测试服务器' }
    const updated = await fetch(`${running.baseUrl}/api/assets`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedAsset),
    })
    assert.equal(updated.status, 200)

    const checkoutAsset = {
      ...updatedAsset,
      borrower: '测试借用人',
      loanDate: '2026-11-11',
      dueDate: '2026-11-20',
      returned: false,
    }
    const checkout = await fetch(`${running.baseUrl}/api/asset-transactions`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: checkoutAsset, action: '领用', borrower: '测试借用人' }),
    })
    assert.equal(checkout.status, 200)

    const duplicateCheckout = await fetch(`${running.baseUrl}/api/asset-transactions`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: checkoutAsset, action: '领用', borrower: '测试借用人' }),
    })
    assert.equal(duplicateCheckout.status, 409)

    const returnedAsset = { ...checkoutAsset, borrower: '', loanDate: '', dueDate: '', returned: true }
    const returned = await fetch(`${running.baseUrl}/api/asset-transactions`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset: returnedAsset, action: '归还', borrower: '测试借用人' }),
    })
    assert.equal(returned.status, 200)

    const settings = await fetch(`${running.baseUrl}/api/state`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sitePreferences: {
          siteTitle: '已更新资产站点',
          logoDataUrl: '',
          adminDisplayName: '测试管理员',
        },
      }),
    })
    assert.equal(settings.status, 200)

    const stateFile = JSON.parse(await readFile(dataFile, 'utf8'))
    assert.deepEqual(stateFile.assets, [returnedAsset])
    assert.equal(stateFile.loanLogs.length, 2)

    await stopServer(running.child)
    running = await startServer(port, dataFile)
    cookie = await login(running.baseUrl)
    const persistedResponse = await fetch(`${running.baseUrl}/api/state`, { headers: { Cookie: cookie } })
    assert.equal(persistedResponse.status, 200)
    const persisted = await persistedResponse.json()
    assert.equal(persisted.sitePreferences.siteTitle, '已更新资产站点')
    assert.deepEqual(persisted.assets, [returnedAsset])
    assert.equal(persisted.loanLogs.length, 2)

    const deleted = await fetch(`${running.baseUrl}/api/assets/${asset.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })
    assert.equal(deleted.status, 200)
    const finalState = await fetch(`${running.baseUrl}/api/state`, { headers: { Cookie: cookie } })
    assert.deepEqual((await finalState.json()).assets, [])
  } finally {
    await stopServer(running.child)
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

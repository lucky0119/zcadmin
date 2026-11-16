import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assetApi, assetStorageApi, type Asset, type AssetSnapshot } from '../assetApi'

const sampleAsset: Asset = {
  id: 'TEST-001',
  name: '测试资产',
  category: '显示器',
  assetClass: 'hardware',
  location: '测试地点',
  owner: '测试用户',
  purchaseDate: '2025-01-01',
  price: 100,
  status: '在用',
  condition: '良好',
  returned: true,
}

let assets: Asset[] = []
let loanLogs: unknown[] = []

beforeEach(() => {
  assets = []
  loanLogs = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost')
      if (url.pathname === '/api/state' && (!init?.method || init.method === 'GET')) {
        return Response.json({
          initialized: true,
          assets,
          loanLogs,
          displayPreferences: { theme: 'light', density: 'comfortable' },
          sitePreferences: { siteTitle: '测试', logoDataUrl: '', adminDisplayName: 'admin' },
          assetColumnPreferences: {},
        })
      }
      if (url.pathname === '/api/assets' && init?.method === 'POST') {
        const asset = JSON.parse(String(init.body)) as Asset
        const index = assets.findIndex((saved) => saved.id === asset.id)
        if (index < 0) assets.unshift(asset)
        else assets[index] = asset
        return Response.json(assets)
      }
      if (url.pathname.startsWith('/api/assets/') && init?.method === 'DELETE') {
        const id = decodeURIComponent(url.pathname.slice('/api/assets/'.length))
        assets = assets.filter((asset) => asset.id !== id)
        return Response.json(assets)
      }
      if (url.pathname === '/api/snapshot' && init?.method === 'PUT') {
        const snapshot = JSON.parse(String(init.body)) as AssetSnapshot
        assets = snapshot.assets
        loanLogs = snapshot.loanLogs
        return Response.json({ assets, loanLogs })
      }
      if (url.pathname === '/api/reset' && init?.method === 'POST') {
        assets = []
        loanLogs = []
        return Response.json(assets)
      }
      throw new Error(`Unexpected API request: ${init?.method ?? 'GET'} ${url.pathname}`)
    }),
  )
})

describe('server-backed asset storage', () => {
  it('creates, updates, and removes hardware, network, and server assets', async () => {
    const classes: Array<NonNullable<Asset['assetClass']>> = ['hardware', 'network', 'server']
    await Promise.all(
      classes.map((assetClass) =>
        assetApi.save({
          ...sampleAsset,
          id: `TEST-${assetClass}`,
          assetClass,
        }),
      ),
    )

    const createdAssets = (await assetApi.list()).filter((asset) => asset.id.startsWith('TEST-'))
    expect(createdAssets.map((asset) => asset.assetClass).sort()).toEqual([...classes].sort())

    await assetApi.save({
      ...sampleAsset,
      id: 'TEST-network',
      assetClass: 'network',
      name: '已更新网络设备',
    })
    expect((await assetApi.list()).find((asset) => asset.id === 'TEST-network')?.name).toBe(
      '已更新网络设备',
    )

    await assetApi.remove('TEST-server')
    expect(
      (await assetApi.list())
        .filter((asset) => asset.id.startsWith('TEST-'))
        .map((asset) => asset.id),
    ).toEqual(['TEST-network', 'TEST-hardware'])
  })

  it('imports a snapshot as the complete server dataset', async () => {
    const snapshot: AssetSnapshot = {
      version: 2,
      exportedAt: new Date().toISOString(),
      assets: [sampleAsset],
      loanLogs: [],
      softwareAssets: [],
      virtualAssets: [],
    }

    await assetStorageApi.importSnapshot(snapshot)

    expect((await assetApi.list()).map((asset) => asset.id)).toEqual(['TEST-001'])
  })

  it('imports a v1 snapshot and defaults the software and virtual collections', async () => {
    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      assets: [sampleAsset],
      loanLogs: [],
    }

    const imported = await assetStorageApi.importSnapshot(snapshot)

    expect(imported.softwareAssets).toEqual([])
    expect((await assetApi.list()).map((asset) => asset.id)).toEqual(['TEST-001'])
  })

  it('rejects an invalid snapshot without changing existing data', async () => {
    assets = [sampleAsset]
    const invalidSnapshot = {
      version: 3,
      exportedAt: new Date().toISOString(),
      assets: [],
      loanLogs: [],
    }

    await expect(assetStorageApi.importSnapshot(invalidSnapshot)).rejects.toThrow(
      '备份文件格式不正确',
    )
    expect((await assetApi.list()).map((asset) => asset.id)).toEqual(['TEST-001'])
  })

  it('clears database assets and loan logs', async () => {
    assets = [sampleAsset]
    loanLogs = [{ id: 'log-1' }]

    expect(await assetStorageApi.clearAll()).toEqual([])
    expect(loanLogs).toEqual([])
  })
})

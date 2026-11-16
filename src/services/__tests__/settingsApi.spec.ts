import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sitePreferences, sitePreferencesApi } from '../settingsApi'

let savedSitePreferences = {
  siteTitle: '毅弘资产云',
  logoDataUrl: '',
  adminDisplayName: 'admin',
}

beforeEach(() => {
  savedSitePreferences = {
    siteTitle: '毅弘资产云',
    logoDataUrl: '',
    adminDisplayName: 'admin',
  }
  Object.assign(sitePreferences, savedSitePreferences)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input.toString(), 'http://localhost')
      if (url.pathname === '/api/state' && (!init?.method || init.method === 'GET')) {
        return Response.json({
          initialized: true,
          assets: [],
          loanLogs: [],
          displayPreferences: { theme: 'light', density: 'comfortable' },
          sitePreferences: savedSitePreferences,
          assetColumnPreferences: {},
        })
      }
      if (url.pathname === '/api/state' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as {
          sitePreferences: typeof savedSitePreferences
        }
        savedSitePreferences = body.sitePreferences
        return Response.json(savedSitePreferences)
      }
      throw new Error(`Unexpected API request: ${init?.method ?? 'GET'} ${url.pathname}`)
    }),
  )
})

describe('sitePreferencesApi', () => {
  it('saves and restores site title, logo, and administrator display name', async () => {
    const next = {
      siteTitle: '资产管理平台',
      logoDataUrl: 'data:image/png;base64,ZmFrZQ==',
      adminDisplayName: '张管理员',
    }

    await sitePreferencesApi.save(next)

    sitePreferences.siteTitle = 'changed'
    expect(await sitePreferencesApi.load()).toBeNull()
    expect(sitePreferences).toEqual(next)
  })

  it('rejects invalid titles and unsupported logo formats', async () => {
    await expect(
      sitePreferencesApi.save({
        siteTitle: ' ',
        logoDataUrl: '',
        adminDisplayName: 'admin',
      }),
    ).rejects.toThrow('网站标题需填写')

    await expect(
      sitePreferencesApi.save({
        siteTitle: '资产管理平台',
        logoDataUrl: 'data:image/svg+xml;base64,ZmFrZQ==',
        adminDisplayName: 'admin',
      }),
    ).rejects.toThrow('网站 Logo 格式无效')
  })
})

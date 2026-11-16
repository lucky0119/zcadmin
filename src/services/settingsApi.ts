import { reactive } from 'vue'
import { apiRequest, jsonRequest } from './apiClient'
import { getServerState, initializeServerData } from './assetApi'

export type ThemeMode = 'light' | 'dark'
export type DisplayDensity = 'comfortable' | 'compact'

export interface DisplayPreferences {
  theme: ThemeMode
  density: DisplayDensity
}

export interface SitePreferences {
  siteTitle: string
  logoDataUrl: string
  adminDisplayName: string
}

type AssetColumnPreferences = Record<'hardware' | 'network' | 'server', string[]>

const defaultDisplayPreferences: DisplayPreferences = { theme: 'light', density: 'comfortable' }
const defaultSitePreferences: SitePreferences = {
  siteTitle: '毅弘资产云',
  logoDataUrl: '',
  adminDisplayName: 'admin',
}

export const displayPreferences = reactive<DisplayPreferences>({ ...defaultDisplayPreferences })
export const sitePreferences = reactive<SitePreferences>({ ...defaultSitePreferences })

export const displayPreferencesApi = {
  async load(): Promise<string | null> {
    try {
      const state = await getServerState()
      Object.assign(displayPreferences, state.displayPreferences)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : '读取显示设置失败'
    }
  },

  async save(next: DisplayPreferences): Promise<void> {
    await initializeServerData()
    await apiRequest('/api/state', jsonRequest('PATCH', { displayPreferences: next }))
    Object.assign(displayPreferences, next)
  },
}

export const sitePreferencesApi = {
  async loadPublic(): Promise<string | null> {
    try {
      const values = await apiRequest<Pick<SitePreferences, 'siteTitle' | 'logoDataUrl'>>(
        '/api/public/site-preferences',
      )
      sitePreferences.siteTitle = values.siteTitle
      sitePreferences.logoDataUrl = values.logoDataUrl
      return null
    } catch (error) {
      return error instanceof Error ? error.message : '读取网站设置失败'
    }
  },

  async load(): Promise<string | null> {
    try {
      const state = await getServerState()
      Object.assign(sitePreferences, state.sitePreferences)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : '读取站点设置失败'
    }
  },

  async save(next: SitePreferences): Promise<void> {
    if (!next.siteTitle.trim() || next.siteTitle.length > 50)
      throw new Error('网站标题需填写且不能超过 50 个字符')
    if (!next.adminDisplayName.trim() || next.adminDisplayName.length > 30) {
      throw new Error('管理员显示名称需填写且不能超过 30 个字符')
    }
    if (
      next.logoDataUrl !== '' &&
      (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(next.logoDataUrl) ||
        next.logoDataUrl.length > 1_500_000)
    ) {
      throw new Error('网站 Logo 格式无效或文件过大')
    }
    await initializeServerData()
    await apiRequest('/api/state', jsonRequest('PATCH', { sitePreferences: next }))
    Object.assign(sitePreferences, next)
  },
}

export const assetColumnPreferencesApi = {
  async load(): Promise<AssetColumnPreferences> {
    const state = await getServerState()
    return state.assetColumnPreferences as AssetColumnPreferences
  },

  async save(next: AssetColumnPreferences): Promise<void> {
    await initializeServerData()
    await apiRequest('/api/state', jsonRequest('PATCH', { assetColumnPreferences: next }))
  },
}

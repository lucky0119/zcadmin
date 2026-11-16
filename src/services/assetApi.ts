import { apiRequest, jsonRequest } from './apiClient'
import type { LoanRequest } from './loanRequestApi'
import type { HardwareAsset, SoftwareAsset, VirtualAsset } from './assetTypes'

export type AssetStatus = '在用' | '闲置' | '维修中' | '已报废' | '报废'
export type { HardwareAsset, SoftwareAsset, VirtualAsset }

export interface Asset extends Omit<HardwareAsset, 'status'> {
  status: AssetStatus
}

export type AssetLoanAction = '领用' | '归还'

export interface AssetLoanLog {
  id: string
  action: AssetLoanAction
  assetId: string
  assetName: string
  borrower: string
  operator: string
  eventAt: string
  dueDate: string
}

interface ServerState {
  assets: Asset[]
  loanLogs: AssetLoanLog[]
  softwareAssets: SoftwareAsset[]
  virtualAssets: VirtualAsset[]
  displayPreferences: { theme: 'light' | 'dark'; density: 'comfortable' | 'compact' }
  sitePreferences: { siteTitle: string; logoDataUrl: string; adminDisplayName: string }
  assetColumnPreferences: Record<string, string[]>
  initialized: boolean
}

let initialization: Promise<void> | null = null

export function initializeServerData(): Promise<void> {
  if (!initialization) {
    initialization = (async () => {
      const current = await apiRequest<ServerState>('/api/state')
      if (!current.initialized) {
        await apiRequest(
          '/api/state/initialize',
          jsonRequest('POST', {
            assets: [],
            loanLogs: [],
            softwareAssets: [],
            virtualAssets: [],
            displayPreferences: { theme: 'light', density: 'comfortable' },
            sitePreferences: {
              siteTitle: '毅弘资产云',
              logoDataUrl: '',
              adminDisplayName: 'admin',
            },
            assetColumnPreferences: {
              hardware: ['id', 'name', 'deviceType', 'brand', 'model', 'owner', 'status'],
              network: [
                'id',
                'name',
                'networkRole',
                'brand',
                'model',
                'managementIp',
                'location',
                'status',
              ],
              server: ['id', 'name', 'hostname', 'brand', 'model', 'managementIp', 'status'],
            },
          }),
        )
      }
    })().catch((error: unknown) => {
      initialization = null
      throw error
    })
  }
  return initialization
}

export async function getServerState(): Promise<ServerState> {
  await initializeServerData()
  return apiRequest<ServerState>('/api/state')
}

export interface UserState {
  assets: Asset[]
  loanRequests: LoanRequest[]
  displayPreferences: ServerState['displayPreferences']
  sitePreferences: ServerState['sitePreferences']
}

/** 普通用户视角的数据：仅包含可领用资产的摘要字段与本人领用申请 */
export function getUserState(): Promise<UserState> {
  return apiRequest<UserState>('/api/user/state')
}

export const assetApi = {
  async list(): Promise<Asset[]> {
    return (await getServerState()).assets
  },

  async save(asset: Asset): Promise<Asset[]> {
    await initializeServerData()
    return apiRequest<Asset[]>('/api/assets', jsonRequest('POST', asset))
  },

  async remove(id: string): Promise<Asset[]> {
    await initializeServerData()
    return apiRequest<Asset[]>(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
}

export const assetLoanLogApi = {
  async list(): Promise<AssetLoanLog[]> {
    return (await getServerState()).loanLogs
  },

  async saveTransaction(
    asset: Asset,
    action: AssetLoanAction,
    borrower: string,
  ): Promise<{ assets: Asset[]; log: AssetLoanLog }> {
    await initializeServerData()
    return apiRequest('/api/asset-transactions', jsonRequest('POST', { asset, action, borrower }))
  },
}

export const softwareAssetApi = {
  async list(): Promise<SoftwareAsset[]> {
    return (await getServerState()).softwareAssets ?? []
  },

  async save(asset: SoftwareAsset): Promise<SoftwareAsset[]> {
    await initializeServerData()
    return apiRequest<SoftwareAsset[]>('/api/software-assets', jsonRequest('POST', asset))
  },

  async remove(id: string): Promise<SoftwareAsset[]> {
    await initializeServerData()
    return apiRequest<SoftwareAsset[]>(`/api/software-assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

export const virtualAssetApi = {
  async list(): Promise<VirtualAsset[]> {
    return (await getServerState()).virtualAssets ?? []
  },

  async save(asset: VirtualAsset): Promise<VirtualAsset[]> {
    await initializeServerData()
    return apiRequest<VirtualAsset[]>('/api/virtual-assets', jsonRequest('POST', asset))
  },

  async remove(id: string): Promise<VirtualAsset[]> {
    await initializeServerData()
    return apiRequest<VirtualAsset[]>(`/api/virtual-assets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}

export interface AssetSnapshot {
  version: 2
  exportedAt: string
  assets: Asset[]
  loanLogs: AssetLoanLog[]
  softwareAssets: SoftwareAsset[]
  virtualAssets: VirtualAsset[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const optionalAssetStrings = [
  'deviceType',
  'brand',
  'model',
  'brandModel',
  'serialNumber',
  'deviceName',
  'macAddress',
  'cpu',
  'memory',
  'storage',
  'graphicsCard',
  'operatingSystem',
  'department',
  'warrantyExpiry',
  'manager',
  'notes',
  'borrower',
  'loanDate',
  'dueDate',
  'hostname',
  'managementIp',
  'networkRole',
  'vlan',
  'ports',
  'bandwidth',
  'rackLocation',
  'supplier',
  'assetLocation',
]

function isAsset(value: unknown): value is Asset {
  if (!isRecord(value)) return false
  const strings = ['id', 'name', 'category', 'location', 'owner', 'purchaseDate']
  return (
    strings.every((key) => typeof value[key] === 'string') &&
    typeof value.price === 'number' &&
    Number.isFinite(value.price) &&
    ['在用', '闲置', '维修中', '已报废', '报废', '在库', '已领用', '借出'].includes(
      String(value.status),
    ) &&
    (value.assetClass === undefined ||
      ['hardware', 'network', 'server', 'general'].includes(String(value.assetClass))) &&
    (value.condition === undefined ||
      ['良好', '维修中', '已报废'].includes(String(value.condition))) &&
    (value.returned === undefined || typeof value.returned === 'boolean') &&
    optionalAssetStrings.every((key) => value[key] === undefined || typeof value[key] === 'string')
  )
}

function isAssetLoanLog(value: unknown): value is AssetLoanLog {
  if (!isRecord(value)) return false
  return (
    ['id', 'assetId', 'assetName', 'borrower', 'operator', 'eventAt', 'dueDate'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    (value.action === '领用' || value.action === '归还') &&
    !Number.isNaN(Date.parse(String(value.eventAt)))
  )
}

export function isSoftwareAsset(value: unknown): value is SoftwareAsset {
  if (!isRecord(value)) return false
  return (
    [
      'id',
      'name',
      'category',
      'version',
      'licenseType',
      'expiryDate',
      'supplier',
      'assignedUsers',
      'assignedDepartments',
      'status',
    ].every((key) => typeof value[key] === 'string') &&
    ['办公软件', '设计软件', '工具软件'].includes(String(value.category)) &&
    ['永久授权', '年度订阅', '破解版'].includes(String(value.licenseType)) &&
    ['正常', '即将到期', '过期停用'].includes(String(value.status)) &&
    typeof value.licenseTotal === 'number' &&
    typeof value.licenseUsed === 'number' &&
    typeof value.price === 'number'
  )
}

export function isVirtualAsset(value: unknown): value is VirtualAsset {
  if (!isRecord(value)) return false
  return (
    ['id', 'name', 'category', 'account', 'expiryDate', 'manager', 'business', 'status'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    ['正常', '即将到期', '已停用'].includes(String(value.status)) &&
    isRecord(value.reminder) &&
    typeof value.reminder.enabled === 'boolean' &&
    typeof value.reminder.days === 'number'
  )
}

export const assetStorageApi = {
  async exportSnapshot(): Promise<AssetSnapshot> {
    const state = await getServerState()
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      assets: state.assets,
      loanLogs: state.loanLogs,
      softwareAssets: state.softwareAssets ?? [],
      virtualAssets: state.virtualAssets ?? [],
    }
  },

  async importSnapshot(input: unknown): Promise<AssetSnapshot> {
    if (
      !isRecord(input) ||
      (input.version !== 1 && input.version !== 2) ||
      typeof input.exportedAt !== 'string' ||
      Number.isNaN(Date.parse(input.exportedAt)) ||
      !Array.isArray(input.assets) ||
      !Array.isArray(input.loanLogs)
    ) {
      throw new Error('备份文件格式不正确或版本不受支持')
    }
    const softwareAssets =
      input.version === 2 && Array.isArray(input.softwareAssets) ? input.softwareAssets : []
    const virtualAssets =
      input.version === 2 && Array.isArray(input.virtualAssets) ? input.virtualAssets : []
    if (!input.assets.every(isAsset) || !input.loanLogs.every(isAssetLoanLog)) {
      throw new Error('备份文件包含格式无效的资产或借还日志')
    }
    if (!softwareAssets.every(isSoftwareAsset) || !virtualAssets.every(isVirtualAsset)) {
      throw new Error('备份文件包含格式无效的软件或虚拟资产')
    }
    const ids = input.assets.map((asset) => asset.id)
    if (new Set(ids).size !== ids.length) throw new Error('备份文件包含重复的资产编号')
    if (new Set(softwareAssets.map((asset) => asset.id)).size !== softwareAssets.length) {
      throw new Error('备份文件包含重复的软件资产编号')
    }
    if (new Set(virtualAssets.map((asset) => asset.id)).size !== virtualAssets.length) {
      throw new Error('备份文件包含重复的虚拟资源编号')
    }

    await initializeServerData()
    const assets = input.assets
    const loanLogs = input.loanLogs
    await apiRequest(
      '/api/snapshot',
      jsonRequest('PUT', { assets, loanLogs, softwareAssets, virtualAssets }),
    )
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      assets,
      loanLogs,
      softwareAssets,
      virtualAssets,
    }
  },

  async clearAll(): Promise<Asset[]> {
    await initializeServerData()
    return apiRequest<Asset[]>('/api/reset', { method: 'POST' })
  },
}

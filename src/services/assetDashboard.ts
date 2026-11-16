import type { Asset, AssetLoanLog, AssetStatus } from './assetApi'
import type { SoftwareAsset, VirtualAsset } from './assetTypes'

export interface AssetCategorySummary {
  category: string
  count: number
  value: number
  inUse: number
}

export interface DashboardMetrics {
  totalAssets: number
  totalValue: number
  inUseCount: number
  inUsePercent: number
  onLoanCount: number
  overdueCount: number
  dueSoonCount: number
  onLoanAssets: Asset[]
  overdueAssets: Asset[]
  dueSoonAssets: Asset[]
  repairCount: number
  statusRows: Array<{
    status: AssetStatus
    count: number
    percent: number
    ratio: number
    color: string
  }>
  classRows: Array<{
    key: string
    label: string
    count: number
    percent: number
    ratio: number
    value: number
    color: string
  }>
  categoryRows: AssetCategorySummary[]
  acquisitionTrend: Array<{ key: string; label: string; count: number }>
  recentAssets: Asset[]
  recentLogs: AssetLoanLog[]
  software: {
    total: number
    totalLicense: number
    usedLicense: number
    usagePercent: number
    expiringCount: number
    expiredCount: number
    value: number
    categoryRows: Array<{ category: string; count: number; total: number; used: number }>
  }
  virtual: {
    total: number
    expiringCount: number
    stoppedCount: number
    yearlyCost: number
    categoryRows: Array<{ category: string; count: number }>
    reminders: VirtualAsset[]
  }
}

const statusDefinitions: Array<{ status: AssetStatus; color: string }> = [
  { status: '在用', color: '#4c9a78' },
  { status: '闲置', color: '#5d82d6' },
  { status: '维修中', color: '#e49b42' },
  { status: '已报废', color: '#9a9cac' },
]

const classDefinitions = [
  {
    key: 'hardware',
    label: '办公设备',
    color: '#6858d6',
    matches: (asset: Asset) =>
      (asset.assetClass ?? (asset.category === '办公家具' ? 'general' : 'hardware')) === 'hardware',
  },
  {
    key: 'network',
    label: '网络设备',
    color: '#4c9a9a',
    matches: (asset: Asset) => asset.assetClass === 'network',
  },
  {
    key: 'server',
    label: '服务器设备',
    color: '#e49b42',
    matches: (asset: Asset) => asset.assetClass === 'server',
  },
  {
    key: 'general',
    label: '通用资产',
    color: '#8b90a3',
    matches: (asset: Asset) =>
      (asset.assetClass ?? (asset.category === '办公家具' ? 'general' : 'hardware')) === 'general',
  },
]

function isActiveLoan(asset: Asset): boolean {
  return Boolean(asset.borrower?.trim() && !asset.returned)
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null
}

/** 统一资产状态口径：在库/已领用/借出 → 在用或闲置，报废 → 已报废 */
export function normalizeStatus(status: string): AssetStatus {
  if (status === '报废') return '已报废'
  if (status === '在库') return '闲置'
  if (status === '已领用' || status === '借出') return '在用'
  return status as AssetStatus
}

export function daysUntil(value: string, now: Date = new Date()): number | null {
  const date = parseDateKey(value)
  if (!date) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((date.getTime() - today.getTime()) / 86_400_000)
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function isAssetLendable(asset: Asset): boolean {
  const status = normalizeStatus(asset.status)
  return (
    (asset.assetClass ?? (asset.category === '办公家具' ? 'general' : 'hardware')) !== 'general' &&
    !isActiveLoan(asset) &&
    status !== '维修中' &&
    status !== '已报废' &&
    asset.condition !== '维修中' &&
    asset.condition !== '已报废'
  )
}

export function buildDashboardMetrics(
  assets: Asset[],
  loanLogs: AssetLoanLog[],
  softwareInput: SoftwareAsset[] = [],
  virtualInput: VirtualAsset[] = [],
  now: Date = new Date(),
): DashboardMetrics {
  const softwareAssets = Array.isArray(softwareInput) ? softwareInput : []
  const virtualAssets = Array.isArray(virtualInput) ? virtualInput : []
  const today = toDateKey(now)
  const soon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7)
  const soonKey = toDateKey(soon)
  const onLoan = assets.filter(isActiveLoan)
  const overdueAssets = onLoan.filter((asset) => {
    const dueDate = parseDateKey(asset.dueDate)
    return dueDate !== null && toDateKey(dueDate) < today
  })
  const dueSoonAssets = onLoan.filter((asset) => {
    const dueDate = parseDateKey(asset.dueDate)
    const dueDateKey = dueDate ? toDateKey(dueDate) : ''
    return dueDate !== null && dueDateKey >= today && dueDateKey <= soonKey
  })
  const inUseCount = assets.filter((asset) => normalizeStatus(asset.status) === '在用').length
  const repairCount = assets.filter(
    (asset) => normalizeStatus(asset.status) === '维修中' || asset.condition === '维修中',
  ).length
  const totalAssets = assets.length
  const totalValue = assets.reduce(
    (sum, asset) => sum + (Number.isFinite(asset.price) ? asset.price : 0),
    0,
  )

  const statusCounts = new Map<AssetStatus, number>()
  for (const asset of assets) {
    const status = normalizeStatus(asset.status)
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1)
  }
  const statusRows = statusDefinitions.map(({ status, color }) => ({
    status,
    color,
    count: statusCounts.get(status) ?? 0,
    percent: totalAssets ? Math.round(((statusCounts.get(status) ?? 0) / totalAssets) * 100) : 0,
    ratio: totalAssets ? ((statusCounts.get(status) ?? 0) / totalAssets) * 100 : 0,
  }))

  const classRows = classDefinitions.map(({ key, label, color, matches }) => {
    const matchingAssets = assets.filter(matches)
    const value = matchingAssets.reduce(
      (sum, asset) => sum + (Number.isFinite(asset.price) ? asset.price : 0),
      0,
    )
    return {
      key,
      label,
      color,
      count: matchingAssets.length,
      percent: totalAssets ? Math.round((matchingAssets.length / totalAssets) * 100) : 0,
      ratio: totalAssets ? (matchingAssets.length / totalAssets) * 100 : 0,
      value,
    }
  })

  const categories = new Map<string, Asset[]>()
  for (const asset of assets) {
    const category = asset.category.trim() || '其他'
    const rows = categories.get(category) ?? []
    rows.push(asset)
    categories.set(category, rows)
  }
  const categoryRows = [...categories.entries()]
    .map(([category, items]) => ({
      category,
      count: items.length,
      value: items.reduce((sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0), 0),
      inUse: items.filter((item) => normalizeStatus(item.status) === '在用').length,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.category.localeCompare(right.category, 'zh-CN'),
    )

  const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const trend = new Map<string, number>()
  for (let offset = 0; offset < 12; offset += 1) {
    const month = new Date(trendStart.getFullYear(), trendStart.getMonth() + offset, 1)
    trend.set(monthKey(month), 0)
  }
  for (const asset of assets) {
    const purchaseDate = parseDateKey(asset.purchaseDate)
    if (!purchaseDate) continue
    const key = monthKey(purchaseDate)
    if (trend.has(key)) trend.set(key, (trend.get(key) ?? 0) + 1)
  }
  const acquisitionTrend = [...trend.entries()].map(([key, count]) => ({
    key,
    label: `${Number(key.slice(5))}月`,
    count,
  }))

  const recentAssets = [...assets]
    .sort(
      (left, right) =>
        right.purchaseDate.localeCompare(left.purchaseDate) || right.id.localeCompare(left.id),
    )
    .slice(0, 6)
  const recentLogs = [...loanLogs]
    .sort((left, right) => {
      const leftTime = Date.parse(left.eventAt)
      const rightTime = Date.parse(right.eventAt)
      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime)
    })
    .slice(0, 6)

  // 授权占用口径排除「破解版」，只统计正规授权
  const licensedSoftware = softwareAssets.filter((item) => item.licenseType !== '破解版')
  const totalLicense = licensedSoftware.reduce((sum, item) => sum + (item.licenseTotal || 0), 0)
  const usedLicense = licensedSoftware.reduce((sum, item) => sum + (item.licenseUsed || 0), 0)
  const softwareCategoryMap = new Map<string, { count: number; total: number; used: number }>()
  for (const item of softwareAssets) {
    const row = softwareCategoryMap.get(item.category) ?? { count: 0, total: 0, used: 0 }
    row.count += 1
    row.total += item.licenseTotal || 0
    row.used += item.licenseUsed || 0
    softwareCategoryMap.set(item.category, row)
  }

  const virtualCategoryMap = new Map<string, number>()
  for (const item of virtualAssets) {
    virtualCategoryMap.set(item.category, (virtualCategoryMap.get(item.category) ?? 0) + 1)
  }
  const reminders = virtualAssets
    .filter((item) => item.reminder?.enabled && item.status !== '已停用')
    .map((item) => ({ item, days: daysUntil(item.expiryDate, now) }))
    .filter(
      (entry): entry is { item: VirtualAsset; days: number } =>
        entry.days !== null && entry.days <= entry.item.reminder.days,
    )
    .sort((left, right) => left.days - right.days)
    .map((entry) => entry.item)

  // 到期风险按到期日期计算（30 天内含已过期），不依赖手工维护的状态字段
  const softwareExpiringCount = softwareAssets.filter((item) => {
    if (item.status === '过期停用') return false
    const days = daysUntil(item.expiryDate, now)
    return days !== null && days <= 30
  }).length
  const softwareExpiredCount = softwareAssets.filter((item) => {
    if (item.status === '过期停用') return false
    const days = daysUntil(item.expiryDate, now)
    return days !== null && days < 0
  }).length
  const virtualExpiringCount = virtualAssets.filter((item) => {
    if (item.status === '已停用') return false
    const days = daysUntil(item.expiryDate, now)
    return days !== null && days <= 30
  }).length

  return {
    totalAssets,
    totalValue,
    inUseCount,
    inUsePercent: totalAssets ? Math.round((inUseCount / totalAssets) * 100) : 0,
    onLoanCount: onLoan.length,
    overdueCount: overdueAssets.length,
    dueSoonCount: dueSoonAssets.length,
    onLoanAssets: onLoan,
    overdueAssets,
    dueSoonAssets,
    repairCount,
    statusRows,
    classRows,
    categoryRows,
    acquisitionTrend,
    recentAssets,
    recentLogs,
    software: {
      total: softwareAssets.length,
      totalLicense,
      usedLicense,
      usagePercent: totalLicense ? Math.round((usedLicense / totalLicense) * 100) : 0,
      expiringCount: softwareExpiringCount,
      expiredCount: softwareExpiredCount,
      value: softwareAssets.reduce(
        (sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0),
        0,
      ),
      categoryRows: [...softwareCategoryMap.entries()].map(([category, row]) => ({
        category,
        ...row,
      })),
    },
    virtual: {
      total: virtualAssets.length,
      expiringCount: virtualExpiringCount,
      stoppedCount: virtualAssets.filter((item) => item.status === '已停用').length,
      yearlyCost: virtualAssets.reduce((sum, item) => sum + (item.price ?? 0), 0),
      categoryRows: [...virtualCategoryMap.entries()].map(([category, count]) => ({
        category,
        count,
      })),
      reminders,
    },
  }
}

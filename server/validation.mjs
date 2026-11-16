import { isRecord } from './http-helpers.mjs'

export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isLendableAsset(asset) {
  const assetClass = asset.assetClass ?? (asset.category === '办公家具' ? 'general' : 'hardware')
  if (assetClass === 'general') return false
  if (
    ['维修中', '已报废', '报废'].includes(asset.status) ||
    asset.condition === '维修中' ||
    asset.condition === '已报废'
  )
    return false
  return !(asset.borrower?.trim() && asset.returned === false)
}

export function validUsername(value) {
  return (
    typeof value === 'string' &&
    value.trim().length >= 2 &&
    value.trim().length <= 30 &&
    value.trim() !== 'admin'
  )
}

export function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isAsset(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 100 &&
    typeof value.name === 'string' &&
    typeof value.category === 'string' &&
    typeof value.location === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.purchaseDate === 'string' &&
    typeof value.price === 'number' &&
    Number.isFinite(value.price) &&
    ['在用', '闲置', '维修中', '已报废', '报废', '在库', '已领用', '借出'].includes(value.status)
  )
}

export function validAssets(value) {
  if (!Array.isArray(value) || !value.every(isAsset)) return false
  return new Set(value.map((asset) => asset.id)).size === value.length
}

export function validLogs(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (log) =>
        isRecord(log) &&
        ['id', 'assetId', 'assetName', 'borrower', 'operator', 'eventAt', 'dueDate'].every(
          (key) => typeof log[key] === 'string',
        ) &&
        ['领用', '归还'].includes(log.action) &&
        !Number.isNaN(Date.parse(log.eventAt)),
    )
  )
}

export function isSoftwareAsset(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 100 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 100 &&
    ['办公软件', '设计软件', '工具软件'].includes(value.category) &&
    typeof value.version === 'string' &&
    ['永久授权', '年度订阅', '破解版'].includes(value.licenseType) &&
    Number.isInteger(value.licenseTotal) &&
    value.licenseTotal >= 0 &&
    Number.isInteger(value.licenseUsed) &&
    value.licenseUsed >= 0 &&
    value.licenseUsed <= value.licenseTotal &&
    typeof value.expiryDate === 'string' &&
    typeof value.supplier === 'string' &&
    typeof value.price === 'number' &&
    Number.isFinite(value.price) &&
    value.price >= 0 &&
    typeof value.assignedUsers === 'string' &&
    typeof value.assignedDepartments === 'string' &&
    ['正常', '即将到期', '过期停用'].includes(value.status) &&
    (value.notes === undefined || typeof value.notes === 'string') &&
    (value.supplierUrl === undefined || typeof value.supplierUrl === 'string') &&
    (value.purchaseDate === undefined || typeof value.purchaseDate === 'string')
  )
}

export function isVirtualAsset(value) {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 100 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    value.name.length <= 100 &&
    ['域名', '企业邮箱', '云服务器', '云存储', '系统账号', '业务文件', 'SSL 证书'].includes(
      value.category,
    ) &&
    typeof value.account === 'string' &&
    typeof value.expiryDate === 'string' &&
    typeof value.manager === 'string' &&
    typeof value.business === 'string' &&
    isRecord(value.reminder) &&
    typeof value.reminder.enabled === 'boolean' &&
    Number.isInteger(value.reminder.days) &&
    value.reminder.days >= 0 &&
    value.reminder.days <= 365 &&
    ['正常', '即将到期', '已停用'].includes(value.status) &&
    (value.provider === undefined || typeof value.provider === 'string') &&
    (value.notes === undefined || typeof value.notes === 'string') &&
    (value.price === undefined || (typeof value.price === 'number' && Number.isFinite(value.price)))
  )
}

export function validSoftwareAssets(value) {
  return (
    Array.isArray(value) &&
    value.every(isSoftwareAsset) &&
    new Set(value.map((item) => item.id)).size === value.length
  )
}

export function validVirtualAssets(value) {
  return (
    Array.isArray(value) &&
    value.every(isVirtualAsset) &&
    new Set(value.map((item) => item.id)).size === value.length
  )
}

export function validSitePreferences(value) {
  return (
    isRecord(value) &&
    typeof value.siteTitle === 'string' &&
    value.siteTitle.trim().length > 0 &&
    value.siteTitle.length <= 50 &&
    typeof value.adminDisplayName === 'string' &&
    value.adminDisplayName.trim().length > 0 &&
    value.adminDisplayName.length <= 30 &&
    typeof value.logoDataUrl === 'string' &&
    value.logoDataUrl.length <= 1_500_000 &&
    (value.logoDataUrl === '' ||
      /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value.logoDataUrl))
  )
}

export function validDisplayPreferences(value) {
  return (
    isRecord(value) &&
    ['light', 'dark'].includes(value.theme) &&
    ['comfortable', 'compact'].includes(value.density)
  )
}

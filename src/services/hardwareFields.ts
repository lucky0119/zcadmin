import type { Asset } from './assetApi'

export type HardwareClass = 'hardware' | 'network' | 'server'

export interface HardwareField {
  key: keyof Asset | string
  label: string
  kind?: 'number' | 'status' | 'condition'
  width?: number
}

/** 硬件资产台账字段（严格对齐《IT 资产管理办法》硬件资产字段表） */
export const hardwareLedgerFields: HardwareField[] = [
  { key: 'id', label: '资产编号', width: 140 },
  { key: 'name', label: '资产名称', width: 180 },
  { key: 'category', label: '资产类别', width: 110 },
  { key: 'brandModel', label: '品牌型号', width: 200 },
  { key: 'serialNumber', label: '序列号 SN', width: 170 },
  { key: 'purchaseDate', label: '采购日期', width: 110 },
  { key: 'price', label: '采购金额', kind: 'number', width: 110 },
  { key: 'supplier', label: '供应商', width: 150 },
  { key: 'warrantyExpiry', label: '保修到期日', width: 115 },
  { key: 'location', label: '存放位置', width: 170 },
  { key: 'owner', label: '当前使用人', width: 105 },
  { key: 'department', label: '使用部门', width: 110 },
  { key: 'status', label: '资产状态', kind: 'status', width: 100 },
  { key: 'assetLocation', label: '资产位置', width: 190 },
  { key: 'notes', label: '备注', width: 220 },
]

/** 分类专属的扩展规格字段（网络/服务器设备） */
export const classExtraFields: Record<HardwareClass, HardwareField[]> = {
  hardware: [
    { key: 'deviceType', label: '设备子类', width: 110 },
    { key: 'cpu', label: 'CPU 配置', width: 170 },
    { key: 'memory', label: '内存', width: 100 },
    { key: 'storage', label: '存储', width: 140 },
    { key: 'operatingSystem', label: '操作系统', width: 150 },
  ],
  network: [
    { key: 'networkRole', label: '设备类型', width: 110 },
    { key: 'managementIp', label: '管理 IP', width: 130 },
    { key: 'macAddress', label: 'MAC 地址', width: 155 },
    { key: 'vlan', label: 'VLAN', width: 100 },
    { key: 'ports', label: '端口数', width: 90 },
    { key: 'bandwidth', label: '带宽', width: 100 },
  ],
  server: [
    { key: 'hostname', label: '主机名', width: 130 },
    { key: 'managementIp', label: '管理 IP', width: 130 },
    { key: 'cpu', label: 'CPU 配置', width: 170 },
    { key: 'memory', label: '内存', width: 100 },
    { key: 'storage', label: '存储', width: 150 },
    { key: 'operatingSystem', label: '操作系统', width: 150 },
    { key: 'rackLocation', label: '机柜位置', width: 110 },
  ],
}

export const hardwareStatuses = ['在库', '已领用', '借出', '维修中', '报废'] as const

export const assetCategories: Record<HardwareClass, string[]> = {
  hardware: ['办公设备'],
  network: ['网络设备'],
  server: ['服务器设备'],
}

export const deviceTypes = [
  '台式电脑',
  '笔记本电脑',
  '显示器',
  '打印机',
  '扫描仪',
  '键盘鼠标',
  '投影仪',
  '会议平板',
  'U 盘',
  '移动硬盘',
  '平板电脑',
  '其他',
]

/** 品牌型号展示：优先 brandModel，其次拼接 brand + model */
export function brandModelOf(asset: Asset): string {
  if (asset.brandModel?.trim()) return asset.brandModel.trim()
  const parts = [asset.brand, asset.model].filter((part) => part && String(part).trim())
  return parts.length ? parts.join(' ') : '—'
}

export function classOf(asset: Asset): HardwareClass | 'general' {
  return asset.assetClass ?? (asset.category === '办公家具' ? 'general' : 'hardware')
}

export const classLabels: Record<HardwareClass | 'general', string> = {
  hardware: '办公设备',
  network: '网络设备',
  server: '服务器设备',
  general: '通用资产',
}

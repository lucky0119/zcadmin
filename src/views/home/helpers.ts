import type { TableColumnsType } from 'ant-design-vue'
import type { Asset, AssetLoanAction, AssetLoanLog, AssetStatus } from '../../services/assetApi'
import type { LoanRequest } from '../../services/loanRequestApi'
import { normalizeStatus } from '../../services/assetDashboard'

export type AssetClass = NonNullable<Asset['assetClass']>
export type SectionKey =
  | 'overview'
  | 'assets'
  | 'hardware'
  | 'network'
  | 'server'
  | 'software'
  | 'virtual'
  | 'loans'
  | 'categories'
  | 'repairs'
  | 'reports'
  | 'plan'
  | 'settings'
export type AssetCategory = 'all' | AssetClass
export type AssetColumnClass = 'hardware' | 'network' | 'server'

export interface AssetField {
  key: string
  label: string
  kind?: 'number' | 'status' | 'condition' | 'textarea' | 'date' | 'select'
  options?: string[]
  disabled?: boolean
}

export const statuses: AssetStatus[] = ['在用', '闲置', '维修中', '已报废', '报废']

export const defaultVisibleColumns: Record<AssetColumnClass, string[]> = {
  hardware: [
    'id',
    'name',
    'brandModel',
    'serialNumber',
    'location',
    'owner',
    'department',
    'status',
  ],
  network: [
    'id',
    'name',
    'networkRole',
    'brandModel',
    'managementIp',
    'location',
    'owner',
    'status',
  ],
  server: ['id', 'name', 'hostname', 'brandModel', 'managementIp', 'rackLocation', 'status'],
}

export const sectionTitles: Record<SectionKey, string> = {
  overview: '资产总览',
  assets: '硬件资产',
  hardware: '办公设备',
  network: '网络设备',
  server: '服务器设备',
  software: '应用软件',
  virtual: '虚拟资产',
  loans: '领用归还',
  categories: '分类管理',
  repairs: '维修记录',
  reports: '数据报表',
  plan: '资产管理方案',
  settings: '系统设置',
}

export const sectionTitleKeys: Record<SectionKey, true> = {
  overview: true,
  assets: true,
  hardware: true,
  network: true,
  server: true,
  software: true,
  virtual: true,
  loans: true,
  categories: true,
  repairs: true,
  reports: true,
  plan: true,
  settings: true,
}

export function createEmptyAsset(assetClass: AssetClass): Asset {
  return {
    id: '',
    name: '',
    category:
      assetClass === 'network' ? '网络设备' : assetClass === 'server' ? '服务器设备' : '办公设备',
    assetClass,
    location: '',
    owner: '',
    purchaseDate: localDateKey(new Date()),
    price: 0,
    status: '在用',
    condition: '良好',
    returned: true,
  }
}

export function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

export function statusColor(status: string | undefined) {
  const normalized = status ? normalizeStatus(status) : undefined
  if (normalized === '在用') return 'green'
  if (normalized === '闲置') return 'blue'
  if (normalized === '维修中') return 'orange'
  return 'default'
}

export function requestStatusColor(status: LoanRequest['status']) {
  if (status === '待审批') return 'orange'
  if (status === '已批准') return 'green'
  return 'red'
}

/** 表单字段严格对应《IT 资产管理办法》硬件资产字段表 */
export function buildAssetFormFields(editingClass: AssetClass, isEditing: boolean): AssetField[] {
  const base: AssetField[] = [
    { key: 'id', label: '资产编号', disabled: isEditing },
    { key: 'name', label: '资产名称' },
    {
      key: 'category',
      label: '资产类别',
      kind: 'select',
      options: [
        editingClass === 'network'
          ? '网络设备'
          : editingClass === 'server'
            ? '服务器设备'
            : '办公设备',
      ],
    },
    { key: 'brandModel', label: '品牌型号' },
    { key: 'serialNumber', label: '序列号 SN' },
  ]
  const specific: AssetField[] =
    editingClass === 'network'
      ? [
          { key: 'networkRole', label: '设备类型' },
          { key: 'managementIp', label: '管理 IP' },
          { key: 'macAddress', label: 'MAC 地址' },
          { key: 'vlan', label: 'VLAN' },
          { key: 'ports', label: '端口数' },
          { key: 'bandwidth', label: '带宽' },
        ]
      : editingClass === 'server'
        ? [
            { key: 'hostname', label: '主机名' },
            { key: 'managementIp', label: '管理 IP' },
            { key: 'cpu', label: 'CPU 配置' },
            { key: 'memory', label: '内存配置' },
            { key: 'storage', label: '存储配置' },
            { key: 'operatingSystem', label: '操作系统' },
            { key: 'rackLocation', label: '机柜编号' },
          ]
        : [
            { key: 'deviceType', label: '设备子类' },
            { key: 'cpu', label: 'CPU 配置' },
            { key: 'memory', label: '内存配置' },
            { key: 'storage', label: '存储配置' },
            { key: 'graphicsCard', label: '显卡配置' },
            { key: 'operatingSystem', label: '操作系统' },
          ]
  return [
    ...base,
    { key: 'purchaseDate', label: '采购日期', kind: 'date' },
    { key: 'price', label: '采购金额（元）', kind: 'number' },
    { key: 'supplier', label: '供应商' },
    { key: 'warrantyExpiry', label: '保修到期日', kind: 'date' },
    ...specific,
    { key: 'location', label: '存放位置' },
    { key: 'assetLocation', label: '资产位置（安装位置）' },
    { key: 'owner', label: '当前使用人' },
    { key: 'department', label: '使用部门' },
    { key: 'status', label: '资产状态', kind: 'status' },
    { key: 'condition', label: '资产状况', kind: 'condition' },
    { key: 'notes', label: '备注', kind: 'textarea' },
  ]
}

export function moduleFieldsForClass(assetClass: AssetColumnClass): AssetField[] {
  if (assetClass === 'network') {
    return [
      { key: 'id', label: '资产编号' },
      { key: 'name', label: '资产名称' },
      { key: 'category', label: '资产类别' },
      { key: 'brandModel', label: '品牌型号' },
      { key: 'serialNumber', label: '序列号 SN' },
      { key: 'networkRole', label: '设备类型' },
      { key: 'managementIp', label: '管理 IP' },
      { key: 'macAddress', label: 'MAC 地址' },
      { key: 'vlan', label: 'VLAN' },
      { key: 'ports', label: '端口数' },
      { key: 'bandwidth', label: '带宽' },
      { key: 'purchaseDate', label: '采购日期' },
      { key: 'price', label: '采购金额（元）' },
      { key: 'supplier', label: '供应商' },
      { key: 'warrantyExpiry', label: '保修到期日' },
      { key: 'location', label: '存放位置' },
      { key: 'assetLocation', label: '资产位置' },
      { key: 'owner', label: '当前使用人' },
      { key: 'department', label: '使用部门' },
      { key: 'status', label: '资产状态' },
      { key: 'notes', label: '备注' },
    ]
  }
  if (assetClass === 'server') {
    return [
      { key: 'id', label: '资产编号' },
      { key: 'name', label: '资产名称' },
      { key: 'category', label: '资产类别' },
      { key: 'brandModel', label: '品牌型号' },
      { key: 'serialNumber', label: '序列号 SN' },
      { key: 'hostname', label: '主机名' },
      { key: 'managementIp', label: '管理 IP' },
      { key: 'cpu', label: 'CPU' },
      { key: 'memory', label: '内存' },
      { key: 'storage', label: '存储' },
      { key: 'operatingSystem', label: '操作系统' },
      { key: 'rackLocation', label: '机柜编号' },
      { key: 'purchaseDate', label: '采购日期' },
      { key: 'price', label: '采购金额（元）' },
      { key: 'supplier', label: '供应商' },
      { key: 'warrantyExpiry', label: '保修到期日' },
      { key: 'location', label: '存放位置' },
      { key: 'assetLocation', label: '资产位置' },
      { key: 'owner', label: '当前使用人' },
      { key: 'department', label: '使用部门' },
      { key: 'status', label: '资产状态' },
      { key: 'notes', label: '备注' },
    ]
  }
  return [
    { key: 'id', label: '资产编号' },
    { key: 'name', label: '资产名称' },
    { key: 'category', label: '资产类别' },
    { key: 'brandModel', label: '品牌型号' },
    { key: 'serialNumber', label: '序列号 SN' },
    { key: 'deviceType', label: '设备子类' },
    { key: 'cpu', label: 'CPU 配置' },
    { key: 'memory', label: '内存配置' },
    { key: 'storage', label: '存储配置' },
    { key: 'graphicsCard', label: '显卡配置' },
    { key: 'operatingSystem', label: '操作系统' },
    { key: 'purchaseDate', label: '采购日期' },
    { key: 'price', label: '采购金额（元）' },
    { key: 'supplier', label: '供应商' },
    { key: 'warrantyExpiry', label: '保修到期日' },
    { key: 'location', label: '存放位置' },
    { key: 'assetLocation', label: '资产位置' },
    { key: 'owner', label: '当前使用人' },
    { key: 'department', label: '使用部门' },
    { key: 'status', label: '资产状态' },
    { key: 'notes', label: '备注' },
  ]
}

export const overviewColumns: TableColumnsType<Asset> = [
  { title: '资产名称', dataIndex: 'name', key: 'name', width: 190 },
  { title: '资产编号', dataIndex: 'id', key: 'id', width: 150 },
  { title: '资产类别', dataIndex: 'category', key: 'category', width: 110 },
  { title: '当前使用人', dataIndex: 'owner', key: 'owner', width: 105 },
  { title: '使用部门', dataIndex: 'department', key: 'department', width: 110 },
  { title: '存放位置', dataIndex: 'location', key: 'location', width: 170 },
  { title: '采购金额', dataIndex: 'price', key: 'price', width: 110 },
  { title: '资产状态', dataIndex: 'status', key: 'status', width: 100 },
  { title: '操作', key: 'actions', fixed: 'right', width: 130 },
]

export const loanColumns: TableColumnsType<Asset> = [
  { title: '资产编号', dataIndex: 'id', key: 'id', width: 145 },
  { title: '资产名称', dataIndex: 'name', key: 'name', width: 170 },
  { title: '资产类别', dataIndex: 'category', key: 'category', width: 110 },
  { title: '借用人', dataIndex: 'borrower', key: 'borrower', width: 110 },
  { title: '领用日期', dataIndex: 'loanDate', key: 'loanDate', width: 115 },
  { title: '预计归还', dataIndex: 'dueDate', key: 'dueDate', width: 115 },
  { title: '资产状况', dataIndex: 'condition', key: 'condition', width: 100 },
  { title: '状态', key: 'loanStatus', width: 100 },
  { title: '操作', key: 'actions', fixed: 'right', width: 150 },
]

export const logColumns: TableColumnsType<AssetLoanLog> = [
  { title: '操作时间', dataIndex: 'eventAt', key: 'eventAt', width: 180 },
  { title: '操作类型', dataIndex: 'action', key: 'action', width: 100 },
  { title: '资产编号', dataIndex: 'assetId', key: 'assetId', width: 150 },
  { title: '资产名称', dataIndex: 'assetName', key: 'assetName', width: 180 },
  { title: '借用人', dataIndex: 'borrower', key: 'borrower', width: 120 },
  { title: '操作人', dataIndex: 'operator', key: 'operator', width: 110 },
  { title: '预计归还', dataIndex: 'dueDate', key: 'dueDate', width: 120 },
]

export const requestColumns: TableColumnsType<LoanRequest> = [
  { title: '申请时间', dataIndex: 'requestedAt', key: 'requestedAt', width: 170 },
  { title: '资产编号', dataIndex: 'assetId', key: 'assetId', width: 140 },
  { title: '资产名称', dataIndex: 'assetName', key: 'assetName', width: 170 },
  { title: '领用人', dataIndex: 'borrower', key: 'borrower', width: 110 },
  { title: '预计归还', dataIndex: 'dueDate', key: 'dueDate', width: 115 },
  { title: '申请人', dataIndex: 'requestedBy', key: 'requestedBy', width: 110 },
  { title: '状态', key: 'status', width: 100 },
  { title: '操作', key: 'actions', width: 140 },
]

export const userLoanColumns: TableColumnsType<Asset> = [
  { title: '资产编号', dataIndex: 'id', key: 'id', width: 145 },
  { title: '资产名称', dataIndex: 'name', key: 'name', width: 180 },
  { title: '资产类别', dataIndex: 'category', key: 'category', width: 110 },
  { title: '当前使用人', dataIndex: 'owner', key: 'owner', width: 110 },
  { title: '状态', key: 'loanStatus', width: 100 },
  { title: '操作', key: 'actions', fixed: 'right', width: 110 },
]

export const userRequestColumns: TableColumnsType<LoanRequest> = [
  { title: '申请时间', dataIndex: 'requestedAt', key: 'requestedAt', width: 170 },
  { title: '资产编号', dataIndex: 'assetId', key: 'assetId', width: 140 },
  { title: '资产名称', dataIndex: 'assetName', key: 'assetName', width: 180 },
  { title: '领用人', dataIndex: 'borrower', key: 'borrower', width: 110 },
  { title: '预计归还', dataIndex: 'dueDate', key: 'dueDate', width: 115 },
  { title: '状态', key: 'status', width: 100 },
]

export const categoryColumns = [
  { title: '资产类别', dataIndex: 'category', key: 'category' },
  { title: '资产数量', dataIndex: 'count', key: 'count' },
  { title: '在用数量', dataIndex: 'inUse', key: 'inUse' },
  { title: '资产总值', dataIndex: 'value', key: 'value' },
]

export const hardwareExportFields: Array<[string, keyof Asset]> = [
  ['资产编号', 'id'],
  ['资产名称', 'name'],
  ['资产类别', 'category'],
  ['设备类型', 'deviceType'],
  ['品牌', 'brand'],
  ['型号', 'model'],
  ['序列号', 'serialNumber'],
  ['主机名', 'hostname'],
  ['管理IP', 'managementIp'],
  ['MAC地址', 'macAddress'],
  ['使用人', 'owner'],
  ['使用部门', 'department'],
  ['存放位置', 'location'],
  ['供应商', 'supplier'],
  ['采购日期', 'purchaseDate'],
  ['采购金额', 'price'],
  ['资产状态', 'status'],
  ['资产状况', 'condition'],
  ['借用人', 'borrower'],
  ['领用日期', 'loanDate'],
  ['预计归还', 'dueDate'],
  ['备注', 'notes'],
]

export type AssetLoanActionValue = AssetLoanAction

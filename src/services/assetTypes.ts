/** 硬件资产字段（对齐 IT 资产管理办法） */
export interface HardwareAsset {
  /** 资产编号 */
  id: string
  /** 资产名称 */
  name: string
  /** 资产类别：办公设备 / 网络设备 / 服务器设备 */
  category: string
  assetClass?: 'hardware' | 'network' | 'server' | 'general'
  /** 品牌型号（与 brand / model 保持同步） */
  brandModel?: string
  brand?: string
  model?: string
  /** 序列号 SN */
  serialNumber?: string
  /** 采购日期 */
  purchaseDate: string
  /** 采购金额 */
  price: number
  /** 供应商 */
  supplier?: string
  /** 保修到期日 */
  warrantyExpiry?: string
  /** 存放位置：机柜编号 / 办公室工位 */
  location: string
  /** 当前使用人 */
  owner: string
  /** 使用部门 */
  department?: string
  /** 资产状态：在库、已领用、借出、维修中、报废 */
  status: string
  /** 资产安装位置 */
  assetLocation?: string
  /** 备注：故障记录、配件更换记录等 */
  notes?: string

  // 既有字段（借还、规格、网络/服务器专属）
  condition?: '良好' | '维修中' | '已报废'
  borrower?: string
  loanDate?: string
  dueDate?: string
  returned?: boolean
  deviceType?: string
  deviceName?: string
  macAddress?: string
  cpu?: string
  memory?: string
  storage?: string
  graphicsCard?: string
  operatingSystem?: string
  manager?: string
  hostname?: string
  managementIp?: string
  networkRole?: string
  vlan?: string
  ports?: string
  bandwidth?: string
  rackLocation?: string
}

export type SoftwareCategory = '办公软件' | '设计软件' | '工具软件'
export type LicenseType = '永久授权' | '年度订阅' | '破解版'
export type SoftwareStatus = '正常' | '即将到期' | '过期停用'

export interface SoftwareAsset {
  /** 软件资产编号 */
  id: string
  /** 软件名称 */
  name: string
  /** 软件分类 */
  category: SoftwareCategory
  /** 版本号 */
  version: string
  /** 授权类型 */
  licenseType: LicenseType
  /** 授权总数 */
  licenseTotal: number
  /** 已使用授权 */
  licenseUsed: number
  /** 授权到期日（永久授权留空） */
  expiryDate: string
  /** 供应商 */
  supplier: string
  /** 供应商采购/续费链接 */
  supplierUrl?: string
  /** 采购金额 */
  price: number
  /** 分配使用人 */
  assignedUsers: string
  /** 分配使用部门 */
  assignedDepartments: string
  /** 资产状态 */
  status: SoftwareStatus
  /** 备注：授权密钥、许可文件存放位置 */
  notes?: string
  purchaseDate?: string
}

export type VirtualCategory =
  '域名' | '企业邮箱' | '云服务器' | '云存储' | '系统账号' | '业务文件' | 'SSL 证书'

export type VirtualStatus = '正常' | '即将到期' | '已停用'

export interface VirtualAsset {
  /** 资源编号 */
  id: string
  /** 资源名称 */
  name: string
  /** 资源分类 */
  category: VirtualCategory
  /** 账号 */
  account: string
  /** 有效期截止日 */
  expiryDate: string
  /** 管理员 */
  manager: string
  /** 关联业务 */
  business: string
  /** 到期提醒（days 为提醒提前量，enabled 控制开关） */
  reminder: { enabled: boolean; days: number }
  /** 资产状态 */
  status: VirtualStatus
  /** 资源提供方 */
  provider?: string
  /** 年费用 */
  price?: number
  /** 备注 */
  notes?: string
}

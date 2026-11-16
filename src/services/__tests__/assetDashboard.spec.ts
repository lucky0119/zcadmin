import { describe, expect, it } from 'vitest'
import { buildDashboardMetrics, isAssetLendable } from '../assetDashboard'
import type { Asset, AssetLoanLog } from '../assetApi'
import type { SoftwareAsset, VirtualAsset } from '../assetTypes'

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'TEST-1',
    name: '测试资产',
    category: '办公设备',
    assetClass: 'hardware',
    location: '测试地点',
    owner: '测试用户',
    purchaseDate: '2026-01-01',
    price: 100,
    status: '在用',
    condition: '良好',
    returned: true,
    ...overrides,
  }
}

describe('asset dashboard metrics', () => {
  it('aggregates class, status, value, and loan metrics for the selected date', () => {
    const assets = [
      makeAsset({
        id: 'A',
        price: 1000,
        borrower: '借用人',
        returned: false,
        dueDate: '2026-11-10',
      }),
      makeAsset({
        id: 'B',
        assetClass: 'network',
        purchaseDate: '2026-11-01',
        status: '闲置',
        price: 300,
      }),
      makeAsset({
        id: 'C',
        assetClass: 'server',
        status: '维修中',
        condition: '维修中',
        price: 500,
      }),
      makeAsset({
        id: 'D',
        assetClass: 'general',
        status: '报废',
        condition: '已报废',
        price: 200,
      }),
      makeAsset({ id: 'E', borrower: '即将到期', returned: false, dueDate: '2026-11-18' }),
      makeAsset({ id: 'F', borrower: '较晚归还', returned: false, dueDate: '2026-11-19' }),
    ]
    const metrics = buildDashboardMetrics(assets, [], [], [], new Date(2026, 10, 11, 12))

    expect(metrics.totalAssets).toBe(6)
    expect(metrics.totalValue).toBe(2200)
    expect(metrics.inUseCount).toBe(3)
    expect(metrics.onLoanCount).toBe(3)
    expect(metrics.overdueCount).toBe(1)
    expect(metrics.dueSoonCount).toBe(1)
    expect(metrics.repairCount).toBe(1)
    expect(metrics.statusRows.find((row) => row.status === '已报废')?.count).toBe(1)
    expect(metrics.classRows.map((row) => row.count)).toEqual([3, 1, 1, 1])
    expect(metrics.acquisitionTrend).toHaveLength(12)
    expect(metrics.acquisitionTrend[metrics.acquisitionTrend.length - 1]).toEqual({
      key: '2026-11',
      label: '11月',
      count: 1,
    })
  })

  it('returns stable zero-state charts when no assets exist', () => {
    const metrics = buildDashboardMetrics([], [], [], [], new Date(2026, 10, 11))

    expect(metrics.totalValue).toBe(0)
    expect(metrics.inUsePercent).toBe(0)
    expect(metrics.statusRows.every((row) => row.percent === 0)).toBe(true)
    expect(metrics.classRows.every((row) => row.percent === 0)).toBe(true)
    expect(metrics.acquisitionTrend.every((row) => row.count === 0)).toBe(true)
  })

  it('ignores malformed dates in due-date and acquisition trends', () => {
    const asset = makeAsset({
      borrower: '借用人',
      returned: false,
      dueDate: '2026-02-31',
      purchaseDate: '2026-99-99',
    })
    const metrics = buildDashboardMetrics([asset], [], [], [], new Date(2026, 10, 11))

    expect(metrics.overdueCount).toBe(0)
    expect(metrics.dueSoonCount).toBe(0)
    expect(metrics.acquisitionTrend.every((month) => month.count === 0)).toBe(true)
  })

  it('orders recent loan activity by event time rather than input order', () => {
    const logs: AssetLoanLog[] = [
      {
        id: 'old',
        action: '领用',
        assetId: 'A',
        assetName: '资产 A',
        borrower: '甲',
        operator: '管理员',
        eventAt: '2026-01-01T00:00:00Z',
        dueDate: '',
      },
      {
        id: 'new',
        action: '归还',
        assetId: 'B',
        assetName: '资产 B',
        borrower: '乙',
        operator: '管理员',
        eventAt: '2026-11-01T00:00:00Z',
        dueDate: '',
      },
    ]

    expect(buildDashboardMetrics([], logs).recentLogs.map((log) => log.id)).toEqual(['new', 'old'])
  })

  it('aggregates software license usage and virtual asset expiry reminders', () => {
    const software: SoftwareAsset[] = [
      {
        id: 'SW-1',
        name: 'Office 365',
        category: '办公软件',
        version: '2021',
        licenseType: '年度订阅',
        licenseTotal: 50,
        licenseUsed: 50,
        expiryDate: '2026-11-20',
        supplier: '微软',
        price: 1000,
        assignedUsers: '',
        assignedDepartments: '',
        status: '即将到期',
      },
      {
        id: 'SW-2',
        name: 'AutoCAD',
        category: '设计软件',
        version: '2024',
        licenseType: '永久授权',
        licenseTotal: 5,
        licenseUsed: 3,
        expiryDate: '',
        supplier: 'Autodesk',
        price: 2000,
        assignedUsers: '',
        assignedDepartments: '',
        status: '正常',
      },
    ]
    const virtual: VirtualAsset[] = [
      {
        id: 'VM-1',
        name: '主域名',
        category: '域名',
        account: 'yh.com',
        expiryDate: '2026-11-15',
        manager: 'IT',
        business: '官网',
        reminder: { enabled: true, days: 30 },
        status: '即将到期',
      },
      {
        id: 'VM-2',
        name: '云主机',
        category: '云服务器',
        account: 'root',
        expiryDate: '2027-06-01',
        manager: 'IT',
        business: '系统',
        reminder: { enabled: true, days: 30 },
        status: '正常',
      },
    ]
    const metrics = buildDashboardMetrics([], [], software, virtual, new Date(2026, 10, 12))

    expect(metrics.software.totalLicense).toBe(55)
    expect(metrics.software.usedLicense).toBe(53)
    expect(metrics.software.expiringCount).toBe(1)
    expect(metrics.virtual.total).toBe(2)
    expect(metrics.virtual.reminders.map((item) => item.id)).toEqual(['VM-1'])
  })

  it('does not allow general, checked-out, repair, or retired assets to be lent', () => {
    expect(isAssetLendable(makeAsset())).toBe(true)
    expect(isAssetLendable(makeAsset({ assetClass: 'general' }))).toBe(false)
    expect(isAssetLendable(makeAsset({ borrower: '借用人', returned: false }))).toBe(false)
    expect(isAssetLendable(makeAsset({ status: '维修中' }))).toBe(false)
    expect(isAssetLendable(makeAsset({ status: '报废' }))).toBe(false)
    expect(
      buildDashboardMetrics([makeAsset({ status: '闲置', condition: '维修中' })], []).repairCount,
    ).toBe(1)
  })
})

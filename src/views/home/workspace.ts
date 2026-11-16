import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { authApi } from '../../services/authApi'
import {
  assetApi,
  assetLoanLogApi,
  getServerState,
  getUserState,
  softwareAssetApi,
  virtualAssetApi,
  type Asset,
  type AssetLoanAction,
  type AssetLoanLog,
  type AssetStatus,
  type SoftwareAsset,
  type VirtualAsset,
} from '../../services/assetApi'
import { loanRequestApi, type LoanRequest } from '../../services/loanRequestApi'
import { downloadCsv } from '../../services/exportCsv'
import {
  buildDashboardMetrics,
  daysUntil,
  isAssetLendable,
  normalizeStatus,
} from '../../services/assetDashboard'
import {
  assetColumnPreferencesApi,
  displayPreferences,
  sitePreferences,
} from '../../services/settingsApi'
import { brandModelOf, classOf } from '../../services/hardwareFields'
import {
  buildAssetFormFields,
  createEmptyAsset,
  defaultVisibleColumns,
  hardwareExportFields,
  localDateKey,
  moduleFieldsForClass,
  sectionTitleKeys,
  statuses,
  type AssetCategory,
  type AssetClass,
  type AssetColumnClass,
  type AssetField,
  type SectionKey,
} from './helpers'

/**
 * 资产工作台：集中承载首页各板块（总览/硬件/软件/领用/报表）的数据与操作，
 * 由 AntHomeView 创建后以 reactive 对象形式传给各 section 子组件。
 */
export function createAssetWorkspace() {
  const router = useRouter()

  // ---- 数据 ----
  const assets = ref<Asset[]>([])
  const loanLogs = ref<AssetLoanLog[]>([])
  const loanRequests = ref<LoanRequest[]>([])
  const softwareAssets = ref<SoftwareAsset[]>([])
  const virtualAssets = ref<VirtualAsset[]>([])
  const currentUser = ref<{ role: 'admin' | 'manager' | 'user'; username: string }>({
    role: 'admin',
    username: 'admin',
  })
  const isAdmin = computed(() => currentUser.value.role === 'admin')
  const canManage = computed(
    () => currentUser.value.role === 'admin' || currentUser.value.role === 'manager',
  )
  const roleLabel = computed(() =>
    currentUser.value.role === 'admin'
      ? '系统管理员'
      : currentUser.value.role === 'manager'
        ? '资产管理员'
        : '普通用户',
  )

  // ---- 界面状态 ----
  const loading = ref(false)
  const saving = ref(false)
  const activeSection = ref<SectionKey>('overview')
  const assetCategory = ref<AssetCategory>('hardware')
  const visibleColumnsByClass = reactive<Record<AssetColumnClass, string[]>>({
    hardware: [...defaultVisibleColumns.hardware],
    network: [...defaultVisibleColumns.network],
    server: [...defaultVisibleColumns.server],
  })
  const columnPickerOpen = ref(false)
  const assetSearch = ref('')
  const supplierFilter = ref('all')
  const statusFilter = ref<string>('all')
  const loanSearch = ref('')
  const loanFilter = ref<'all' | 'available' | 'on-loan' | 'overdue' | 'repair'>('all')
  const loanTab = ref('records')
  const logSearch = ref('')
  const logActionFilter = ref<AssetLoanAction | 'all'>('all')
  const assetModalOpen = ref(false)
  const loanModalOpen = ref(false)
  const requestModalOpen = ref(false)
  const requestAsset = ref<Asset | null>(null)
  const requestDraft = reactive({ borrower: '', dueDate: '' })
  const editingId = ref<string | null>(null)
  const selectedLoanAsset = ref<Asset | null>(null)
  const editingClass = ref<AssetClass>('hardware')
  const assetDraft = reactive<Asset>(createEmptyAsset('hardware'))
  const loanDraft = reactive({ borrower: '', loanDate: '', dueDate: '' })

  // ---- 派生指标 ----
  const today = computed(() => localDateKey(new Date()))
  const dashboardMetrics = computed(() =>
    buildDashboardMetrics(assets.value, loanLogs.value, softwareAssets.value, virtualAssets.value),
  )
  const overdueAssetIds = computed(
    () => new Set(dashboardMetrics.value.overdueAssets.map((asset) => asset.id)),
  )
  const onLoanAssets = computed(() => dashboardMetrics.value.onLoanAssets)
  const overdueAssets = computed(() => dashboardMetrics.value.overdueAssets)
  const dueSoonAssets = computed(() => dashboardMetrics.value.dueSoonAssets)
  const availableAssetIds = computed(
    () => new Set(assets.value.filter(isAssetLendable).map((asset) => asset.id)),
  )
  const categoryRows = computed(() => dashboardMetrics.value.categoryRows)
  const maxMonthlyAcquisitions = computed(() =>
    Math.max(1, ...dashboardMetrics.value.acquisitionTrend.map((month) => month.count)),
  )
  const repairAssets = computed(() =>
    assets.value.filter(
      (asset) => normalizeStatus(asset.status) === '维修中' || asset.condition === '维修中',
    ),
  )
  const classAssets = computed(() => {
    if (activeSection.value === 'overview') return assets.value
    if (activeSection.value === 'assets') {
      if (assetCategory.value === 'all') return assets.value
      if (assetCategory.value === 'network')
        return assets.value.filter((asset) => asset.assetClass === 'network')
      if (assetCategory.value === 'server')
        return assets.value.filter((asset) => asset.assetClass === 'server')
      return assets.value.filter(
        (asset) => asset.assetClass !== 'network' && asset.assetClass !== 'server',
      )
    }
    if (activeSection.value === 'network')
      return assets.value.filter((asset) => asset.assetClass === 'network')
    if (activeSection.value === 'server')
      return assets.value.filter((asset) => asset.assetClass === 'server')
    return assets.value.filter(
      (asset) => asset.assetClass !== 'network' && asset.assetClass !== 'server',
    )
  })
  const supplierOptions = computed(() =>
    [...new Set(assets.value.map((asset) => asset.supplier?.trim()).filter(Boolean))].sort(),
  )
  const filteredAssets = computed(() => {
    const keyword = assetSearch.value.trim().toLocaleLowerCase()
    const rows = activeSection.value === 'repairs' ? repairAssets.value : classAssets.value
    return rows.filter((asset) => {
      const matchesText =
        !keyword ||
        [
          asset.id,
          asset.name,
          asset.category,
          asset.owner,
          asset.location,
          asset.manager ?? '',
          asset.brand ?? '',
          asset.model ?? '',
          brandModelOf(asset),
          asset.serialNumber ?? '',
          asset.hostname ?? '',
          asset.managementIp ?? '',
          asset.macAddress ?? '',
          asset.department ?? '',
          asset.supplier ?? '',
          asset.assetLocation ?? '',
          asset.notes ?? '',
        ].some((value) => String(value).toLocaleLowerCase().includes(keyword))
      const matchesStatus = statusFilter.value === 'all' || asset.status === statusFilter.value
      const matchesSupplier =
        supplierFilter.value === 'all' || asset.supplier === supplierFilter.value
      return matchesText && matchesStatus && matchesSupplier
    })
  })
  const filteredLoanAssets = computed(() => {
    const keyword = loanSearch.value.trim().toLocaleLowerCase()
    return assets.value.filter((asset) => {
      const borrowed = Boolean(asset.borrower?.trim() && !asset.returned)
      const overdue = overdueAssetIds.value.has(asset.id)
      const matchesFilter =
        loanFilter.value === 'all' ||
        (loanFilter.value === 'available' && availableAssetIds.value.has(asset.id)) ||
        (loanFilter.value === 'on-loan' && borrowed) ||
        (loanFilter.value === 'overdue' && overdue) ||
        (loanFilter.value === 'repair' &&
          (normalizeStatus(asset.status) === '维修中' || asset.condition === '维修中'))
      const matchesText =
        !keyword ||
        [asset.id, asset.name, asset.category, asset.borrower ?? '', asset.location].some((value) =>
          value.toLocaleLowerCase().includes(keyword),
        )
      return classOf(asset) !== 'general' && matchesFilter && matchesText
    })
  })
  const userAssets = computed(() => {
    const keyword = loanSearch.value.trim().toLocaleLowerCase()
    if (!keyword) return assets.value
    return assets.value.filter((asset) =>
      [asset.id, asset.name, asset.category, asset.borrower ?? '', asset.location ?? ''].some(
        (value) => value.toLocaleLowerCase().includes(keyword),
      ),
    )
  })
  const filteredLoanLogs = computed(() => {
    const keyword = logSearch.value.trim().toLocaleLowerCase()
    return loanLogs.value.filter((log) => {
      const matchesAction = logActionFilter.value === 'all' || log.action === logActionFilter.value
      const matchesText =
        !keyword ||
        [log.assetId, log.assetName, log.borrower, log.operator].some((value) =>
          value.toLocaleLowerCase().includes(keyword),
        )
      return matchesAction && matchesText
    })
  })
  const pendingRequestCount = computed(
    () => loanRequests.value.filter((item) => item.status === '待审批').length,
  )

  /** 硬件可用数（在库 + 在用）与可用率 */
  const hardwareAvailableCount = computed(() =>
    dashboardMetrics.value.statusRows
      .filter((row) => row.status === '在用' || row.status === '闲置')
      .reduce((sum, row) => sum + row.count, 0),
  )
  const hardwareAvailablePercent = computed(() => {
    const total = dashboardMetrics.value.totalAssets
    return total ? Math.round((hardwareAvailableCount.value / total) * 100) : 0
  })

  /** 未来 12 个月需续费支出：年度订阅软件 + 有年费的虚拟资产（按到期日滚动统计，含已逾期未续） */
  const renewalStats = computed(() => {
    const horizon = 365
    const withinWindow = (value: string | undefined) => {
      const days = value ? daysUntil(value) : null
      return days !== null && days <= horizon
    }
    const softwareItems = softwareAssets.value.filter(
      (item) =>
        item.licenseType === '年度订阅' &&
        item.status !== '过期停用' &&
        withinWindow(item.expiryDate),
    )
    const virtualItems = virtualAssets.value.filter(
      (item) => item.status !== '已停用' && (item.price ?? 0) > 0 && withinWindow(item.expiryDate),
    )
    const softwareTotal = softwareItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0),
      0,
    )
    const virtualTotal = virtualItems.reduce((sum, item) => sum + (item.price ?? 0), 0)
    return {
      software: { count: softwareItems.length, total: softwareTotal },
      virtual: { count: virtualItems.length, total: virtualTotal },
      total: softwareTotal + virtualTotal,
    }
  })

  /** 总览页「资产分类快捷入口」：六大台账一键直达 */
  const quickNavEntries = computed(() => [
    {
      key: 'hardware',
      label: '办公设备',
      count: classCount('hardware'),
      caption: '电脑、打印机、会议设备',
      color: '#6259ca',
    },
    {
      key: 'network',
      label: '网络设备',
      count: classCount('network'),
      caption: '交换机、防火墙、AP',
      color: '#1677ff',
    },
    {
      key: 'server',
      label: '服务器设备',
      count: classCount('server'),
      caption: '服务器、存储、机柜',
      color: '#13a8a8',
    },
    {
      key: 'software',
      label: '应用软件',
      count: dashboardMetrics.value.software.total,
      caption: `授权占用 ${dashboardMetrics.value.software.usagePercent}%`,
      color: '#2f9e8f',
    },
    {
      key: 'virtual',
      label: '虚拟资产',
      count: dashboardMetrics.value.virtual.total,
      caption: `到期提醒 ${dashboardMetrics.value.virtual.reminders.length} 项`,
      color: '#7d6fd9',
    },
    {
      key: 'loans',
      label: '领用归还',
      count: dashboardMetrics.value.onLoanCount,
      caption: `逾期 ${dashboardMetrics.value.overdueCount} 项`,
      color: '#fa8c16',
    },
  ])

  // ---- 字段与列配置 ----
  const assetColumnClass = computed<AssetColumnClass>(() => {
    if (activeSection.value === 'network' || assetCategory.value === 'network') return 'network'
    if (activeSection.value === 'server' || assetCategory.value === 'server') return 'server'
    return 'hardware'
  })
  const moduleFields = computed<AssetField[]>(() => moduleFieldsForClass(assetColumnClass.value))
  const columnOptions = computed(() =>
    moduleFields.value.map((field) => ({ label: field.label, value: field.key })),
  )
  const moduleColumns = computed(() => {
    const visible = new Set(visibleColumnsByClass[assetColumnClass.value])
    return [
      ...moduleFields.value
        .filter((field) => visible.has(field.key))
        .map((field) => ({ title: field.label, dataIndex: field.key, key: field.key })),
      { title: '操作', key: 'actions', fixed: 'right' as const, width: 130 },
    ]
  })
  const assetFields = computed<AssetField[]>(() =>
    buildAssetFormFields(editingClass.value, Boolean(editingId.value)),
  )

  function applyColumnPreferences(values: Record<string, string[]>) {
    for (const assetClass of ['hardware', 'network', 'server'] as const) {
      const selected = values[assetClass]
      if (!Array.isArray(selected)) continue
      const allowed = new Set(moduleFieldsForClass(assetClass).map((field) => field.key))
      visibleColumnsByClass[assetClass] = selected.filter((key) => allowed.has(key))
    }
  }

  async function updateVisibleColumns(value: Array<string | number>) {
    const allowed = new Set(moduleFields.value.map((field) => field.key))
    const selected = value.filter(
      (key): key is string => typeof key === 'string' && allowed.has(key),
    )
    const next = {
      hardware: [...visibleColumnsByClass.hardware],
      network: [...visibleColumnsByClass.network],
      server: [...visibleColumnsByClass.server],
      [assetColumnClass.value]: selected,
    }
    try {
      await assetColumnPreferencesApi.save(next)
      visibleColumnsByClass[assetColumnClass.value] = selected
    } catch (error) {
      void message.error(
        error instanceof Error ? `保存字段显示设置失败：${error.message}` : '保存字段显示设置失败',
      )
    }
  }

  async function resetVisibleColumns() {
    await updateVisibleColumns([...defaultVisibleColumns[assetColumnClass.value]])
  }

  // ---- 数据加载 ----
  async function loadData() {
    loading.value = true
    try {
      const session = await authApi.getSession()
      if (session.authenticated && session.role) {
        currentUser.value = { role: session.role, username: session.username ?? 'admin' }
      }
      if (canManage.value) {
        const state = await getServerState()
        assets.value = state.assets
        loanLogs.value = state.loanLogs
        softwareAssets.value = state.softwareAssets ?? []
        virtualAssets.value = state.virtualAssets ?? []
        Object.assign(displayPreferences, state.displayPreferences)
        Object.assign(sitePreferences, state.sitePreferences)
        applyColumnPreferences(state.assetColumnPreferences)
        loanRequests.value = await loanRequestApi.list()
      } else {
        const state = await getUserState()
        assets.value = state.assets
        loanRequests.value = state.loanRequests
        Object.assign(displayPreferences, state.displayPreferences)
        Object.assign(sitePreferences, state.sitePreferences)
        activeSection.value = 'loans'
      }
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '读取服务器资产数据失败')
    } finally {
      loading.value = false
    }
  }

  async function refreshSoftware() {
    try {
      softwareAssets.value = await softwareAssetApi.list()
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '刷新软件资产失败')
    }
  }

  async function refreshVirtual() {
    try {
      virtualAssets.value = await virtualAssetApi.list()
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '刷新虚拟资产失败')
    }
  }

  // ---- 领用申请（普通用户） ----
  function openLoanRequest(asset: Asset) {
    if (!isAssetLendable(asset)) {
      void message.warning('该资产当前不可申请领用')
      return
    }
    requestAsset.value = asset
    requestDraft.borrower = ''
    requestDraft.dueDate = ''
    requestModalOpen.value = true
  }

  async function submitLoanRequest() {
    const asset = requestAsset.value
    if (!asset) return
    if (!requestDraft.borrower.trim()) {
      void message.warning('请填写领用人姓名')
      return
    }
    if (!requestDraft.dueDate) {
      void message.warning('请选择预计归还时间')
      return
    }
    if (requestDraft.dueDate < today.value) {
      void message.warning('预计归还时间不能早于今天')
      return
    }
    saving.value = true
    try {
      const created = await loanRequestApi.create(
        asset.id,
        requestDraft.borrower.trim(),
        requestDraft.dueDate,
      )
      loanRequests.value = [created, ...loanRequests.value.filter((item) => item.id !== created.id)]
      requestModalOpen.value = false
      loanTab.value = 'requests'
      void message.success('领用申请已提交，等待管理员审批')
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '提交领用申请失败')
    } finally {
      saving.value = false
    }
  }

  async function reviewLoanRequest(record: LoanRequest, action: 'approve' | 'reject') {
    const label = action === 'approve' ? '批准' : '拒绝'
    Modal.confirm({
      title: `${label}领用申请`,
      content: `确定${label}「${record.assetName}」由 ${record.borrower} 领用的申请吗？`,
      okText: label,
      okType: action === 'approve' ? 'primary' : 'danger',
      cancelText: '取消',
      async onOk() {
        try {
          const updated = await loanRequestApi.review(record.id, action)
          loanRequests.value = loanRequests.value.map((item) =>
            item.id === updated.id ? updated : item,
          )
          if (action === 'approve') await loadData()
          void message.success(`已${label}该领用申请`)
        } catch (error) {
          void message.error(error instanceof Error ? error.message : '审批操作失败')
          throw error
        }
      },
    })
  }

  function classCount(key: string) {
    return dashboardMetrics.value.classRows.find((row) => row.key === key)?.count ?? 0
  }

  function isOverdue(asset: Asset) {
    return overdueAssetIds.value.has(asset.id)
  }

  // ---- 导出 ----
  function exportHardwareCsv() {
    downloadCsv(
      '硬件资产台账',
      hardwareExportFields.map(([label]) => label),
      filteredAssets.value.map((asset) =>
        hardwareExportFields.map(([, key]) => String(asset[key] ?? '')),
      ),
    )
    void message.success(`已导出 ${filteredAssets.value.length} 条硬件资产记录`)
  }

  function exportLoanLogsCsv() {
    downloadCsv(
      '领用归还日志',
      ['操作时间', '操作类型', '资产编号', '资产名称', '借用人', '操作人', '预计归还'],
      filteredLoanLogs.value.map((log) => [
        log.eventAt,
        log.action,
        log.assetId,
        log.assetName,
        log.borrower,
        log.operator,
        log.dueDate,
      ]),
    )
    void message.success(`已导出 ${filteredLoanLogs.value.length} 条领用归还日志`)
  }

  // ---- 导航 ----
  function setSection(section: string | number) {
    if (typeof section === 'string' && section in sectionTitleKeys) {
      if (!canManage.value && section !== 'loans') return
      activeSection.value = section as SectionKey
      assetSearch.value = ''
      statusFilter.value = 'all'
      supplierFilter.value = 'all'
      // 进入「硬件资产」汇总页时回到「全部」页签，避免标题与列表分类不一致
      if (section === 'assets') assetCategory.value = 'all'
    }
  }

  /** 从总览跳转到领用归还页的「操作日志」页签 */
  function openLoanLogs() {
    setSection('loans')
    loanTab.value = 'logs'
  }

  function setAssetCategory(category: string | number) {
    if (
      category !== 'all' &&
      category !== 'hardware' &&
      category !== 'network' &&
      category !== 'server'
    )
      return
    assetCategory.value = category
    assetSearch.value = ''
    statusFilter.value = 'all'
  }

  // ---- 资产增删改 ----
  function openCreateAsset() {
    const assetClass: AssetClass =
      activeSection.value === 'assets' && assetCategory.value !== 'all'
        ? assetCategory.value
        : activeSection.value === 'network'
          ? 'network'
          : activeSection.value === 'server'
            ? 'server'
            : 'hardware'
    editingId.value = null
    editingClass.value = assetClass
    Object.assign(assetDraft, createEmptyAsset(assetClass))
    assetDraft.id = `${assetClass === 'network' ? 'NET' : assetClass === 'server' ? 'SRV' : 'ZC'}-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
    assetModalOpen.value = true
  }

  function updateDraftClass(value: AssetClass) {
    if (editingId.value) return
    editingClass.value = value
    assetDraft.assetClass = value
    assetDraft.category =
      value === 'network' ? '网络设备' : value === 'server' ? '服务器设备' : '办公设备'
  }

  function openEditAsset(asset: Asset) {
    editingId.value = asset.id
    editingClass.value =
      asset.assetClass === 'network' || asset.assetClass === 'server'
        ? asset.assetClass
        : 'hardware'
    Object.assign(assetDraft, createEmptyAsset(editingClass.value), asset)
    assetModalOpen.value = true
  }

  function fieldValue(field: AssetField) {
    return (assetDraft as unknown as Record<string, string | number | undefined>)[field.key]
  }

  function setFieldValue(field: AssetField, value: string | number | undefined) {
    ;(assetDraft as unknown as Record<string, string | number | undefined>)[field.key] = value
  }

  async function saveAsset() {
    if (!assetDraft.id.trim() || !assetDraft.name.trim()) {
      void message.warning('请填写资产编号和资产名称')
      return
    }
    if (assets.value.some((item) => item.id === assetDraft.id && item.id !== editingId.value)) {
      void message.warning('资产编号已存在，请更换编号')
      return
    }
    if (!Number.isFinite(assetDraft.price) || assetDraft.price < 0) {
      void message.warning('请输入有效的采购金额')
      return
    }
    saving.value = true
    try {
      // 品牌型号与 brand/model 双向同步，保证列表与筛选口径一致
      const brandModel = assetDraft.brandModel?.trim() || ''
      const parsedBrand = assetDraft.brand?.trim() || (brandModel ? brandModel.split(/\s+/)[0] : '')
      const normalized: Asset = {
        ...assetDraft,
        id: assetDraft.id.trim(),
        name: assetDraft.name.trim(),
        category: assetDraft.category.trim() || '办公设备',
        location: assetDraft.location.trim(),
        owner: assetDraft.owner.trim(),
        brandModel: brandModel || [assetDraft.brand, assetDraft.model].filter(Boolean).join(' '),
        brand: parsedBrand,
        assetClass: editingClass.value,
        condition:
          assetDraft.status === '维修中'
            ? '维修中'
            : assetDraft.status === '报废'
              ? '已报废'
              : (assetDraft.condition ?? '良好'),
      }
      assets.value = await assetApi.save(normalized)
      assetModalOpen.value = false
      void message.success(editingId.value ? '资产信息已更新' : '资产已登记')
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '保存资产失败')
    } finally {
      saving.value = false
    }
  }

  function confirmDelete(asset: Asset) {
    Modal.confirm({
      title: '删除资产',
      content: `确定删除「${asset.name}」吗？此操作无法撤销。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        try {
          assets.value = await assetApi.remove(asset.id)
          void message.success('资产已删除')
        } catch (error) {
          void message.error(error instanceof Error ? error.message : '删除资产失败')
          throw error
        }
      },
    })
  }

  // ---- 借还登记（管理员） ----
  function openCheckout(asset: Asset) {
    if (!isAssetLendable(asset)) {
      if (asset.borrower && !asset.returned) {
        void message.warning('该资产当前已被领用')
      } else {
        void message.warning('通用、维修中或已报废的资产不能领用')
      }
      return
    }
    selectedLoanAsset.value = asset
    loanDraft.borrower = ''
    loanDraft.loanDate = today.value
    loanDraft.dueDate = ''
    loanModalOpen.value = true
  }

  async function saveCheckout() {
    const asset = selectedLoanAsset.value
    if (!asset || !loanDraft.borrower.trim()) {
      void message.warning('请填写借用人')
      return
    }
    if (loanDraft.dueDate && loanDraft.dueDate < loanDraft.loanDate) {
      void message.warning('预计归还日期不能早于领用日期')
      return
    }
    saving.value = true
    try {
      const updated: Asset = {
        ...asset,
        borrower: loanDraft.borrower.trim(),
        loanDate: loanDraft.loanDate,
        dueDate: loanDraft.dueDate,
        returned: false,
        status: '借出' as AssetStatus,
      }
      const transaction = await assetLoanLogApi.saveTransaction(
        updated,
        '领用',
        updated.borrower ?? '',
      )
      assets.value = transaction.assets
      loanLogs.value = [transaction.log, ...loanLogs.value]
      loanModalOpen.value = false
      void message.success('领用信息与操作日志已保存')
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '保存领用记录失败')
    } finally {
      saving.value = false
    }
  }

  function confirmReturn(asset: Asset) {
    Modal.confirm({
      title: '确认归还资产？',
      content: `确认「${asset.name}」已由 ${asset.borrower ?? '借用人'} 归还吗？系统将记录归还日志。`,
      okText: '确认归还',
      cancelText: '取消',
      async onOk() {
        try {
          const transaction = await assetLoanLogApi.saveTransaction(
            {
              ...asset,
              borrower: '',
              loanDate: '',
              dueDate: '',
              returned: true,
              status: '在库' as AssetStatus,
            },
            '归还',
            asset.borrower ?? '',
          )
          assets.value = transaction.assets
          loanLogs.value = [transaction.log, ...loanLogs.value]
          void message.success('资产已归还，操作日志已保存')
        } catch (error) {
          void message.error(error instanceof Error ? error.message : '保存归还记录失败')
          throw error
        }
      },
    })
  }

  async function logout() {
    try {
      await authApi.logout()
      await router.replace({ name: 'login' })
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '退出登录失败')
    }
  }

  return {
    // 常量
    statuses,
    // 数据
    assets,
    loanLogs,
    loanRequests,
    softwareAssets,
    virtualAssets,
    currentUser,
    isAdmin,
    canManage,
    roleLabel,
    displayPreferences,
    sitePreferences,
    // 界面状态
    loading,
    saving,
    activeSection,
    assetCategory,
    visibleColumnsByClass,
    columnPickerOpen,
    assetSearch,
    supplierFilter,
    statusFilter,
    loanSearch,
    loanFilter,
    loanTab,
    logSearch,
    logActionFilter,
    assetModalOpen,
    loanModalOpen,
    requestModalOpen,
    requestAsset,
    requestDraft,
    editingId,
    selectedLoanAsset,
    editingClass,
    assetDraft,
    loanDraft,
    today,
    // 派生
    dashboardMetrics,
    overdueAssets,
    dueSoonAssets,
    onLoanAssets,
    availableAssetIds,
    categoryRows,
    maxMonthlyAcquisitions,
    repairAssets,
    supplierOptions,
    filteredAssets,
    filteredLoanAssets,
    userAssets,
    filteredLoanLogs,
    pendingRequestCount,
    hardwareAvailableCount,
    hardwareAvailablePercent,
    renewalStats,
    quickNavEntries,
    assetColumnClass,
    moduleFields,
    columnOptions,
    moduleColumns,
    assetFields,
    // 操作
    loadData,
    refreshSoftware,
    refreshVirtual,
    setSection,
    openLoanLogs,
    setAssetCategory,
    openCreateAsset,
    updateDraftClass,
    openEditAsset,
    fieldValue,
    setFieldValue,
    saveAsset,
    confirmDelete,
    openCheckout,
    saveCheckout,
    confirmReturn,
    openLoanRequest,
    submitLoanRequest,
    reviewLoanRequest,
    updateVisibleColumns,
    resetVisibleColumns,
    exportHardwareCsv,
    exportLoanLogsCsv,
    isOverdue,
    classCount,
    logout,
  }
}

export type AssetWorkspace = ReturnType<typeof createAssetWorkspace>

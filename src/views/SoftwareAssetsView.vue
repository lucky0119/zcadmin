<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal, type TableColumnsType } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { softwareAssetApi } from '../services/assetApi'
import type {
  LicenseType,
  SoftwareAsset,
  SoftwareCategory,
  SoftwareStatus,
} from '../services/assetTypes'
import { daysUntil } from '../services/assetDashboard'
import { downloadCsv } from '../services/exportCsv'

const emit = defineEmits<{ changed: [] }>()

const rows = ref<SoftwareAsset[]>([])
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const categoryFilter = ref<SoftwareCategory>('办公软件')
const statusFilter = ref<SoftwareStatus | 'all'>('all')
const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const visibleColumns = ref<string[]>([
  'id',
  'name',
  'category',
  'version',
  'licenseType',
  'quota',
  'expiryDate',
  'supplier',
  'price',
  'assigned',
  'status',
  'notes',
])
const columnPickerOpen = ref(false)

const categories: SoftwareCategory[] = ['办公软件', '设计软件', '工具软件']
const licenseTypes: LicenseType[] = ['永久授权', '年度订阅', '破解版']
const statuses: SoftwareStatus[] = ['正常', '即将到期', '过期停用']

function createEmptySoftware(): SoftwareAsset {
  return {
    id: `SW-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    name: '',
    category: '办公软件',
    version: '',
    licenseType: '年度订阅',
    licenseTotal: 1,
    licenseUsed: 0,
    expiryDate: '',
    supplier: '',
    supplierUrl: '',
    price: 0,
    assignedUsers: '',
    assignedDepartments: '',
    status: '正常',
    notes: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
  }
}

const draft = reactive<SoftwareAsset>(createEmptySoftware())

interface LedgerField {
  key: keyof SoftwareAsset | 'quota' | 'assigned'
  label: string
  width?: number
}

const ledgerFields: LedgerField[] = [
  { key: 'id', label: '软件资产编号', width: 145 },
  { key: 'name', label: '软件名称', width: 200 },
  { key: 'category', label: '软件分类', width: 100 },
  { key: 'version', label: '版本号', width: 110 },
  { key: 'licenseType', label: '授权类型', width: 100 },
  { key: 'quota', label: '授权总数/已使用', width: 150 },
  { key: 'expiryDate', label: '授权到期日', width: 115 },
  { key: 'supplier', label: '供应商', width: 150 },
  { key: 'price', label: '采购金额', width: 110 },
  { key: 'assigned', label: '分配使用人 / 部门', width: 220 },
  { key: 'status', label: '资产状态', width: 100 },
  { key: 'notes', label: '备注', width: 240 },
]

const columnOptions = ledgerFields.map((field) => ({
  label: field.label,
  value: String(field.key),
}))

const columns = computed<TableColumnsType<SoftwareAsset>>(() => {
  const visible = new Set(visibleColumns.value)
  return [
    ...ledgerFields
      .filter((field) => visible.has(String(field.key)))
      .map((field) => ({
        title: field.label,
        dataIndex: field.key,
        key: field.key,
        width: field.width,
      })),
    { title: '操作', key: 'actions', fixed: 'right' as const, width: 120 },
  ]
})

const filteredRows = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase()
  return rows.value.filter((row) => {
    const matchesText =
      !query ||
      [
        row.id,
        row.name,
        row.version,
        row.supplier,
        row.assignedUsers,
        row.assignedDepartments,
        row.notes ?? '',
      ].some((value) => value.toLocaleLowerCase().includes(query))
    const matchesCategory = row.category === categoryFilter.value
    const matchesStatus = statusFilter.value === 'all' || row.status === statusFilter.value
    return matchesText && matchesCategory && matchesStatus
  })
})

const summary = computed(() => {
  const scoped = filteredRows.value
  const total = scoped.reduce((sum, row) => sum + row.licenseTotal, 0)
  const used = scoped.reduce((sum, row) => sum + row.licenseUsed, 0)
  return {
    total,
    used,
    percent: total ? Math.round((used / total) * 100) : 0,
    expiring: scoped.filter((row) => row.status === '即将到期').length,
    expired: scoped.filter((row) => row.status === '过期停用').length,
    value: scoped.reduce((sum, row) => sum + (row.price ?? 0), 0),
  }
})

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

function statusColor(status: SoftwareStatus) {
  if (status === '正常') return 'green'
  if (status === '即将到期') return 'orange'
  return 'red'
}

function expiryHint(record: SoftwareAsset) {
  const days = daysUntil(record.expiryDate)
  if (!record.expiryDate) return '永久有效'
  if (days === null) return record.expiryDate
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days <= 60) return `${days} 天后到期`
  return record.expiryDate
}

/** 依据到期日自动推导资产状态，减少录入错误 */
function deriveStatus(expiryDate: string, current: SoftwareStatus): SoftwareStatus {
  if (current === '过期停用') return current
  if (!expiryDate) return '正常'
  const days = daysUntil(expiryDate)
  if (days === null) return current
  if (days < 0) return '过期停用'
  if (days <= 60) return '即将到期'
  return '正常'
}

async function loadRows() {
  loading.value = true
  try {
    rows.value = await softwareAssetApi.list()
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '读取软件资产失败')
  } finally {
    loading.value = false
  }
}

function exportSoftwareCsv() {
  downloadCsv(
    '软件资产台账',
    [
      '软件名称',
      '分类',
      '版本',
      '授权类型',
      '授权总数',
      '已用授权',
      '到期日',
      '单价(元)',
      '供应商',
      '状态',
      '使用人',
      '使用部门',
    ],
    filteredRows.value.map((row) => [
      row.name,
      row.category,
      row.version,
      row.licenseType,
      row.licenseTotal,
      row.licenseUsed,
      row.expiryDate,
      row.price,
      row.supplier,
      row.status,
      row.assignedUsers,
      row.assignedDepartments,
    ]),
  )
  void message.success(`已导出 ${filteredRows.value.length} 条软件资产记录`)
}

function openCreate() {
  editingId.value = null
  Object.assign(draft, createEmptySoftware())
  // 新登记默认归入当前页签对应的分类
  draft.category = categoryFilter.value
  modalOpen.value = true
}

function openEdit(record: SoftwareAsset) {
  editingId.value = record.id
  Object.assign(draft, createEmptySoftware(), record)
  modalOpen.value = true
}

async function saveRow() {
  if (!draft.id.trim() || !draft.name.trim()) {
    void message.warning('请填写软件资产编号与软件名称')
    return
  }
  if (rows.value.some((row) => row.id === draft.id && row.id !== editingId.value)) {
    void message.warning('软件资产编号已存在')
    return
  }
  if (draft.licenseUsed > draft.licenseTotal) {
    void message.warning('已使用授权不能大于授权总数')
    return
  }
  saving.value = true
  try {
    const payload: SoftwareAsset = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      version: draft.version.trim(),
      supplier: draft.supplier.trim(),
      assignedUsers: draft.assignedUsers.trim(),
      assignedDepartments: draft.assignedDepartments.trim(),
      licenseTotal: Math.max(0, Math.floor(draft.licenseTotal)),
      licenseUsed: Math.max(0, Math.floor(draft.licenseUsed)),
      price: Number.isFinite(draft.price) ? draft.price : 0,
      status: deriveStatus(draft.expiryDate, draft.status),
    }
    rows.value = await softwareAssetApi.save(payload)
    modalOpen.value = false
    emit('changed')
    void message.success(editingId.value ? '软件资产已更新' : '软件资产已登记')
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '保存软件资产失败')
  } finally {
    saving.value = false
  }
}

function confirmDelete(record: SoftwareAsset) {
  Modal.confirm({
    title: '删除软件资产',
    content: `确定删除「${record.name}」吗？此操作无法撤销。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        rows.value = await softwareAssetApi.remove(record.id)
        emit('changed')
        void message.success('软件资产已删除')
      } catch (error) {
        void message.error(error instanceof Error ? error.message : '删除软件资产失败')
        throw error
      }
    },
  })
}

onMounted(loadRows)

/** 模板内统一取值，规避 optional 字段在模板类型推断中的歧义 */
function textField(key: keyof SoftwareAsset): string {
  const value = (draft as unknown as Record<string, unknown>)[key as string]
  return typeof value === 'string' ? value : ''
}

function setTextField(key: keyof SoftwareAsset, value: string) {
  ;(draft as unknown as Record<string, string>)[key as string] = value
}

function setStatus(value: string) {
  draft.status = value as SoftwareStatus
}

function setPrice(value: number | string | null) {
  draft.price = Number(value ?? 0)
}

function priceOf(row: SoftwareAsset): number {
  return typeof row.price === 'number' ? row.price : 0
}

const draftPrice = computed(() => priceOf(draft))

/** 兜底渲染：用于未单独定制的列 */
function fallbackCell(row: SoftwareAsset, dataIndex: unknown): string {
  const value = (row as unknown as Record<string, unknown>)[String(dataIndex)]
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function numberField(key: 'licenseTotal' | 'licenseUsed'): number {
  const value = draft[key]
  return typeof value === 'number' ? value : 0
}

function setNumberField(key: 'licenseTotal' | 'licenseUsed', value: number | string | null) {
  draft[key] = Number(value ?? 0)
}
</script>

<template>
  <div class="content-heading">
    <div>
      <h1>应用软件</h1>
      <p>按办公 / 设计 / 工具分类管理软件授权，跟踪授权占用与到期风险。</p>
    </div>
    <a-space>
      <a-button :loading="loading" @click="loadRows"
        ><template #icon><ReloadOutlined /></template>刷新</a-button
      >
      <a-button @click="exportSoftwareCsv">导出台账</a-button>
      <a-button type="primary" @click="openCreate"
        ><template #icon><PlusOutlined /></template>登记软件</a-button
      >
    </a-space>
  </div>

  <a-card :bordered="false" class="card-gap">
    <a-tabs v-model:active-key="categoryFilter" class="software-category-tabs">
      <a-tab-pane
        v-for="category in categories"
        :key="category"
        :tab="`${category}（${rows.filter((row) => row.category === category).length}）`"
      />
    </a-tabs>
    <div class="table-toolbar">
      <a-input
        v-model:value="keyword"
        allow-clear
        placeholder="搜索编号、名称、版本、供应商或使用人"
        class="toolbar-search"
      />
      <a-select v-model:value="statusFilter" class="toolbar-filter" aria-label="软件状态筛选">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option v-for="status in statuses" :key="status" :value="status">{{
          status
        }}</a-select-option>
      </a-select>
      <a-popover v-model:open="columnPickerOpen" trigger="click" placement="bottomRight">
        <template #content>
          <div class="column-picker">
            <a-checkbox-group v-model:value="visibleColumns" :options="columnOptions" />
          </div>
        </template>
        <a-button aria-label="字段显示设置"
          ><template #icon><SettingOutlined /></template>字段显示</a-button
        >
      </a-popover>
      <a-tag>{{ filteredRows.length }} 条记录</a-tag>
    </div>

    <a-table
      :columns="columns"
      :data-source="filteredRows"
      :loading="loading"
      :pagination="{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total: number) => `共 ${total} 条`,
      }"
      :scroll="{ x: 1500 }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'quota'">
          <div class="license-cell">
            <strong>{{ record.licenseUsed }} / {{ record.licenseTotal }}</strong>
            <a-progress
              :percent="
                record.licenseTotal
                  ? Math.round((record.licenseUsed / record.licenseTotal) * 100)
                  : 0
              "
              :show-info="false"
              size="small"
              :status="record.licenseUsed >= record.licenseTotal ? 'exception' : 'normal'"
            />
          </div>
        </template>
        <template v-else-if="column.key === 'price'">{{ formatCurrency(record.price) }}</template>
        <template v-else-if="column.key === 'expiryDate'">
          <span>{{ record.expiryDate || '永久' }}</span>
          <div class="cell-hint">{{ expiryHint(record) }}</div>
        </template>
        <template v-else-if="column.key === 'supplier'">
          <a
            v-if="record.supplierUrl"
            :href="record.supplierUrl"
            target="_blank"
            rel="noopener noreferrer"
            >{{ record.supplier || '查看' }}</a
          >
          <span v-else>{{ record.supplier || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'assigned'">
          <div>{{ record.assignedUsers || '—' }}</div>
          <div class="cell-hint">{{ record.assignedDepartments || '未指定部门' }}</div>
        </template>
        <template v-else-if="column.key === 'status'"
          ><a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag></template
        >
        <template v-else-if="column.key === 'actions'">
          <a-space>
            <a-button type="link" size="small" @click="openEdit(record)">编辑</a-button>
            <a-button type="link" danger size="small" @click="confirmDelete(record)">删除</a-button>
          </a-space>
        </template>
        <template v-else>{{ fallbackCell(record, column.dataIndex) }}</template>
      </template>
      <template #emptyText><a-empty description="暂无软件资产，点击右上角登记" /></template>
    </a-table>
  </a-card>

  <a-modal
    v-model:open="modalOpen"
    :title="editingId ? '编辑软件资产' : '登记软件资产'"
    width="820px"
    :confirm-loading="saving"
    @ok="saveRow"
  >
    <a-form layout="vertical" class="asset-form">
      <a-row :gutter="16">
        <a-col :xs="24" :sm="12"
          ><a-form-item label="软件资产编号" required
            ><a-input
              :value="textField('id')"
              @update:value="(value: string) => setTextField('id', value)"
              :disabled="Boolean(editingId)" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="软件名称" required
            ><a-input
              :value="textField('name')"
              @update:value="(value: string) => setTextField('name', value)"
              placeholder="如 Microsoft 365 商业标准版" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="软件分类">
            <a-select
              :value="textField('category')"
              @update:value="(value: string) => setTextField('category', value)"
            >
              <a-select-option v-for="category in categories" :key="category" :value="category">{{
                category
              }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="版本号"
            ><a-input
              :value="textField('version')"
              @update:value="(value: string) => setTextField('version', value)"
              placeholder="如 2026 / 2.0 企业版" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="授权类型">
            <a-select
              :value="textField('licenseType')"
              @update:value="(value: string) => setTextField('licenseType', value)"
            >
              <a-select-option v-for="type in licenseTypes" :key="type" :value="type">{{
                type
              }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="授权总数"
            ><a-input-number
              :value="numberField('licenseTotal')"
              :min="0"
              class="full-width-input"
              @update:value="
                (value: number | string | null) => setNumberField('licenseTotal', value)
              " /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="已使用授权"
            ><a-input-number
              :value="numberField('licenseUsed')"
              :min="0"
              :max="numberField('licenseTotal')"
              class="full-width-input"
              @update:value="
                (value: number | string | null) => setNumberField('licenseUsed', value)
              " /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="授权到期日">
            <a-input
              :value="textField('expiryDate')"
              type="date"
              @update:value="(value: string) => setTextField('expiryDate', value)"
            />
            <div class="settings-help">永久授权可留空；到期前 60 天自动标记为「即将到期」</div>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="供应商"
            ><a-input
              :value="textField('supplier')"
              placeholder="如 微软（中国）"
              @update:value="(value: string) => setTextField('supplier', value)" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="采购 / 续费链接"
            ><a-input
              :value="textField('supplierUrl')"
              placeholder="https://"
              @update:value="(value: string) => setTextField('supplierUrl', value)" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="采购金额（元）"
            ><a-input-number
              :value="draftPrice"
              :min="0"
              :precision="2"
              class="full-width-input"
              @update:value="setPrice" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="分配使用人"
            ><a-input
              :value="textField('assignedUsers')"
              placeholder="如 全公司 / 张三、李四"
              @update:value="
                (value: string) => setTextField('assignedUsers', value)
              " /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="分配使用部门"
            ><a-input
              :value="textField('assignedDepartments')"
              placeholder="如 设计部、工程部"
              @update:value="
                (value: string) => setTextField('assignedDepartments', value)
              " /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="资产状态">
            <a-select :value="textField('status')" @update:value="setStatus">
              <a-select-option v-for="status in statuses" :key="status" :value="status">{{
                status
              }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :span="24"
          ><a-form-item label="备注"
            ><a-textarea
              :value="textField('notes')"
              :rows="2"
              placeholder="授权密钥、许可文件存放位置等"
              @update:value="(value: string) => setTextField('notes', value)" /></a-form-item
        ></a-col>
      </a-row>
    </a-form>
  </a-modal>
</template>

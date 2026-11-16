<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal, type TableColumnsType } from 'ant-design-vue'
import { BellOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons-vue'
import { virtualAssetApi } from '../services/assetApi'
import type { VirtualAsset, VirtualCategory, VirtualStatus } from '../services/assetTypes'
import { daysUntil } from '../services/assetDashboard'
import { downloadCsv } from '../services/exportCsv'

const emit = defineEmits<{ changed: [] }>()

function exportVirtualCsv() {
  downloadCsv(
    '虚拟资产台账',
    ['资源名称', '分类', '账号/主体', '服务商', '到期日', '年费(元)', '负责人', '关联业务', '状态'],
    rows.value.map((row) => [
      row.name,
      row.category,
      row.account,
      row.provider ?? '',
      row.expiryDate,
      row.price ?? 0,
      row.manager,
      row.business,
      row.status,
    ]),
  )
  void message.success(`已导出 ${rows.value.length} 条虚拟资产记录`)
}

const rows = ref<VirtualAsset[]>([])
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const categoryFilter = ref<VirtualCategory | 'all'>('all')
const statusFilter = ref<VirtualStatus | 'all'>('all')
const onlyReminder = ref(false)
const modalOpen = ref(false)
const editingId = ref<string | null>(null)

const categories: VirtualCategory[] = [
  '域名',
  '企业邮箱',
  '云服务器',
  '云存储',
  '系统账号',
  '业务文件',
  'SSL 证书',
]
const statuses: VirtualStatus[] = ['正常', '即将到期', '已停用']

function createEmptyVirtual(): VirtualAsset {
  return {
    id: `VA-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    name: '',
    category: '域名',
    account: '',
    expiryDate: '',
    manager: '',
    business: '',
    reminder: { enabled: true, days: 30 },
    status: '正常',
    provider: '',
    price: 0,
    notes: '',
  }
}

const draft = reactive<VirtualAsset>(createEmptyVirtual())

const columns: TableColumnsType<VirtualAsset> = [
  { title: '资源编号', dataIndex: 'id', key: 'id', width: 140 },
  { title: '资源名称', dataIndex: 'name', key: 'name', width: 190 },
  { title: '资源分类', dataIndex: 'category', key: 'category', width: 110 },
  { title: '账号 / 标识', dataIndex: 'account', key: 'account', width: 200 },
  { title: '有效期', dataIndex: 'expiryDate', key: 'expiryDate', width: 200 },
  { title: '管理员', dataIndex: 'manager', key: 'manager', width: 110 },
  { title: '关联业务', dataIndex: 'business', key: 'business', width: 170 },
  { title: '到期提醒', key: 'reminder', width: 140 },
  { title: '状态', key: 'status', width: 100 },
  { title: '备注', dataIndex: 'notes', key: 'notes', width: 220 },
  { title: '操作', key: 'actions', fixed: 'right', width: 120 },
]

const filteredRows = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase()
  return rows.value.filter((row) => {
    const matchesText =
      !query ||
      [
        row.id,
        row.name,
        row.account,
        row.manager,
        row.business,
        row.provider ?? '',
        row.notes ?? '',
      ].some((value) => value.toLocaleLowerCase().includes(query))
    const matchesCategory = categoryFilter.value === 'all' || row.category === categoryFilter.value
    const matchesStatus = statusFilter.value === 'all' || row.status === statusFilter.value
    const matchesReminder = !onlyReminder.value || isReminderDue(row)
    return matchesText && matchesCategory && matchesStatus && matchesReminder
  })
})

const summary = computed(() => ({
  total: rows.value.length,
  expiring: rows.value.filter((row) => row.status === '即将到期').length,
  stopped: rows.value.filter((row) => row.status === '已停用').length,
  reminder: rows.value.filter(isReminderDue).length,
  yearlyCost: rows.value.reduce((sum, row) => sum + (row.price ?? 0), 0),
  categoryRows: categories
    .map((category) => ({
      category,
      count: rows.value.filter((row) => row.category === category).length,
    }))
    .filter((row) => row.count > 0),
}))

function isReminderDue(row: VirtualAsset) {
  if (!row.reminder?.enabled || row.status === '已停用') return false
  const days = daysUntil(row.expiryDate)
  return days !== null && days <= row.reminder.days
}

function expiryText(row: VirtualAsset) {
  if (!row.expiryDate) return '长期有效'
  const days = daysUntil(row.expiryDate)
  if (days === null) return row.expiryDate
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  return `${row.expiryDate}（剩 ${days} 天）`
}

function statusColor(status: VirtualStatus) {
  if (status === '正常') return 'green'
  if (status === '即将到期') return 'orange'
  return 'default'
}

function formatCurrency(value: number | undefined) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

async function loadRows() {
  loading.value = true
  try {
    rows.value = await virtualAssetApi.list()
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '读取虚拟资产失败')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(draft, createEmptyVirtual())
  modalOpen.value = true
}

function openEdit(record: VirtualAsset) {
  editingId.value = record.id
  Object.assign(draft, createEmptyVirtual(), record, { reminder: { ...record.reminder } })
  modalOpen.value = true
}

async function saveRow() {
  if (!draft.id.trim() || !draft.name.trim()) {
    void message.warning('请填写资源编号与资源名称')
    return
  }
  if (rows.value.some((row) => row.id === draft.id && row.id !== editingId.value)) {
    void message.warning('资源编号已存在')
    return
  }
  saving.value = true
  try {
    const days = draft.expiryDate ? daysUntil(draft.expiryDate) : null
    const reminderDays = Math.max(0, Math.floor(draft.reminder.days))
    // 已停用保持人工判定；其余按有效期自动收敛为「即将到期 / 正常」
    const status: VirtualStatus =
      draft.status === '已停用'
        ? '已停用'
        : days !== null && draft.reminder.enabled && days <= reminderDays
          ? '即将到期'
          : '正常'
    const payload: VirtualAsset = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      account: draft.account.trim(),
      manager: draft.manager.trim(),
      business: draft.business.trim(),
      status,
      reminder: {
        enabled: draft.reminder.enabled,
        days: reminderDays,
      },
      price: Number.isFinite(draft.price) ? draft.price : 0,
    }
    rows.value = await virtualAssetApi.save(payload)
    modalOpen.value = false
    emit('changed')
    void message.success(editingId.value ? '虚拟资产已更新' : '虚拟资产已登记')
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '保存虚拟资产失败')
  } finally {
    saving.value = false
  }
}

function confirmDelete(record: VirtualAsset) {
  Modal.confirm({
    title: '删除虚拟资产',
    content: `确定删除「${record.name}」吗？此操作无法撤销。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        rows.value = await virtualAssetApi.remove(record.id)
        emit('changed')
        void message.success('虚拟资产已删除')
      } catch (error) {
        void message.error(error instanceof Error ? error.message : '删除虚拟资产失败')
        throw error
      }
    },
  })
}

onMounted(loadRows)
</script>

<template>
  <div class="content-heading">
    <div>
      <h1>虚拟资产</h1>
      <p>域名、企业邮箱、云资源、系统账号与证书统一纳管，到期前自动提醒。</p>
    </div>
    <a-space>
      <a-button :loading="loading" @click="loadRows"
        ><template #icon><ReloadOutlined /></template>刷新</a-button
      >
      <a-button @click="exportVirtualCsv">导出台账</a-button>
      <a-button type="primary" @click="openCreate"
        ><template #icon><PlusOutlined /></template>登记资源</a-button
      >
    </a-space>
  </div>
  <a-card :bordered="false" class="card-gap">
    <div class="table-toolbar">
      <a-input
        v-model:value="keyword"
        allow-clear
        placeholder="搜索名称、账号、管理员或关联业务"
        class="toolbar-search"
      />
      <a-select v-model:value="categoryFilter" class="toolbar-filter" aria-label="资源分类筛选">
        <a-select-option value="all">全部分类</a-select-option>
        <a-select-option v-for="category in categories" :key="category" :value="category">{{
          category
        }}</a-select-option>
      </a-select>
      <a-select v-model:value="statusFilter" class="toolbar-filter" aria-label="资源状态筛选">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option v-for="status in statuses" :key="status" :value="status">{{
          status
        }}</a-select-option>
      </a-select>
      <a-button :type="onlyReminder ? 'primary' : 'default'" @click="onlyReminder = !onlyReminder">
        <template #icon><BellOutlined /></template>
        仅看到期提醒
      </a-button>
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
      :scroll="{ x: 1600 }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'expiryDate'">
          <span :class="{ 'text-danger': isReminderDue(record) }">{{ expiryText(record) }}</span>
          <div class="cell-hint">
            {{ record.provider || '—'
            }}<template v-if="record.price"> · {{ formatCurrency(record.price) }}/年</template>
          </div>
        </template>
        <template v-else-if="column.key === 'account'">
          <code>{{ record.account || '—' }}</code>
        </template>
        <template v-else-if="column.key === 'reminder'">
          <a-tag v-if="!record.reminder?.enabled">已关闭</a-tag>
          <a-tag v-else :color="isReminderDue(record) ? 'red' : 'blue'">
            <template #icon><BellOutlined /></template>
            提前 {{ record.reminder.days }} 天
          </a-tag>
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
        <template v-else>{{ record[column.dataIndex] || '—' }}</template>
      </template>
      <template #emptyText><a-empty description="暂无虚拟资产记录" /></template>
    </a-table>
  </a-card>

  <a-modal
    v-model:open="modalOpen"
    :title="editingId ? '编辑虚拟资产' : '登记虚拟资产'"
    width="760px"
    :confirm-loading="saving"
    @ok="saveRow"
  >
    <a-form layout="vertical" class="asset-form">
      <a-row :gutter="16">
        <a-col :xs="24" :sm="12"
          ><a-form-item label="资源编号" required
            ><a-input v-model:value="draft.id" :disabled="Boolean(editingId)" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="资源名称" required
            ><a-input v-model:value="draft.name" placeholder="如 企业官网主域名" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="资源分类">
            <a-select v-model:value="draft.category">
              <a-select-option v-for="category in categories" :key="category" :value="category">{{
                category
              }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="账号 / 标识"
            ><a-input
              v-model:value="draft.account"
              placeholder="域名、账号、实例名或证书域名" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="有效期截止日"
            ><a-input v-model:value="draft.expiryDate" type="date" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="管理员"
            ><a-input v-model:value="draft.manager" placeholder="资源责任人" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="关联业务"
            ><a-input
              v-model:value="draft.business"
              placeholder="如 官网 / 核心业务系统" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="资源提供方"
            ><a-input v-model:value="draft.provider" placeholder="如 阿里云 ECS" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12"
          ><a-form-item label="年费用（元）"
            ><a-input-number
              v-model:value="draft.price"
              :min="0"
              :precision="2"
              class="full-width-input" /></a-form-item
        ></a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="资产状态">
            <a-select v-model:value="draft.status">
              <a-select-option v-for="status in statuses" :key="status" :value="status">{{
                status
              }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item label="到期提醒">
            <a-space>
              <a-switch v-model:checked="draft.reminder.enabled" />
              <span>提前</span>
              <a-input-number
                v-model:value="draft.reminder.days"
                :min="0"
                :max="365"
                :disabled="!draft.reminder.enabled"
              />
              <span>天提醒</span>
            </a-space>
          </a-form-item>
        </a-col>
        <a-col :span="24"
          ><a-form-item label="备注"
            ><a-textarea
              v-model:value="draft.notes"
              :rows="2"
              placeholder="账号存放位置、续费流程等" /></a-form-item
        ></a-col>
      </a-row>
    </a-form>
  </a-modal>
</template>

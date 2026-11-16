<script setup lang="ts">
import {
  formatDateTime,
  loanColumns,
  logColumns,
  requestColumns,
  requestStatusColor,
  userLoanColumns,
  userRequestColumns,
} from '../helpers'
import { normalizeStatus } from '../../../services/assetDashboard'
import { isAssetLendable } from '../../../services/assetDashboard'
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()
</script>

<template>
  <div class="content-heading">
    <div>
      <h1>领用归还</h1>
      <p>
        {{
          ws.canManage
            ? '管理资产借用状态、审批领用申请，并按操作记录查询历史日志。'
            : '选择可领用资产提交领用申请，管理员审批通过后即可领用。'
        }}
      </p>
    </div>
    <a-button v-if="ws.canManage" @click="ws.exportLoanLogsCsv">导出日志</a-button>
  </div>
  <a-card :bordered="false" class="card-gap">
    <a-tabs v-if="ws.canManage" v-model:active-key="ws.loanTab">
      <a-tab-pane key="records" tab="资产借用台账">
        <div class="table-toolbar">
          <a-input
            v-model:value="ws.loanSearch"
            allow-clear
            placeholder="搜索资产、编号或借用人"
            class="toolbar-search"
          />
          <a-select v-model:value="ws.loanFilter" class="toolbar-filter" aria-label="借用状态筛选">
            <a-select-option value="all">全部状态</a-select-option>
            <a-select-option value="available">可领用</a-select-option>
            <a-select-option value="on-loan">领用中</a-select-option>
            <a-select-option value="overdue">已逾期</a-select-option>
            <a-select-option value="repair">维修中</a-select-option>
          </a-select>
        </div>
        <a-table
          :columns="loanColumns"
          :data-source="ws.filteredLoanAssets"
          :loading="ws.loading"
          :pagination="{ pageSize: 10, showTotal: (total: number) => `共 ${total} 条` }"
          :scroll="{ x: 1050 }"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'condition'"
              ><a-tag
                :color="
                  record.condition === '维修中'
                    ? 'orange'
                    : record.condition === '已报废'
                      ? 'default'
                      : 'green'
                "
                >{{ record.condition || '良好' }}</a-tag
              ></template
            >
            <template v-else-if="column.key === 'loanStatus'">
              <a-tag
                v-if="record.borrower && !record.returned"
                :color="ws.isOverdue(record) ? 'red' : 'blue'"
                >{{ ws.isOverdue(record) ? '已逾期' : '领用中' }}</a-tag
              >
              <a-tag v-else-if="normalizeStatus(record.status) === '维修中'" color="orange"
                >维修中</a-tag
              >
              <a-tag v-else>可领用</a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-space>
                <a-button
                  v-if="record.borrower && !record.returned"
                  type="link"
                  size="small"
                  @click="ws.confirmReturn(record)"
                  >归还</a-button
                >
                <a-button
                  v-else
                  type="link"
                  size="small"
                  :disabled="!isAssetLendable(record)"
                  @click="ws.openCheckout(record)"
                  >领用</a-button
                >
                <a-button type="link" size="small" @click="ws.openEditAsset(record)">编辑</a-button>
              </a-space>
            </template>
          </template>
          <template #emptyText><a-empty description="没有符合条件的资产" /></template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="approve" :tab="`领用审批（${ws.pendingRequestCount}）`">
        <a-table
          :columns="requestColumns"
          :data-source="ws.loanRequests"
          :loading="ws.loading"
          :pagination="{ pageSize: 10, showTotal: (total: number) => `共 ${total} 条申请` }"
          :scroll="{ x: 1000 }"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'requestedAt'">{{
              formatDateTime(record.requestedAt)
            }}</template>
            <template v-else-if="column.key === 'status'"
              ><a-tag :color="requestStatusColor(record.status)">{{
                record.status
              }}</a-tag></template
            >
            <template v-else-if="column.key === 'actions'">
              <a-space v-if="record.status === '待审批'">
                <a-button type="link" size="small" @click="ws.reviewLoanRequest(record, 'approve')"
                  >批准</a-button
                >
                <a-button
                  type="link"
                  danger
                  size="small"
                  @click="ws.reviewLoanRequest(record, 'reject')"
                  >拒绝</a-button
                >
              </a-space>
              <span v-else class="request-reviewed-at">{{
                record.reviewedAt ? formatDateTime(record.reviewedAt) : '—'
              }}</span>
            </template>
          </template>
          <template #emptyText><a-empty description="暂无领用申请" /></template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="logs" tab="领用归还日志">
        <div class="table-toolbar">
          <a-input
            v-model:value="ws.logSearch"
            allow-clear
            placeholder="搜索资产、编号、借用人或操作人"
            class="toolbar-search"
          />
          <a-select
            v-model:value="ws.logActionFilter"
            class="toolbar-filter"
            aria-label="日志操作类型"
          >
            <a-select-option value="all">全部操作</a-select-option>
            <a-select-option value="领用">领用</a-select-option>
            <a-select-option value="归还">归还</a-select-option>
          </a-select>
        </div>
        <a-table
          :columns="logColumns"
          :data-source="ws.filteredLoanLogs"
          :pagination="{ pageSize: 10, showTotal: (total: number) => `共 ${total} 条日志` }"
          :scroll="{ x: 900 }"
          row-key="id"
          size="middle"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'eventAt'">{{
              formatDateTime(record.eventAt)
            }}</template>
            <template v-else-if="column.key === 'action'"
              ><a-tag :color="record.action === '领用' ? 'blue' : 'green'">{{
                record.action
              }}</a-tag></template
            >
          </template>
          <template #emptyText><a-empty description="暂无操作日志" /></template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
    <a-tabs v-else v-model:active-key="ws.loanTab">
      <a-tab-pane key="records" tab="可领用资产">
        <div class="table-toolbar">
          <a-input
            v-model:value="ws.loanSearch"
            allow-clear
            placeholder="搜索资产名称或编号"
            class="toolbar-search"
          />
        </div>
        <a-table
          :columns="userLoanColumns"
          :data-source="ws.userAssets"
          :loading="ws.loading"
          :pagination="{ pageSize: 10, showTotal: (total: number) => `共 ${total} 项` }"
          :scroll="{ x: 800 }"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'loanStatus'">
              <a-tag v-if="record.borrower && !record.returned" color="blue">领用中</a-tag>
              <a-tag v-else-if="normalizeStatus(record.status) === '维修中'" color="orange"
                >维修中</a-tag
              >
              <a-tag v-else color="green">可领用</a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button
                v-if="isAssetLendable(record)"
                type="link"
                size="small"
                @click="ws.openLoanRequest(record)"
                >申请领用</a-button
              >
              <span v-else>—</span>
            </template>
          </template>
          <template #emptyText><a-empty description="没有符合条件的资产" /></template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane
        key="requests"
        :tab="`我的申请（${ws.loanRequests.filter((item) => item.status === '待审批').length}）`"
      >
        <a-table
          :columns="userRequestColumns"
          :data-source="ws.loanRequests"
          :loading="ws.loading"
          :pagination="{ pageSize: 10, showTotal: (total: number) => `共 ${total} 条申请` }"
          :scroll="{ x: 850 }"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'requestedAt'">{{
              formatDateTime(record.requestedAt)
            }}</template>
            <template v-else-if="column.key === 'status'"
              ><a-tag :color="requestStatusColor(record.status)">{{
                record.status
              }}</a-tag></template
            >
          </template>
          <template #emptyText
            ><a-empty description="暂无领用申请，可在「可领用资产」中提交"
          /></template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </a-card>
</template>

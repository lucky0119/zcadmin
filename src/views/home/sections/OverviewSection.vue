<script setup lang="ts">
import { computed } from 'vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import {
  formatCurrency,
  formatDateTime,
  logColumns,
  overviewColumns,
  statusColor,
} from '../helpers'
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()

/** 状态环形图：按 statusRows 顺序计算各段弧长与起始偏移 */
const DONUT_RADIUS = 45
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS
const donutSegments = computed(() => {
  const rows = ws.dashboardMetrics.statusRows.filter((row) => row.count > 0)
  let consumed = 0
  return rows.map((row) => {
    const len = (row.ratio / 100) * DONUT_CIRC
    const segment = {
      status: row.status,
      color: row.color,
      count: row.count,
      len: Math.max(len - 1.6, 0.6),
      offset: -consumed,
    }
    consumed += len
    return segment
  })
})
</script>

<template>
  <div class="content-heading dashboard-heading">
    <div>
      <h1>资产总览</h1>
      <p>硬件、软件授权与虚拟资源统一台账，资产规模与风险一屏掌握。</p>
    </div>
    <a-space>
      <a-button :loading="ws.loading" @click="ws.loadData">刷新数据</a-button>
      <a-button type="primary" @click="ws.openCreateAsset"
        ><template #icon><PlusOutlined /></template>登记资产</a-button
      >
    </a-space>
  </div>

  <a-row :gutter="[16, 16]" class="dashboard-kpis">
    <a-col :xs="12" :xl="6">
      <a-card class="dashboard-kpi dashboard-kpi-purple" :bordered="false">
        <a-statistic title="资产总数" :value="ws.dashboardMetrics.totalAssets" suffix="项" />
        <div class="summary-caption">
          办公 {{ ws.classCount('hardware') }} · 网络 {{ ws.classCount('network') }} · 服务器
          {{ ws.classCount('server') }}
        </div>
      </a-card>
    </a-col>
    <a-col :xs="12" :xl="6">
      <a-card class="dashboard-kpi dashboard-kpi-blue" :bordered="false">
        <a-statistic title="硬件资产总值" :value="ws.dashboardMetrics.totalValue" prefix="¥" />
        <div class="summary-caption">
          软件许可 {{ formatCurrency(ws.dashboardMetrics.software.value) }} · 虚拟年费
          {{ formatCurrency(ws.dashboardMetrics.virtual.yearlyCost) }}
        </div>
      </a-card>
    </a-col>
    <a-col :xs="12" :xl="6">
      <a-card class="dashboard-kpi dashboard-kpi-green" :bordered="false">
        <a-statistic
          title="软件授权占用"
          :value="ws.dashboardMetrics.software.usagePercent"
          suffix="%"
        />
        <div class="summary-caption">
          已用 {{ ws.dashboardMetrics.software.usedLicense }} /
          {{ ws.dashboardMetrics.software.totalLicense }} 个授权
        </div>
      </a-card>
    </a-col>
    <a-col :xs="12" :xl="6">
      <a-card class="dashboard-kpi dashboard-kpi-orange" :bordered="false">
        <a-statistic
          title="到期风险"
          :value="
            ws.dashboardMetrics.software.expiringCount + ws.dashboardMetrics.virtual.expiringCount
          "
          suffix="项"
        />
        <div class="summary-caption">
          软件 {{ ws.dashboardMetrics.software.expiringCount }} · 虚拟资源
          {{ ws.dashboardMetrics.virtual.expiringCount }}
        </div>
      </a-card>
    </a-col>
  </a-row>

  <a-row :gutter="[16, 16]" class="dashboard-charts">
    <a-col :xs="24" :xl="8">
      <a-card title="资产类别构成" :bordered="false" class="dashboard-chart-card">
        <div class="dashboard-class-list">
          <div
            v-for="row in ws.dashboardMetrics.classRows"
            :key="row.key"
            class="dashboard-class-row"
          >
            <div class="dashboard-chart-label">
              <span class="dashboard-legend-name"
                ><i :style="{ backgroundColor: row.color }" />{{ row.label }}</span
              >
              <strong
                >{{ row.count }} 项 <small>{{ row.percent }}%</small></strong
              >
            </div>
            <div class="dashboard-bar-track">
              <span :style="{ width: `${row.ratio}%`, backgroundColor: row.color }" />
            </div>
            <div class="dashboard-chart-footnote">采购金额 {{ formatCurrency(row.value) }}</div>
          </div>
          <div class="dashboard-class-row">
            <div class="dashboard-chart-label">
              <span class="dashboard-legend-name"
                ><i style="background-color: #2f9e8f" />软件授权</span
              >
              <strong
                >{{ ws.dashboardMetrics.software.total }} 套
                <small>{{ ws.dashboardMetrics.software.totalLicense }} 个授权</small></strong
              >
            </div>
            <div class="dashboard-bar-track">
              <span style="width: 100%; background-color: #2f9e8f" />
            </div>
            <div class="dashboard-chart-footnote">
              采购金额 {{ formatCurrency(ws.dashboardMetrics.software.value) }}
            </div>
          </div>
          <div class="dashboard-class-row">
            <div class="dashboard-chart-label">
              <span class="dashboard-legend-name"
                ><i style="background-color: #7d6fd9" />虚拟资源</span
              >
              <strong
                >{{ ws.dashboardMetrics.virtual.total }} 项
                <small
                  >{{ formatCurrency(ws.dashboardMetrics.virtual.yearlyCost) }}/年</small
                ></strong
              >
            </div>
            <div class="dashboard-bar-track">
              <span style="width: 100%; background-color: #7d6fd9" />
            </div>
            <div class="dashboard-chart-footnote">
              到期提醒触发 {{ ws.dashboardMetrics.virtual.reminders.length }} 项
            </div>
          </div>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="24" :xl="8">
      <a-card title="硬件资产状态分布" :bordered="false" class="dashboard-chart-card">
        <div class="dashboard-status-block">
          <div class="dashboard-status-top">
            <div class="dashboard-donut-wrap">
              <svg
                class="dashboard-donut"
                viewBox="0 0 120 120"
                role="img"
                aria-label="资产状态占比环形图"
              >
                <circle
                  class="dashboard-donut-track"
                  cx="60"
                  cy="60"
                  r="45"
                  fill="none"
                  stroke="#eef0f6"
                  stroke-width="13"
                />
                <g transform="rotate(-90 60 60)">
                  <circle
                    v-for="segment in donutSegments"
                    :key="segment.status"
                    cx="60"
                    cy="60"
                    r="45"
                    fill="none"
                    :stroke="segment.color"
                    stroke-width="13"
                    :stroke-dasharray="`${segment.len} ${DONUT_CIRC}`"
                    :stroke-dashoffset="segment.offset"
                  >
                    <title>{{ segment.status }} {{ segment.count }} 项</title>
                  </circle>
                </g>
              </svg>
              <div class="dashboard-donut-center">
                <strong>{{ ws.dashboardMetrics.totalAssets }}</strong>
                <span>项资产</span>
              </div>
            </div>
            <div class="dashboard-legend-v">
              <div
                v-for="row in ws.dashboardMetrics.statusRows"
                :key="row.status"
                class="dashboard-legend-row"
              >
                <span class="dashboard-legend-name"
                  ><i :style="{ backgroundColor: row.color }" />{{ row.status }}</span
                >
                <div class="dashboard-legend-meter">
                  <span :style="{ width: `${row.percent}%`, backgroundColor: row.color }" />
                </div>
                <strong
                  >{{ row.count }} <small>{{ row.percent }}%</small></strong
                >
              </div>
            </div>
          </div>

          <div class="dashboard-renew-block">
            <div class="dashboard-renew-head">
              <span>未来 12 个月需续费支出 <a-tag color="red">软件 + 虚拟</a-tag></span>
              <strong class="dashboard-renew-amount">{{
                formatCurrency(ws.renewalStats.total)
              }}</strong>
            </div>
            <div class="dashboard-renew-cols">
              <div class="dashboard-renew-item">
                <span class="dashboard-legend-name"
                  ><i style="background-color: #2f9e8f" />应用软件订阅</span
                >
                <strong>{{ formatCurrency(ws.renewalStats.software.total) }}</strong>
                <small>{{ ws.renewalStats.software.count }} 项年度订阅</small>
              </div>
              <div class="dashboard-renew-item">
                <span class="dashboard-legend-name"
                  ><i style="background-color: #7d6fd9" />虚拟资产年费</span
                >
                <strong>{{ formatCurrency(ws.renewalStats.virtual.total) }}</strong>
                <small>{{ ws.renewalStats.virtual.count }} 项资源（域名 / 云 / 证书）</small>
              </div>
            </div>
          </div>

          <div class="dashboard-followup-summary">
            <a-tag color="red">逾期未还 {{ ws.dashboardMetrics.overdueCount }} 项</a-tag>
            <a-tag color="orange">维修中 {{ ws.dashboardMetrics.repairCount }} 项</a-tag>
            <a-tag color="blue">借出中 {{ ws.dashboardMetrics.onLoanCount }} 项</a-tag>
          </div>
          <div class="dashboard-status-note">
            可用率
            <strong>{{ ws.hardwareAvailablePercent }}%</strong>
            （{{ ws.hardwareAvailableCount }} /
            {{ ws.dashboardMetrics.totalAssets }} 项处于在库或在用）
          </div>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="24" :xl="8">
      <a-card title="到期与续费提醒" :bordered="false" class="dashboard-chart-card">
        <template #extra
          ><a-button type="link" @click="ws.setSection('virtual')">管理虚拟资产</a-button></template
        >
        <a-list
          v-if="ws.dashboardMetrics.virtual.reminders.length"
          size="small"
          :data-source="ws.dashboardMetrics.virtual.reminders.slice(0, 5)"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta
                :title="item.name"
                :description="`${item.category} · ${item.expiryDate} · ${item.manager}`"
              />
              <a-tag color="orange">提前 {{ item.reminder.days }} 天提醒</a-tag>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-else description="暂无到期的虚拟资源" />
      </a-card>
    </a-col>
  </a-row>
  <a-row :gutter="[16, 16]" class="dashboard-activity">
    <a-col :xs="24" :xl="14">
      <a-card title="近期采购资产" :bordered="false">
        <template #extra
          ><a-button type="link" @click="ws.setSection('assets')"
            >查看硬件资产台账</a-button
          ></template
        >
        <a-table
          :columns="overviewColumns"
          :data-source="ws.dashboardMetrics.recentAssets"
          :loading="ws.loading"
          :pagination="false"
          :scroll="{ x: 1150 }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'"
              ><a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag></template
            >
            <template v-else-if="column.key === 'price'">{{
              formatCurrency(record.price)
            }}</template>
            <template v-else-if="column.key === 'owner'">{{ record.owner || '—' }}</template>
            <template v-else-if="column.key === 'actions'">
              <a-space
                ><a-button type="link" size="small" @click="ws.openEditAsset(record)">编辑</a-button
                ><a-button type="link" danger size="small" @click="ws.confirmDelete(record)"
                  >删除</a-button
                ></a-space
              >
            </template>
          </template>
          <template #emptyText><a-empty description="暂无资产数据" /></template>
        </a-table>
      </a-card>
    </a-col>
    <a-col :xs="24" :xl="10">
      <a-card title="待关注事项" :bordered="false">
        <template #extra
          ><a-button type="link" @click="ws.setSection('loans')">管理领用</a-button></template
        >
        <a-list
          v-if="ws.overdueAssets.length || ws.dueSoonAssets.length"
          size="small"
          :data-source="[...ws.overdueAssets, ...ws.dueSoonAssets].slice(0, 5)"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <a-list-item-meta
                :title="item.name"
                :description="`${item.borrower} · ${item.dueDate || '未设置归还日期'}`"
              />
              <a-tag :color="ws.isOverdue(item) ? 'red' : 'orange'">{{
                ws.isOverdue(item) ? '已逾期' : '即将到期'
              }}</a-tag>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-else description="暂无临近归还的领用事项" />
      </a-card>
    </a-col>
  </a-row>

  <a-card title="最近领用归还" :bordered="false" class="dashboard-activity">
    <template #extra
      ><a-button type="link" @click="ws.openLoanLogs">查看操作日志</a-button></template
    >
    <a-table
      :columns="logColumns"
      :data-source="ws.dashboardMetrics.recentLogs"
      :pagination="false"
      :scroll="{ x: 850 }"
      row-key="id"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'eventAt'">{{ formatDateTime(record.eventAt) }}</template>
        <template v-else-if="column.key === 'action'"
          ><a-tag :color="record.action === '领用' ? 'blue' : 'green'">{{
            record.action
          }}</a-tag></template
        >
      </template>
      <template #emptyText><a-empty description="暂无借还操作记录" /></template>
    </a-table>
  </a-card>
</template>

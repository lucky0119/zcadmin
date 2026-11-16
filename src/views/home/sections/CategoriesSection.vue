<script setup lang="ts">
import { categoryColumns, formatCurrency } from '../helpers'
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()
</script>

<template>
  <div class="content-heading">
    <div>
      <h1>分类管理</h1>
      <p>按管理办法的三类资产汇总数量、状态与价值。</p>
    </div>
  </div>
  <a-row :gutter="[16, 16]" class="dashboard-charts">
    <a-col :xs="24" :lg="8">
      <a-card title="硬件资产分类" :bordered="false" class="dashboard-chart-card">
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
              <strong>{{ row.count }} 项</strong>
            </div>
            <div class="dashboard-bar-track">
              <span :style="{ width: `${row.ratio}%`, backgroundColor: row.color }" />
            </div>
            <div class="dashboard-chart-footnote">
              采购金额 {{ formatCurrency(row.value) }} · 在用
              {{ row.count ? Math.round(row.percent) : 0 }}%
            </div>
          </div>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="24" :lg="8">
      <a-card title="软件资产分类" :bordered="false" class="dashboard-chart-card">
        <a-table
          :data-source="ws.dashboardMetrics.software.categoryRows"
          :pagination="false"
          row-key="category"
          size="small"
          :columns="[
            { title: '软件分类', dataIndex: 'category', key: 'category' },
            { title: '套数', dataIndex: 'count', key: 'count', width: 70 },
            { title: '授权占用', key: 'usage', width: 110 },
          ]"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'usage'"
              >{{ record.used }} / {{ record.total }}</template
            >
          </template>
          <template #emptyText><a-empty description="暂无软件资产" /></template>
        </a-table>
      </a-card>
    </a-col>
    <a-col :xs="24" :lg="8">
      <a-card title="虚拟资产分类" :bordered="false" class="dashboard-chart-card">
        <a-table
          :data-source="ws.dashboardMetrics.virtual.categoryRows"
          :pagination="false"
          row-key="category"
          size="small"
          :columns="[
            { title: '资源分类', dataIndex: 'category', key: 'category' },
            { title: '数量', dataIndex: 'count', key: 'count', width: 80 },
          ]"
        >
          <template #emptyText><a-empty description="暂无虚拟资产" /></template>
        </a-table>
      </a-card>
    </a-col>
    <a-col :span="24">
      <a-card title="办公设备细分类汇总" :bordered="false">
        <a-table
          :columns="categoryColumns"
          :data-source="ws.categoryRows"
          :pagination="false"
          row-key="category"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'value'">{{ formatCurrency(record.value) }}</template>
            <template v-else-if="column.key === 'count'"
              ><a-tag color="blue">{{ record.count }} 项</a-tag></template
            >
          </template>
          <template #emptyText><a-empty description="登记资产后自动生成分类" /></template>
        </a-table>
      </a-card>
    </a-col>
  </a-row>
</template>

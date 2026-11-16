<script setup lang="ts">
import { formatCurrency } from '../helpers'
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()
</script>

<template>
  <div class="content-heading">
    <div>
      <h1>数据报表</h1>
      <p>基于硬件台账、软件授权与虚拟资源生成运营报表。</p>
    </div>
  </div>
  <a-row :gutter="[16, 16]">
    <a-col :xs="24" :lg="12">
      <a-card title="硬件资产状态分布" :bordered="false">
        <div v-for="row in ws.dashboardMetrics.statusRows" :key="row.status" class="report-row">
          <span>{{ row.status }}</span>
          <a-progress :percent="row.percent" />
          <strong>{{ row.count }}</strong>
        </div>
      </a-card>
    </a-col>
    <a-col :xs="24" :lg="12">
      <a-card title="资产价值构成" :bordered="false">
        <a-descriptions bordered :column="1" size="small">
          <a-descriptions-item label="硬件采购金额">{{
            formatCurrency(ws.dashboardMetrics.totalValue)
          }}</a-descriptions-item>
          <a-descriptions-item label="软件许可金额">{{
            formatCurrency(ws.dashboardMetrics.software.value)
          }}</a-descriptions-item>
          <a-descriptions-item label="虚拟资源年费">{{
            formatCurrency(ws.dashboardMetrics.virtual.yearlyCost)
          }}</a-descriptions-item>
          <a-descriptions-item label="合计">{{
            formatCurrency(
              ws.dashboardMetrics.totalValue +
                ws.dashboardMetrics.software.value +
                ws.dashboardMetrics.virtual.yearlyCost,
            )
          }}</a-descriptions-item>
        </a-descriptions>
      </a-card>
    </a-col>
    <a-col :span="24">
      <a-card title="生命周期与合规指标" :bordered="false">
        <a-descriptions bordered :column="{ xs: 1, sm: 3 }">
          <a-descriptions-item label="领用记录">{{
            ws.loanLogs.filter((log) => log.action === '领用').length
          }}</a-descriptions-item>
          <a-descriptions-item label="归还记录">{{
            ws.loanLogs.filter((log) => log.action === '归还').length
          }}</a-descriptions-item>
          <a-descriptions-item label="当前未归还">{{ ws.onLoanAssets.length }}</a-descriptions-item>
          <a-descriptions-item label="软件授权占用率"
            >{{ ws.dashboardMetrics.software.usagePercent }}%</a-descriptions-item
          >
          <a-descriptions-item label="即将到期软件">{{
            ws.dashboardMetrics.software.expiringCount
          }}</a-descriptions-item>
          <a-descriptions-item label="过期停用软件">{{
            ws.dashboardMetrics.software.expiredCount
          }}</a-descriptions-item>
          <a-descriptions-item label="虚拟资源到期提醒">{{
            ws.dashboardMetrics.virtual.reminders.length
          }}</a-descriptions-item>
          <a-descriptions-item label="已停用虚拟资源">{{
            ws.dashboardMetrics.virtual.stoppedCount
          }}</a-descriptions-item>
          <a-descriptions-item label="维修中硬件">{{
            ws.dashboardMetrics.repairCount
          }}</a-descriptions-item>
        </a-descriptions>
      </a-card>
    </a-col>
  </a-row>
</template>

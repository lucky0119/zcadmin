<script setup lang="ts">
import { PlusOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { formatCurrency, statuses, statusColor } from '../helpers'
import { brandModelOf } from '../../../services/hardwareFields'
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()
</script>

<template>
  <div class="content-heading">
    <div>
      <h1>{{ ws.activeSection === 'repairs' ? '维修记录' : '硬件资产' }}</h1>
      <p>
        {{
          ws.activeSection === 'repairs'
            ? '查看维修中资产并更新维修状态。'
            : '按办公设备 / 网络设备 / 服务器设备分类维护硬件资产全量字段。'
        }}
      </p>
    </div>
    <a-space>
      <a-button :loading="ws.loading" @click="ws.loadData">刷新数据</a-button>
      <a-button @click="ws.exportHardwareCsv">导出台账</a-button>
      <a-button type="primary" @click="ws.openCreateAsset"
        ><template #icon><PlusOutlined /></template>新增资产</a-button
      >
    </a-space>
  </div>
  <a-card :bordered="false">
    <a-tabs
      v-if="ws.activeSection === 'assets'"
      :active-key="ws.assetCategory"
      @change="ws.setAssetCategory"
    >
      <a-tab-pane key="all" :tab="`全部资产（${ws.assets.length}）`" />
      <a-tab-pane
        key="hardware"
        :tab="`办公设备（${ws.assets.filter((asset) => asset.assetClass !== 'network' && asset.assetClass !== 'server').length}）`"
      />
      <a-tab-pane
        key="network"
        :tab="`网络设备（${ws.assets.filter((asset) => asset.assetClass === 'network').length}）`"
      />
      <a-tab-pane
        key="server"
        :tab="`服务器设备（${ws.assets.filter((asset) => asset.assetClass === 'server').length}）`"
      />
    </a-tabs>
    <div class="table-toolbar">
      <a-input
        v-model:value="ws.assetSearch"
        allow-clear
        placeholder="搜索编号、名称、品牌型号、SN、供应商或位置"
        class="toolbar-search"
      />
      <a-select v-model:value="ws.statusFilter" class="toolbar-filter" aria-label="资产状态筛选">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option v-for="status in statuses" :key="status" :value="status">{{
          status
        }}</a-select-option>
      </a-select>
      <a-select
        v-if="ws.supplierOptions.length"
        v-model:value="ws.supplierFilter"
        class="toolbar-filter"
        aria-label="供应商筛选"
      >
        <a-select-option value="all">全部供应商</a-select-option>
        <a-select-option v-for="supplier in ws.supplierOptions" :key="supplier" :value="supplier">{{
          supplier
        }}</a-select-option>
      </a-select>
      <a-popover v-model:open="ws.columnPickerOpen" trigger="click" placement="bottomRight">
        <template #content>
          <div class="column-picker">
            <a-checkbox-group
              :value="ws.visibleColumnsByClass[ws.assetColumnClass]"
              :options="ws.columnOptions"
              @change="ws.updateVisibleColumns"
            />
            <a-button type="link" size="small" @click="ws.resetVisibleColumns">恢复默认</a-button>
          </div>
        </template>
        <a-button aria-label="字段显示设置">
          <template #icon><SettingOutlined /></template>
          字段显示
        </a-button>
      </a-popover>
      <a-tag>{{ ws.filteredAssets.length }} 条记录</a-tag>
    </div>
    <a-table
      :columns="ws.moduleColumns"
      :data-source="ws.filteredAssets"
      :loading="ws.loading"
      :pagination="{
        pageSize: 10,
        showSizeChanger: true,
        showTotal: (total: number) => `共 ${total} 条`,
      }"
      :scroll="{ x: Math.max(1200, ws.moduleColumns.length * 140) }"
      row-key="id"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'"
          ><a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag></template
        >
        <template v-else-if="column.key === 'price'">{{ formatCurrency(record.price) }}</template>
        <template v-else-if="column.key === 'brandModel'">{{ brandModelOf(record) }}</template>
        <template v-else-if="column.key === 'warrantyExpiry'">
          <span>{{ record.warrantyExpiry || '—' }}</span>
          <div
            v-if="record.warrantyExpiry && record.warrantyExpiry < ws.today"
            class="cell-hint text-danger"
          >
            已过保
          </div>
        </template>
        <template v-else-if="column.key === 'actions'"
          ><a-space
            ><a-button type="link" size="small" @click="ws.openEditAsset(record)">编辑</a-button
            ><a-button type="link" danger size="small" @click="ws.confirmDelete(record)"
              >删除</a-button
            ></a-space
          ></template
        >
        <template v-else>{{ record[column.dataIndex] || '—' }}</template>
      </template>
      <template #emptyText><a-empty description="暂无资产记录" /></template>
    </a-table>
  </a-card>
</template>

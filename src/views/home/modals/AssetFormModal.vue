<script setup lang="ts">
import { statuses } from '../helpers'
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()
</script>

<template>
  <a-modal
    v-model:open="ws.assetModalOpen"
    :title="ws.editingId ? '编辑资产' : '登记资产'"
    width="860px"
    :confirm-loading="ws.saving"
    @ok="ws.saveAsset"
  >
    <a-form layout="vertical" class="asset-form">
      <a-row :gutter="16">
        <a-col :xs="24" :sm="12">
          <a-form-item label="资产类型">
            <a-select
              v-model:value="ws.editingClass"
              :disabled="Boolean(ws.editingId)"
              @change="ws.updateDraftClass"
            >
              <a-select-option value="hardware">办公设备</a-select-option>
              <a-select-option value="network">网络设备</a-select-option>
              <a-select-option value="server">服务器设备</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col v-for="field in ws.assetFields" :key="field.key" :xs="24" :sm="12">
          <a-form-item :label="field.label" :required="field.key === 'id' || field.key === 'name'">
            <a-select v-if="field.kind === 'status'" v-model:value="ws.assetDraft.status">
              <a-select-option v-for="status in statuses" :key="status" :value="status">{{
                status
              }}</a-select-option>
            </a-select>
            <a-select v-else-if="field.kind === 'condition'" v-model:value="ws.assetDraft.condition">
              <a-select-option value="良好">良好</a-select-option>
              <a-select-option value="维修中">维修中</a-select-option>
              <a-select-option value="已报废">已报废</a-select-option>
            </a-select>
            <a-select
              v-else-if="field.kind === 'select'"
              :value="String(ws.fieldValue(field) ?? '')"
              @change="(value: unknown) => ws.setFieldValue(field, String(value))"
            >
              <a-select-option v-for="option in field.options" :key="option" :value="option">{{
                option
              }}</a-select-option>
            </a-select>
            <a-input-number
              v-else-if="field.kind === 'number'"
              v-model:value="ws.assetDraft.price"
              :min="0"
              :precision="2"
              class="full-width-input"
            />
            <a-input
              v-else-if="field.kind === 'date'"
              :value="String(ws.fieldValue(field) ?? '')"
              type="date"
              @update:value="(value: string) => ws.setFieldValue(field, value)"
            />
            <a-textarea
              v-else-if="field.kind === 'textarea'"
              :value="String(ws.fieldValue(field) ?? '')"
              :rows="2"
              placeholder="故障记录、配件更换记录等"
              @update:value="(value: string) => ws.setFieldValue(field, value)"
            />
            <a-input
              v-else
              :value="String(ws.fieldValue(field) ?? '')"
              :disabled="field.disabled"
              @update:value="(value: string) => ws.setFieldValue(field, value)"
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()
</script>

<template>
  <a-modal
    v-model:open="ws.requestModalOpen"
    title="申请领用资产"
    :confirm-loading="ws.saving"
    @ok="ws.submitLoanRequest"
  >
    <a-descriptions v-if="ws.requestAsset" size="small" :column="1" class="checkout-asset-details">
      <a-descriptions-item label="资产名称">{{ ws.requestAsset.name }}</a-descriptions-item>
      <a-descriptions-item label="资产编号">{{ ws.requestAsset.id }}</a-descriptions-item>
    </a-descriptions>
    <a-form layout="vertical">
      <a-form-item label="领用人" required
        ><a-input
          v-model:value="ws.requestDraft.borrower"
          :maxlength="30"
          placeholder="请输入领用人姓名"
      /></a-form-item>
      <a-form-item label="预计归还时间" required
        ><a-input v-model:value="ws.requestDraft.dueDate" type="date"
      /></a-form-item>
    </a-form>
    <a-typography-paragraph type="secondary"
      >提交后将由管理员审批，审批通过后资产方可领用。</a-typography-paragraph
    >
  </a-modal>
</template>

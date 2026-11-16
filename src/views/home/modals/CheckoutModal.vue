<script setup lang="ts">
import { useWorkspace } from '../useWorkspace'

const ws = useWorkspace()
</script>

<template>
  <a-modal
    v-model:open="ws.loanModalOpen"
    title="登记资产领用"
    :confirm-loading="ws.saving"
    @ok="ws.saveCheckout"
  >
    <a-descriptions
      v-if="ws.selectedLoanAsset"
      size="small"
      :column="1"
      class="checkout-asset-details"
    >
      <a-descriptions-item label="资产">{{ ws.selectedLoanAsset.name }}</a-descriptions-item>
      <a-descriptions-item label="编号">{{ ws.selectedLoanAsset.id }}</a-descriptions-item>
    </a-descriptions>
    <a-form layout="vertical">
      <a-form-item label="借用人" required
        ><a-input v-model:value="ws.loanDraft.borrower" placeholder="请输入借用人姓名"
      /></a-form-item>
      <a-form-item label="领用日期" required
        ><a-input v-model:value="ws.loanDraft.loanDate" type="date"
      /></a-form-item>
      <a-form-item label="预计归还日期"
        ><a-input v-model:value="ws.loanDraft.dueDate" type="date"
      /></a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import docSource from '../../../content/asset-management-plan.md?raw'

// 文档内容来自仓库内的《IT 资产管理方案》，随构建一起打包，无需运行时读取
const docHtml = computed(() => marked.parse(docSource, { async: false }) as string)
</script>

<template>
  <div class="content-heading">
    <div>
      <h1>资产管理方案</h1>
      <p>公司 IT 资产管理办法：分类标准、管理范围、字段规范与台账要求。</p>
    </div>
  </div>

  <a-card :bordered="false" class="plan-doc-card">
    <article class="plan-doc" v-html="docHtml" />
  </a-card>
</template>

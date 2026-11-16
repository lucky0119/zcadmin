<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue'
import { RouterView } from 'vue-router'
import { message, theme as antTheme } from 'ant-design-vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { displayPreferences, sitePreferences, sitePreferencesApi } from './services/settingsApi'

const themeConfig = computed(() => ({
  algorithm: displayPreferences.theme === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#6858d6',
    borderRadius: 8,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
}))

onMounted(async () => {
  const siteError = await sitePreferencesApi.loadPublic()
  if (siteError) void message.warning(`${siteError}，当前使用默认站点设置`)
})

watchEffect(() => {
  document.title = `${sitePreferences.siteTitle} · 资产管理`
})
</script>

<template>
  <a-config-provider :locale="zhCN" :theme="themeConfig" :component-size="displayPreferences.density === 'compact' ? 'small' : 'middle'">
    <a-app :class="{ 'dark-theme': displayPreferences.theme === 'dark' }">
      <RouterView />
    </a-app>
  </a-config-provider>
</template>

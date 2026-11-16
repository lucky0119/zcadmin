<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { LockOutlined, UserOutlined } from '@ant-design/icons-vue'
import { authApi } from '../services/authApi'
import { sitePreferences } from '../services/settingsApi'

const router = useRouter()
const submitting = ref(false)
const credentials = reactive({ username: '', password: '' })

async function submitLogin() {
  if (submitting.value) return
  submitting.value = true
  try {
    const success = await authApi.login(credentials.username.trim(), credentials.password)
    if (!success) {
      void message.error('账号或密码不正确，请重试')
      return
    }
    await router.replace({ name: 'home' })
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '登录失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <a-card class="login-card" :bordered="false">
      <img class="login-logo" src="/logo.svg" alt="Logo" />
      <a-typography-title :level="2">{{ sitePreferences.siteTitle }}</a-typography-title>
      <a-typography-paragraph type="secondary">登录资产管理空间</a-typography-paragraph>
      <a-form :model="credentials" layout="vertical" @finish="submitLogin">
        <a-form-item
          label="账号"
          name="username"
          :rules="[{ required: true, message: '请输入账号' }]"
        >
          <a-input
            v-model:value="credentials.username"
            autocomplete="username"
            size="large"
            placeholder="请输入账号"
          >
            <template #prefix><UserOutlined /></template>
          </a-input>
        </a-form-item>
        <a-form-item
          label="密码"
          name="password"
          :rules="[{ required: true, message: '请输入密码' }]"
        >
          <a-input-password
            v-model:value="credentials.password"
            autocomplete="current-password"
            size="large"
            placeholder="请输入密码"
          >
            <template #prefix><LockOutlined /></template>
          </a-input-password>
        </a-form-item>
        <a-button type="primary" html-type="submit" size="large" block :loading="submitting"
          >登录</a-button
        >
      </a-form>
    </a-card>
    <div class="login-footer">{{ sitePreferences.siteTitle }} · 资产管理系统</div>
  </main>
</template>

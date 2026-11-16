<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DesktopOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import { useRouter } from 'vue-router'
import { authApi } from '../services/authApi'
import { assetStorageApi } from '../services/assetApi'
import { userApi, type ManagedRole, type ManagedUser } from '../services/userApi'
import {
  displayPreferences,
  displayPreferencesApi,
  sitePreferences,
  sitePreferencesApi,
  type DisplayDensity,
  type ThemeMode,
} from '../services/settingsApi'

const props = defineProps<{
  assetCount: number
  logCount: number
  username?: string
  role?: 'admin' | 'manager' | 'user'
}>()
const emit = defineEmits<{ reload: [] }>()
const router = useRouter()
const users = ref<ManagedUser[]>([])
const userBusy = ref(false)
const userDraft = reactive<{
  username: string
  displayName: string
  password: string
  role: ManagedRole
}>({
  username: '',
  displayName: '',
  password: '',
  role: 'user',
})
const roleLabels: Record<ManagedRole, string> = { manager: '资产管理员', user: '普通用户' }
const roleLabel = computed(() => {
  if (props.role === 'admin') return '系统管理员'
  if (props.role === 'manager') return '资产管理员'
  return '普通用户'
})
const preferenceError = ref('')
const backupBusy = ref(false)
const siteDraft = reactive({ ...sitePreferences })
const density = computed({
  get: () => displayPreferences.density,
  set: (value: DisplayDensity) => updatePreferences({ density: value }),
})
const theme = computed({
  get: () => displayPreferences.theme,
  set: (value: ThemeMode) => updatePreferences({ theme: value }),
})

onMounted(async () => {
  preferenceError.value = (await displayPreferencesApi.load()) ?? ''
  const siteError = await sitePreferencesApi.load()
  if (siteError) void message.error(siteError)
  Object.assign(siteDraft, sitePreferences)
  await loadUsers()
})

async function loadUsers() {
  try {
    users.value = await userApi.list()
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '读取用户列表失败')
  }
}

async function createUser() {
  if (
    !userDraft.username.trim() ||
    !userDraft.displayName.trim() ||
    userDraft.password.length < 4
  ) {
    void message.warning('请填写账号（2-30 字符）、姓名，密码至少 4 位')
    return
  }
  userBusy.value = true
  try {
    await userApi.create(
      userDraft.username.trim(),
      userDraft.password,
      userDraft.displayName.trim(),
      userDraft.role,
    )
    Object.assign(userDraft, { username: '', displayName: '', password: '', role: 'user' })
    await loadUsers()
    void message.success('用户已创建，可使用该账号登录系统')
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '创建用户失败')
  } finally {
    userBusy.value = false
  }
}

function confirmRemoveUser(user: ManagedUser) {
  Modal.confirm({
    title: '删除用户',
    content: `确定删除账号「${user.username}」吗？该用户将无法再登录。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        users.value = await userApi.remove(user.username)
        void message.success('用户已删除')
      } catch (error) {
        void message.error(error instanceof Error ? error.message : '删除用户失败')
        throw error
      }
    },
  })
}

async function saveSiteSettings() {
  try {
    await sitePreferencesApi.save(siteDraft)
    void message.success('站点信息已保存')
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '保存站点设置失败')
  }
}

async function updatePreferences(change: Partial<{ theme: ThemeMode; density: DisplayDensity }>) {
  try {
    await displayPreferencesApi.save({ ...displayPreferences, ...change })
    preferenceError.value = ''
    void message.success('显示偏好已保存')
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '保存显示偏好失败')
  }
}

async function exportData() {
  backupBusy.value = true
  try {
    const snapshot = await assetStorageApi.exportSnapshot()
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `毅弘资产云备份-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    void message.success(
      `已导出 ${snapshot.assets.length} 条资产与 ${snapshot.loanLogs.length} 条操作日志`,
    )
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '导出服务器数据失败')
  } finally {
    backupBusy.value = false
  }
}

async function importData(file: File) {
  backupBusy.value = true
  try {
    const snapshot: unknown = JSON.parse(await file.text())
    const imported = await assetStorageApi.importSnapshot(snapshot)
    emit('reload')
    void message.success(
      `已导入 ${imported.assets.length} 条资产与 ${imported.loanLogs.length} 条操作日志`,
    )
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '导入备份失败')
  } finally {
    backupBusy.value = false
  }
  return false
}

function confirmReset() {
  Modal.confirm({
    title: '清空数据库资产数据？',
    okText: '清空数据',
    okType: 'danger',
    cancelText: '取消',
    content:
      '这会永久删除数据库中的全部资产和借还日志，但保留站点设置。此操作无法撤销，请先导出备份。',
    async onOk() {
      try {
        await assetStorageApi.clearAll()
        emit('reload')
        void message.success('数据库资产和借还记录已清空')
      } catch (error) {
        void message.error(error instanceof Error ? error.message : '重置服务器数据失败')
        throw error
      }
    },
  })
}

async function logout() {
  try {
    await authApi.logout()
    await router.replace({ name: 'login' })
  } catch (error) {
    void message.error(error instanceof Error ? error.message : '退出登录失败')
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-page-heading">
      <div>
        <h1>系统设置</h1>
        <p>管理站点信息、用户账号、服务器数据与界面偏好。</p>
      </div>
      <a-tag color="green"><SafetyCertificateOutlined /> 数据保存在 MySQL 数据库</a-tag>
    </div>

    <a-alert
      v-if="preferenceError"
      type="warning"
      show-icon
      closable
      :message="preferenceError"
      description="当前使用默认显示设置。选择新的偏好后会覆盖无效配置。"
      @close="preferenceError = ''"
    />

    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :xl="16">
        <a-card title="站点信息" :bordered="false">
          <a-form layout="vertical">
            <a-row :gutter="16">
              <a-col :xs="24" :sm="12">
                <a-form-item label="网站标题" required>
                  <a-input
                    v-model:value="siteDraft.siteTitle"
                    :maxlength="50"
                    placeholder="请输入网站标题"
                  />
                </a-form-item>
              </a-col>
              <a-col :xs="24" :sm="12">
                <a-form-item label="管理员显示名称" required>
                  <a-input
                    v-model:value="siteDraft.adminDisplayName"
                    :maxlength="30"
                    placeholder="请输入管理员显示名称"
                  />
                </a-form-item>
              </a-col>
            </a-row>
            <a-button type="primary" @click="saveSiteSettings">保存站点设置</a-button>
          </a-form>
        </a-card>

        <a-card title="用户管理" :bordered="false" class="settings-card-gap">
          <template #extra><UserOutlined /></template>
          <a-typography-paragraph type="secondary">
            资产管理员可维护资产台账并审批领用申请；普通用户仅可查看「领用归还」页面，提交领用申请后由管理员审批。
          </a-typography-paragraph>
          <a-form layout="inline" class="user-create-form">
            <a-form-item
              ><a-input
                v-model:value="userDraft.username"
                placeholder="账号（2-30 字符）"
                style="width: 170px"
            /></a-form-item>
            <a-form-item
              ><a-input
                v-model:value="userDraft.displayName"
                placeholder="姓名"
                :maxlength="30"
                style="width: 130px"
            /></a-form-item>
            <a-form-item
              ><a-input-password
                v-model:value="userDraft.password"
                placeholder="密码（至少 4 位）"
                style="width: 160px"
            /></a-form-item>
            <a-form-item>
              <a-select v-model:value="userDraft.role" style="width: 130px">
                <a-select-option value="user">普通用户</a-select-option>
                <a-select-option value="manager">资产管理员</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item
              ><a-button type="primary" :loading="userBusy" @click="createUser"
                >添加用户</a-button
              ></a-form-item
            >
          </a-form>
          <a-table
            :data-source="users"
            :pagination="false"
            row-key="username"
            size="small"
            :columns="[
              { title: '账号', dataIndex: 'username', key: 'username' },
              { title: '姓名', dataIndex: 'displayName', key: 'displayName' },
              { title: '角色', key: 'role', width: 110 },
              { title: '操作', key: 'actions', width: 80 },
            ]"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'role'">
                <a-tag :color="record.role === 'manager' ? 'blue' : 'default'">{{
                  roleLabels[record.role as ManagedRole] ?? '普通用户'
                }}</a-tag>
              </template>
              <template v-else-if="column.key === 'actions'">
                <a-button type="link" danger size="small" @click="confirmRemoveUser(record)"
                  >删除</a-button
                >
              </template>
            </template>
            <template #emptyText>暂无普通用户，添加后用户即可登录提交领用申请</template>
          </a-table>
        </a-card>

        <a-card title="服务器数据管理" :bordered="false" class="settings-card-gap">
          <template #extra><CloudDownloadOutlined /></template>
          <a-descriptions bordered size="small" :column="{ xs: 1, sm: 2 }">
            <a-descriptions-item label="资产记录">{{ props.assetCount }}</a-descriptions-item>
            <a-descriptions-item label="借还日志">{{ props.logCount }}</a-descriptions-item>
          </a-descriptions>
          <a-space wrap class="settings-actions">
            <a-button type="primary" :loading="backupBusy" @click="exportData">
              <template #icon><CloudDownloadOutlined /></template>
              导出备份
            </a-button>
            <a-upload
              accept=".json,application/json"
              :show-upload-list="false"
              :before-upload="importData"
              :disabled="backupBusy"
            >
              <a-button :loading="backupBusy">
                <template #icon><CloudUploadOutlined /></template>
                导入备份
              </a-button>
            </a-upload>
            <a-button danger :disabled="backupBusy" @click="confirmReset">
              <template #icon><DeleteOutlined /></template>
              清空资产数据
            </a-button>
          </a-space>
          <a-alert
            class="settings-safety-note"
            type="info"
            show-icon
            message="资产、借还记录和站点设置保存在 MySQL 数据库中。导入备份将完整替换当前数据，请定期导出备份。"
          />
        </a-card>

        <a-card title="显示偏好" :bordered="false" class="settings-card-gap">
          <template #extra><DesktopOutlined /></template>
          <a-form layout="inline">
            <a-form-item label="主题">
              <a-radio-group v-model:value="theme" button-style="solid">
                <a-radio-button value="light">浅色</a-radio-button>
                <a-radio-button value="dark">深色</a-radio-button>
              </a-radio-group>
            </a-form-item>
            <a-form-item label="界面密度">
              <a-radio-group v-model:value="density" button-style="solid">
                <a-radio-button value="comfortable">标准</a-radio-button>
                <a-radio-button value="compact">紧凑</a-radio-button>
              </a-radio-group>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>

      <a-col :xs="24" :xl="8">
        <a-card title="当前账号" :bordered="false">
          <template #extra><UserOutlined /></template>
          <div class="settings-profile">
            <a-avatar :size="56">{{
              (props.username ?? 'admin').slice(0, 1).toUpperCase()
            }}</a-avatar>
            <div>
              <strong>{{ props.username ?? 'admin' }}</strong>
              <div>
                <a-tag color="blue">{{ roleLabel }}</a-tag>
              </div>
            </div>
          </div>
          <a-descriptions :column="1" class="settings-profile-meta">
            <a-descriptions-item label="登录状态">
              <a-badge status="success" text="已登录" />
            </a-descriptions-item>
            <a-descriptions-item label="认证方式">HttpOnly 服务端会话</a-descriptions-item>
            <a-descriptions-item label="数据存储">MySQL 数据库</a-descriptions-item>
          </a-descriptions>
          <a-alert
            type="warning"
            show-icon
            message="服务端会话认证"
            description="系统管理员账号固定为 admin，密码由服务器环境变量 ADMIN_PASSWORD 配置。"
          />
          <a-button class="settings-logout" danger @click="logout">
            <template #icon><LogoutOutlined /></template>
            退出当前账号
          </a-button>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

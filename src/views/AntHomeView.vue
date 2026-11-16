<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { LogoutOutlined } from '@ant-design/icons-vue'
import { sectionTitles, type SectionKey } from './home/helpers'
import { createAssetWorkspace } from './home/workspace'
import { provideWorkspace } from './home/useWorkspace'
import OverviewSection from './home/sections/OverviewSection.vue'
import HardwareSection from './home/sections/HardwareSection.vue'
import LoansSection from './home/sections/LoansSection.vue'
import CategoriesSection from './home/sections/CategoriesSection.vue'
import ReportsSection from './home/sections/ReportsSection.vue'
import PlanSection from './home/sections/PlanSection.vue'
import AssetFormModal from './home/modals/AssetFormModal.vue'
import CheckoutModal from './home/modals/CheckoutModal.vue'
import RequestLoanModal from './home/modals/RequestLoanModal.vue'
import SettingsView from './SettingsView.vue'
import SoftwareAssetsView from './SoftwareAssetsView.vue'
import VirtualAssetsView from './VirtualAssetsView.vue'

// 集中式工作台：所有首页板块共享的数据与操作（详见 ./home/workspace.ts）
const ws = reactive(createAssetWorkspace())
provideWorkspace(ws)

onMounted(ws.loadData)
</script>

<template>
  <a-layout class="app-shell">
    <a-layout-sider class="app-sidebar" width="236">
      <div class="app-brand">
        <img class="site-logo" src="/logo.svg" alt="网站 Logo" />
        <span>{{ ws.sitePreferences.siteTitle }}</span>
      </div>

      <a-menu mode="inline" :selected-keys="[ws.activeSection]" @click="ws.setSection($event.key)">
        <template v-if="ws.canManage">
          <a-menu-item key="overview">资产总览</a-menu-item>
          <a-sub-menu key="sub-hardware">
            <template #title>硬件资产</template>
            <a-menu-item key="hardware">办公设备</a-menu-item>
            <a-menu-item key="network">网络设备</a-menu-item>
            <a-menu-item key="server">服务器设备</a-menu-item>
          </a-sub-menu>
          <a-sub-menu key="sub-software">
            <template #title>软件资产</template>
            <a-menu-item key="software">应用软件</a-menu-item>
            <a-menu-item key="virtual">虚拟资产</a-menu-item>
          </a-sub-menu>

          <a-menu-item key="loans">领用归还</a-menu-item>
          <a-menu-item key="repairs">维修记录</a-menu-item>
          <a-menu-item key="categories">分类管理</a-menu-item>
          <a-menu-item key="reports">数据报表</a-menu-item>
          <a-menu-item key="plan">资产管理方案</a-menu-item>

          <a-menu-item v-if="ws.isAdmin" key="settings">系统设置</a-menu-item>
        </template>
        <a-menu-item v-else key="loans">领用归还</a-menu-item>
      </a-menu>
      <div class="sidebar-account">
        <a-avatar>{{ ws.currentUser.username.slice(0, 1).toUpperCase() }}</a-avatar>
        <div>
          <strong>{{
            ws.isAdmin ? ws.sitePreferences.adminDisplayName : ws.currentUser.username
          }}</strong>
          <small>{{ ws.roleLabel }}</small>
        </div>
        <a-button type="text" aria-label="退出登录" title="退出登录" @click="ws.logout">
          <template #icon><LogoutOutlined /></template>
        </a-button>
      </div>
    </a-layout-sider>

    <a-layout>
      <a-layout-header class="app-topbar">
        <a-breadcrumb>
          <a-breadcrumb-item>资产管理</a-breadcrumb-item>
          <a-breadcrumb-item>{{ sectionTitles[ws.activeSection as SectionKey] }}</a-breadcrumb-item>
        </a-breadcrumb>
        <a-space>
          <a-tag color="green">服务器模式</a-tag>
          <a-avatar size="small">{{ ws.currentUser.username.slice(0, 1).toUpperCase() }}</a-avatar>
          <span class="topbar-username">{{
            ws.isAdmin ? ws.sitePreferences.adminDisplayName : ws.currentUser.username
          }}</span>
        </a-space>
      </a-layout-header>

      <a-layout-content class="app-content">
        <OverviewSection v-if="ws.activeSection === 'overview'" />

        <HardwareSection
          v-else-if="
            ws.activeSection === 'assets' ||
            ws.activeSection === 'hardware' ||
            ws.activeSection === 'network' ||
            ws.activeSection === 'server' ||
            ws.activeSection === 'repairs'
          "
        />

        <SoftwareAssetsView
          v-else-if="ws.activeSection === 'software'"
          @changed="ws.refreshSoftware"
        />

        <VirtualAssetsView
          v-else-if="ws.activeSection === 'virtual'"
          @changed="ws.refreshVirtual"
        />

        <LoansSection v-else-if="ws.activeSection === 'loans'" />

        <CategoriesSection v-else-if="ws.activeSection === 'categories'" />

        <ReportsSection v-else-if="ws.activeSection === 'reports'" />

        <PlanSection v-else-if="ws.activeSection === 'plan'" />

        <SettingsView
          v-else-if="ws.activeSection === 'settings'"
          :asset-count="ws.assets.length"
          :log-count="ws.loanLogs.length"
          :username="ws.currentUser.username"
          :role="ws.currentUser.role"
          @reload="ws.loadData"
        />
      </a-layout-content>

      <a-layout-footer class="app-footer"
        >{{ ws.sitePreferences.siteTitle }} · IT 资产管理系统</a-layout-footer
      >
    </a-layout>
  </a-layout>

  <AssetFormModal />
  <CheckoutModal />
  <RequestLoanModal />
</template>

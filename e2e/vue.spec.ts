import { test, expect } from '@playwright/test'

test('logs in and opens asset management and settings', async ({ page }) => {
  await page.goto('/login?redirect=/')
  await expect(page).toHaveURL('/login')
  await expect(page.getByPlaceholder('请输入账号')).toBeVisible()
  await page.getByPlaceholder('请输入账号').fill('admin')
  await page.getByPlaceholder('请输入密码').fill('admin')
  await page.locator('form button[type="submit"]').click()

  await expect(page.getByRole('heading', { name: '资产总览' })).toBeVisible()
  await expect(page.getByText('资产状态分布')).toBeVisible()
  await expect(page.getByText('近 12 个月资产新增')).toBeVisible()
  await page.getByRole('menuitem', { name: '领用归还' }).click()
  await expect(page.getByRole('heading', { name: '领用归还' })).toBeVisible()
  await page.getByRole('tab', { name: '领用归还日志' }).click()
  await expect(page.getByRole('tab', { name: '领用归还日志' })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('menuitem', { name: '系统设置' }).click()
  await expect(page.getByRole('heading', { name: '系统设置' })).toBeVisible()
  await expect(page.getByText('服务器数据管理')).toBeVisible()
  await expect(page.getByText('显示偏好')).toBeVisible()
})

test('updates site branding and administrator display name', async ({ page }) => {
  await page.goto('/')
  await page.getByPlaceholder('请输入账号').fill('admin')
  await page.getByPlaceholder('请输入密码').fill('admin')
  await page.locator('form button[type="submit"]').click()

  await page.getByRole('menuitem', { name: '系统设置' }).click()
  await page.getByPlaceholder('请输入网站标题').fill('设备资产中心')
  await page.getByPlaceholder('请输入管理员显示名称').fill('资产管理员')
  await page.getByRole('button', { name: '保存站点设置' }).click()
  await expect(page.locator('.app-brand')).toContainText('设备资产中心')
  await expect(page.locator('.sidebar-account')).toContainText('资产管理员')

  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r+QAAAAASUVORK5CYII=', 'base64'),
  })
  await expect(page.getByAltText('Logo 预览')).toBeVisible()

  await page.reload()
  await expect(page).toHaveTitle('设备资产中心 · 资产管理')
  await expect(page.getByRole('img', { name: '网站 Logo' })).toBeVisible()
})

test('opens the integrated asset page and manages network assets by category', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByPlaceholder('请输入账号')).toBeVisible()
  await page.getByPlaceholder('请输入账号').fill('admin')
  await page.getByPlaceholder('请输入密码').fill('admin')
  await page.locator('form button[type="submit"]').click()

  await expect(page).toHaveURL('/')
  await page.goto('/zc/computer_issuance.php?category=hardware')
  await expect(page).toHaveURL('/')
  await page.goto('/zc/network_assets.php')
  await expect(page).toHaveURL('/')
  await page.goto('/zc/server_assets.php')
  await expect(page).toHaveURL('/')

  await page.getByRole('menuitem', { name: '资产管理' }).click()
  await expect(page.getByRole('heading', { name: '资产管理' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /硬件资产/ })).toHaveAttribute('aria-selected', 'true')

  const assetPageUrl = page.url()
  await page.getByRole('tab', { name: /网络资产/ }).click()
  await expect(page).toHaveURL(assetPageUrl)
  await expect(page.getByRole('cell', { name: '核心交换机' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'MAC 地址' })).toHaveCount(0)
  await page.getByRole('button', { name: '字段显示设置' }).click()
  await page.getByLabel('MAC 地址').check()
  await expect(page.getByRole('columnheader', { name: 'MAC 地址' })).toBeVisible()
  await page.reload()
  await page.getByRole('menuitem', { name: '资产管理' }).click()
  await page.getByRole('tab', { name: /网络资产/ }).click()
  await expect(page.getByRole('columnheader', { name: 'MAC 地址' })).toBeVisible()
  await page.getByRole('button', { name: '新增资产' }).click()
  const createDialog = page.getByRole('dialog')
  await createDialog.locator('.ant-form-item').filter({ hasText: '资产名称' }).locator('input').fill('自动化测试交换机')
  await createDialog.locator('.ant-form-item').filter({ hasText: '管理 IP' }).locator('input').fill('192.0.2.10')
  await createDialog.locator('.ant-btn-primary').click()
  await expect(page.getByRole('cell', { name: '自动化测试交换机' })).toBeVisible()

  const assetRow = page.getByRole('row').filter({ hasText: '自动化测试交换机' })
  await assetRow.getByRole('button', { name: '编辑' }).click()
  const editDialog = page.getByRole('dialog')
  await editDialog.locator('.ant-form-item').filter({ hasText: '资产名称' }).locator('input').fill('已编辑测试交换机')
  await editDialog.locator('.ant-btn-primary').click()
  await expect(page.getByRole('cell', { name: '已编辑测试交换机' })).toBeVisible()

  await page.getByRole('tab', { name: /服务器资产/ }).click()
  await expect(page).toHaveURL(assetPageUrl)
  await expect(page.getByRole('cell', { name: '应用服务器' })).toBeVisible()
})

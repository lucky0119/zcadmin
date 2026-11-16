import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { config } from './config.mjs'
import { httpError, isRecord, parseCookies, readJson, sendJson } from './http-helpers.mjs'
import {
  createSession,
  destroySession,
  getSession,
  hashPassword,
  verifyAdminPassword,
  verifyPassword,
} from './auth.mjs'
import {
  defaultState,
  initializeStoredState,
  mutateState,
  readStoredState,
} from './state-store.mjs'
import {
  isAsset,
  isLendableAsset,
  isValidDateOnly,
  localDateKey,
  validAssets,
  validDisplayPreferences,
  validLogs,
  validSitePreferences,
  validSoftwareAssets,
  validUsername,
  validVirtualAssets,
} from './validation.mjs'
import { serveStatic } from './static.mjs'

function sessionCookieHeader(token, request) {
  const secure =
    request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
  return `${config.sessionCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${secure}`
}

async function handleHealth(response) {
  try {
    if (!config.useFileStorage) await readStoredState()
    sendJson(response, 200, { ok: true })
  } catch (error) {
    console.error('Storage health check failed:', error)
    sendJson(response, 503, { ok: false, error: '数据库连接失败，请检查 MySQL 配置和数据库权限' })
  }
}

async function handlePublicSitePreferences(response) {
  try {
    const current = await readStoredState()
    sendJson(response, 200, {
      siteTitle: current.state.sitePreferences.siteTitle,
      logoDataUrl: current.state.sitePreferences.logoDataUrl,
    })
  } catch (error) {
    console.error('Unable to read public site settings:', error)
    sendJson(response, 500, { error: '读取网站设置失败' })
  }
}

async function handleLogin(request, response) {
  try {
    const body = await readJson(request)
    if (!isRecord(body) || typeof body.username !== 'string' || typeof body.password !== 'string') {
      sendJson(response, 401, { error: '账号或密码不正确，请重试' })
      return
    }
    const username = body.username.trim()
    let role = null
    if (username === 'admin') {
      if (verifyAdminPassword(body.password)) role = 'admin'
    } else {
      const current = await readStoredState()
      const user = (current.state.users || []).find((item) => item.username === username)
      if (user && verifyPassword(body.password, user.passwordHash)) {
        role = user.role === 'manager' ? 'manager' : 'user'
      }
    }
    if (!role) {
      sendJson(response, 401, { error: '账号或密码不正确，请重试' })
      return
    }
    const token = createSession(username, role)
    sendJson(response, 200, { authenticated: true, role, username }, {
      'Set-Cookie': sessionCookieHeader(token, request),
    })
  } catch (error) {
    sendJson(response, error.statusCode || 400, { error: error.message })
  }
}

function handleSessionStatus(request, response) {
  const session = getSession(request)
  if (!session) {
    sendJson(response, 200, { authenticated: false })
    return
  }
  sendJson(response, 200, { authenticated: true, role: session.role, username: session.username })
}

function handleLogout(request, response) {
  const token = parseCookies(request.headers.cookie)[config.sessionCookie]
  destroySession(token)
  sendJson(response, 200, { authenticated: false }, {
    'Set-Cookie': `${config.sessionCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  })
}

// ---- 需要登录的 API（普通用户可访问） ----

async function handleUserState(response) {
  const current = await readStoredState()
  const assets = current.state.assets.map(
    ({
      id,
      name,
      category,
      assetClass,
      status,
      condition,
      borrower,
      loanDate,
      dueDate,
      returned,
      location,
      department,
    }) => ({
      id,
      name,
      category,
      assetClass,
      status,
      condition,
      borrower,
      loanDate,
      dueDate,
      returned,
      location,
      department,
    }),
  )
  sendJson(response, 200, {
    assets,
    loanRequests: current.state.loanRequests,
    sitePreferences: current.state.sitePreferences,
    displayPreferences: current.state.displayPreferences,
  })
}

async function handleLoanRequests(request, response, session, canManage) {
  if (request.method === 'GET') {
    const current = await readStoredState()
    const requests = canManage
      ? current.state.loanRequests
      : current.state.loanRequests.filter((item) => item.requestedBy === session?.username)
    sendJson(response, 200, requests)
    return
  }

  const body = await readJson(request)
  if (!isRecord(body) || typeof body.assetId !== 'string' || !body.assetId.trim()) {
    sendJson(response, 400, { error: '领用申请数据无效' })
    return
  }
  const borrower = typeof body.borrower === 'string' ? body.borrower.trim() : ''
  if (!borrower || borrower.length > 30) {
    sendJson(response, 400, { error: '请填写领用人姓名（不超过 30 字）' })
    return
  }
  if (!isValidDateOnly(body.dueDate) || body.dueDate < localDateKey()) {
    sendJson(response, 400, { error: '预计归还时间无效，不能早于今天' })
    return
  }
  const result = await mutateState((draft) => {
    const asset = draft.assets.find((item) => item.id === body.assetId.trim())
    if (!asset) throw httpError('资产不存在或已被删除', 404)
    if (!isLendableAsset(asset)) throw httpError('该资产当前不可申请领用', 409)
    if (draft.loanRequests.some((item) => item.assetId === asset.id && item.status === '待审批')) {
      throw httpError('该资产已有待审批的领用申请', 409)
    }
    const requestRecord = {
      id: `${Date.now()}-${randomBytes(4).toString('hex')}`,
      assetId: asset.id,
      assetName: asset.name,
      borrower,
      dueDate: body.dueDate,
      requestedBy: session?.username || '',
      requestedAt: new Date().toISOString(),
      status: '待审批',
      reviewedAt: '',
    }
    draft.loanRequests.unshift(requestRecord)
    return requestRecord
  })
  sendJson(response, 200, result)
}

async function handleLoanReview(request, response, loanReview) {
  const body = await readJson(request)
  if (!isRecord(body) || !['approve', 'reject'].includes(body.action)) {
    sendJson(response, 400, { error: '审批操作无效' })
    return
  }
  const id = decodeURIComponent(loanReview[1])
  const result = await mutateState((draft) => {
    const record = draft.loanRequests.find((item) => item.id === id)
    if (!record) throw httpError('领用申请不存在', 404)
    if (record.status !== '待审批') throw httpError('该申请已审批完成', 409)
    record.status = body.action === 'approve' ? '已批准' : '已拒绝'
    record.reviewedAt = new Date().toISOString()
    if (body.action !== 'approve') return record
    const index = draft.assets.findIndex((asset) => asset.id === record.assetId)
    if (index < 0) throw httpError('资产已不存在，无法批准该申请', 409)
    const asset = draft.assets[index]
    if (!isLendableAsset(asset)) throw httpError('资产当前状态已变化，无法批准该申请', 409)
    const approved = {
      ...asset,
      borrower: record.borrower,
      loanDate: localDateKey(),
      dueDate: record.dueDate,
      returned: false,
    }
    draft.assets[index] = approved
    draft.loanLogs.unshift({
      id: `${Date.now()}-${randomBytes(4).toString('hex')}`,
      action: '领用',
      assetId: approved.id,
      assetName: approved.name,
      borrower: record.borrower,
      operator: record.requestedBy,
      eventAt: new Date().toISOString(),
      dueDate: record.dueDate,
    })
    return record
  })
  sendJson(response, 200, result)
}

async function handleUserCreate(request, response) {
  const body = await readJson(request)
  const requestedRole = body.role === 'manager' ? 'manager' : 'user'
  if (
    !validUsername(body.username) ||
    !isRecord(body) ||
    typeof body.password !== 'string' ||
    body.password.length < 4 ||
    body.password.length > 100 ||
    typeof body.displayName !== 'string' ||
    !body.displayName.trim() ||
    body.displayName.length > 30
  ) {
    sendJson(response, 400, {
      error: '用户数据无效：账号 2-30 字符且不能为 admin，密码至少 4 位，姓名不能为空',
    })
    return
  }
  const username = body.username.trim()
  const created = await mutateState((draft) => {
    if (draft.users.some((item) => item.username === username)) {
      throw httpError('该账号已存在', 409)
    }
    const user = {
      username,
      displayName: body.displayName.trim(),
      passwordHash: hashPassword(body.password),
      role: requestedRole,
    }
    draft.users.push(user)
    return user
  })
  const { passwordHash: _hash, ...safeUser } = created
  sendJson(response, 200, safeUser)
}

async function handleStateGet(response) {
  const current = await readStoredState()
  const state = current.state
  sendJson(response, 200, {
    ...state,
    softwareAssets: Array.isArray(state.softwareAssets) ? state.softwareAssets : [],
    virtualAssets: Array.isArray(state.virtualAssets) ? state.virtualAssets : [],
    initialized: current.initialized,
  })
}

async function handleStateInitialize(request, response) {
  const body = await readJson(request)
  const current = await readStoredState()
  if (!current.initialized) {
    if (
      !isRecord(body) ||
      !validAssets(body.assets) ||
      !validLogs(body.loanLogs) ||
      !validDisplayPreferences(body.displayPreferences) ||
      !validSitePreferences(body.sitePreferences) ||
      (body.softwareAssets !== undefined && !validSoftwareAssets(body.softwareAssets)) ||
      (body.virtualAssets !== undefined && !validVirtualAssets(body.virtualAssets))
    ) {
      sendJson(response, 400, { error: '初始化数据格式无效' })
      return
    }
    const next = {
      ...defaultState(),
      assets: body.assets,
      loanLogs: body.loanLogs,
      softwareAssets: body.softwareAssets ?? [],
      virtualAssets: body.virtualAssets ?? [],
      displayPreferences: body.displayPreferences,
      sitePreferences: body.sitePreferences,
      assetColumnPreferences: isRecord(body.assetColumnPreferences)
        ? body.assetColumnPreferences
        : defaultState().assetColumnPreferences,
    }
    const initialized = await initializeStoredState(next)
    sendJson(response, 200, { ...initialized.state, initialized: true })
    return
  }
  sendJson(response, 200, { ...current.state, initialized: true })
}

async function handleStatePatch(request, response) {
  const body = await readJson(request)
  if (!isRecord(body)) {
    sendJson(response, 400, { error: '设置格式无效' })
    return
  }
  for (const [key, value] of Object.entries(body)) {
    if (key === 'displayPreferences' && !validDisplayPreferences(value)) {
      sendJson(response, 400, { error: '显示偏好格式无效' })
      return
    }
    if (key === 'sitePreferences' && !validSitePreferences(value)) {
      sendJson(response, 400, { error: '站点设置格式无效' })
      return
    }
    if (key === 'assetColumnPreferences' && !isRecord(value)) {
      sendJson(response, 400, { error: '字段显示设置格式无效' })
      return
    }
    if (!['displayPreferences', 'sitePreferences', 'assetColumnPreferences'].includes(key)) {
      sendJson(response, 400, { error: `不支持更新字段：${key}` })
      return
    }
  }
  const next = await mutateState((draft) => {
    Object.assign(draft, body)
    return draft
  })
  sendJson(response, 200, next)
}

async function handleAssetUpsert(request, response) {
  const body = await readJson(request)
  if (!isAsset(body)) {
    sendJson(response, 400, { error: '资产数据格式无效' })
    return
  }
  const assets = await mutateState((draft) => {
    const index = draft.assets.findIndex((asset) => asset.id === body.id)
    if (index < 0) draft.assets.unshift(body)
    else draft.assets[index] = body
    return draft.assets
  })
  sendJson(response, 200, assets)
}

async function handleAssetDelete(id, response) {
  const assets = await mutateState((draft) => {
    draft.assets = draft.assets.filter((asset) => asset.id !== id)
    return draft.assets
  })
  sendJson(response, 200, assets)
}

async function handleAssetTransaction(request, response) {
  const body = await readJson(request)
  if (
    !isRecord(body) ||
    !isAsset(body.asset) ||
    !['领用', '归还'].includes(body.action) ||
    typeof body.borrower !== 'string'
  ) {
    sendJson(response, 400, { error: '资产借还数据格式无效' })
    return
  }
  const borrower = body.borrower.trim()
  if (!borrower) {
    sendJson(response, 400, { error: '借用人不能为空' })
    return
  }
  const result = await mutateState((draft) => {
    const index = draft.assets.findIndex((asset) => asset.id === body.asset.id)
    const current = index < 0 ? undefined : draft.assets[index]
    let transactionAsset
    if (body.action === '领用') {
      if (current?.borrower && !current.returned) {
        throw httpError('该资产已被领用，请刷新后重试', 409)
      }
      if (body.asset.borrower?.trim() !== borrower) {
        throw httpError('领用人信息与资产档案不一致', 400)
      }
      if (
        body.asset.assetClass === 'general' ||
        (!body.asset.assetClass && body.asset.category === '办公家具') ||
        ['维修中', '已报废', '报废'].includes(body.asset.status) ||
        body.asset.condition === '维修中' ||
        body.asset.condition === '已报废'
      ) {
        throw httpError('通用、维修中或已报废的资产不能领用', 409)
      }
      if (
        !isValidDateOnly(body.asset.loanDate) ||
        (body.asset.dueDate &&
          (!isValidDateOnly(body.asset.dueDate) || body.asset.dueDate < body.asset.loanDate))
      ) {
        throw httpError('领用日期或预计归还日期无效', 400)
      }
      transactionAsset = body.asset
    } else {
      if (!current?.borrower?.trim() || current.returned) {
        throw httpError('该资产当前没有未归还的领用记录', 409)
      }
      if (current.borrower.trim() !== borrower) {
        throw httpError('借用人信息已变更，请刷新后重试', 409)
      }
      transactionAsset = {
        ...current,
        borrower: '',
        loanDate: '',
        dueDate: '',
        returned: true,
      }
    }
    if (index < 0) draft.assets.unshift(transactionAsset)
    else draft.assets[index] = transactionAsset
    const log = {
      id: `${Date.now()}-${randomBytes(4).toString('hex')}`,
      action: body.action,
      assetId: transactionAsset.id,
      assetName: transactionAsset.name,
      borrower,
      operator: draft.sitePreferences.adminDisplayName,
      eventAt: new Date().toISOString(),
      dueDate: body.action === '领用' ? transactionAsset.dueDate || '' : '',
    }
    draft.loanLogs.unshift(log)
    return { assets: draft.assets, log }
  })
  sendJson(response, 200, result)
}

async function handleSoftwareAssetUpsert(request, response) {
  const body = await readJson(request)
  if (!isRecord(body)) {
    sendJson(response, 400, { error: '软件资产数据格式无效' })
    return
  }
  if (!validSoftwareAssets([body])) {
    sendJson(response, 400, {
      error: '软件资产数据格式无效：请检查授权总数、已用授权与到期日',
    })
    return
  }
  const softwareAssets = await mutateState((draft) => {
    if (!Array.isArray(draft.softwareAssets)) draft.softwareAssets = []
    const index = draft.softwareAssets.findIndex((item) => item.id === body.id)
    if (index < 0) draft.softwareAssets.unshift(body)
    else draft.softwareAssets[index] = body
    return draft.softwareAssets
  })
  sendJson(response, 200, softwareAssets)
}

async function handleSoftwareAssetDelete(id, response) {
  const softwareAssets = await mutateState((draft) => {
    draft.softwareAssets = (draft.softwareAssets ?? []).filter((item) => item.id !== id)
    return draft.softwareAssets
  })
  sendJson(response, 200, softwareAssets)
}

async function handleVirtualAssetUpsert(request, response) {
  const body = await readJson(request)
  if (!isRecord(body)) {
    sendJson(response, 400, { error: '虚拟资产数据格式无效' })
    return
  }
  if (!validVirtualAssets([body])) {
    sendJson(response, 400, {
      error: '虚拟资产数据格式无效：请检查分类、有效期与到期提醒设置',
    })
    return
  }
  const virtualAssets = await mutateState((draft) => {
    if (!Array.isArray(draft.virtualAssets)) draft.virtualAssets = []
    const index = draft.virtualAssets.findIndex((item) => item.id === body.id)
    if (index < 0) draft.virtualAssets.unshift(body)
    else draft.virtualAssets[index] = body
    return draft.virtualAssets
  })
  sendJson(response, 200, virtualAssets)
}

async function handleVirtualAssetDelete(id, response) {
  const virtualAssets = await mutateState((draft) => {
    draft.virtualAssets = (draft.virtualAssets ?? []).filter((item) => item.id !== id)
    return draft.virtualAssets
  })
  sendJson(response, 200, virtualAssets)
}

async function handleSnapshot(request, response) {
  const body = await readJson(request)
  if (!isRecord(body) || !validAssets(body.assets) || !validLogs(body.loanLogs)) {
    sendJson(response, 400, { error: '备份数据格式无效' })
    return
  }
  if (body.softwareAssets !== undefined && !validSoftwareAssets(body.softwareAssets)) {
    sendJson(response, 400, { error: '备份数据中的软件资产格式无效' })
    return
  }
  if (body.virtualAssets !== undefined && !validVirtualAssets(body.virtualAssets)) {
    sendJson(response, 400, { error: '备份数据中的虚拟资产格式无效' })
    return
  }
  const next = await mutateState((draft) => {
    draft.assets = body.assets
    draft.loanLogs = body.loanLogs
    if (body.softwareAssets !== undefined) draft.softwareAssets = body.softwareAssets
    if (body.virtualAssets !== undefined) draft.virtualAssets = body.virtualAssets
    return draft
  })
  sendJson(response, 200, next)
}

async function handleReset(response) {
  const next = await mutateState((draft) => {
    draft.assets = []
    draft.loanLogs = []
    draft.softwareAssets = []
    draft.virtualAssets = []
    return draft.assets
  })
  sendJson(response, 200, next)
}

// ---- 路由入口 ----

async function handleApiRequest(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const method = request.method || 'GET'
  const pathname = url.pathname

  if (pathname === '/api/health' && method === 'GET') return handleHealth(response)
  if (pathname === '/api/public/site-preferences' && method === 'GET')
    return handlePublicSitePreferences(response)
  if (pathname === '/api/auth/login' && method === 'POST') return handleLogin(request, response)
  if (pathname === '/api/auth/session' && method === 'GET') return handleSessionStatus(request, response)
  if (pathname === '/api/auth/logout' && method === 'POST') return handleLogout(request, response)

  if (!pathname.startsWith('/api/')) return false

  const session = getSession(request)
  if (!session) {
    sendJson(response, 401, { error: '登录已失效，请重新登录' })
    return true
  }
  const isAdmin = session.role === 'admin'
  // 资产管理员与系统管理员拥有资产维护权限；普通用户仅可自助申领
  const canManage = isAdmin || session.role === 'manager'

  try {
    if (pathname === '/api/user/state' && method === 'GET') return await handleUserState(response)
    if (pathname === '/api/loan-requests' && ['GET', 'POST'].includes(method))
      return await handleLoanRequests(request, response, session, canManage)

    const loanReview = pathname.match(/^\/api\/loan-requests\/([^/]+)\/review$/)
    if (loanReview && method === 'POST') {
      if (!canManage) {
        sendJson(response, 403, { error: '仅管理员或资产管理员可审批领用申请' })
        return true
      }
      return await handleLoanReview(request, response, loanReview)
    }

    if (pathname === '/api/users' && method === 'GET') {
      if (!isAdmin) {
        sendJson(response, 403, { error: '仅管理员可查看用户列表' })
        return true
      }
      const current = await readStoredState()
      sendJson(
        response,
        200,
        current.state.users.map(({ passwordHash: _hash, ...rest }) => rest),
      )
      return true
    }
    if (pathname === '/api/users' && method === 'POST') {
      if (!isAdmin) {
        sendJson(response, 403, { error: '仅管理员可添加用户' })
        return true
      }
      return await handleUserCreate(request, response)
    }
    const userDelete = pathname.match(/^\/api\/users\/([^/]+)$/)
    if (userDelete && method === 'DELETE') {
      if (!isAdmin) {
        sendJson(response, 403, { error: '仅管理员可删除用户' })
        return true
      }
      const username = decodeURIComponent(userDelete[1])
      const users = await mutateState((draft) => {
        draft.users = draft.users.filter((item) => item.username !== username)
        return draft.users
      })
      sendJson(
        response,
        200,
        users.map(({ passwordHash: _hash, ...rest }) => rest),
      )
      return true
    }

    if (!canManage) {
      sendJson(response, 403, { error: '普通用户无权访问该接口' })
      return true
    }

    if (pathname === '/api/state' && method === 'GET') return await handleStateGet(response)
    if (pathname === '/api/state/initialize' && method === 'POST') {
      if (!isAdmin) {
        sendJson(response, 403, { error: '仅系统管理员可初始化数据' })
        return true
      }
      return await handleStateInitialize(request, response)
    }
    if (pathname === '/api/state' && method === 'PATCH') {
      if (!isAdmin) {
        sendJson(response, 403, { error: '仅系统管理员可修改系统设置' })
        return true
      }
      return await handleStatePatch(request, response)
    }
    if (pathname === '/api/assets' && method === 'POST') return await handleAssetUpsert(request, response)
    const assetDelete = pathname.match(/^\/api\/assets\/([^/]+)$/)
    if (assetDelete && method === 'DELETE')
      return await handleAssetDelete(decodeURIComponent(assetDelete[1]), response)
    if (pathname === '/api/asset-transactions' && method === 'POST')
      return await handleAssetTransaction(request, response)
    if (pathname === '/api/software-assets' && method === 'POST')
      return await handleSoftwareAssetUpsert(request, response)
    const softwareDelete = pathname.match(/^\/api\/software-assets\/([^/]+)$/)
    if (softwareDelete && method === 'DELETE')
      return await handleSoftwareAssetDelete(decodeURIComponent(softwareDelete[1]), response)
    if (pathname === '/api/virtual-assets' && method === 'POST')
      return await handleVirtualAssetUpsert(request, response)
    const virtualDelete = pathname.match(/^\/api\/virtual-assets\/([^/]+)$/)
    if (virtualDelete && method === 'DELETE')
      return await handleVirtualAssetDelete(decodeURIComponent(virtualDelete[1]), response)
    if (pathname === '/api/snapshot' && method === 'PUT') {
      if (!isAdmin) {
        sendJson(response, 403, { error: '仅系统管理员可导入备份' })
        return true
      }
      return await handleSnapshot(request, response)
    }
    if (pathname === '/api/reset' && method === 'POST') {
      if (!isAdmin) {
        sendJson(response, 403, { error: '仅系统管理员可清空数据' })
        return true
      }
      return await handleReset(response)
    }

    sendJson(response, 404, { error: 'API 不存在' })
    return true
  } catch (error) {
    console.error(`API ${method} ${pathname} failed:`, error)
    sendJson(response, error.statusCode || 500, {
      error: error.statusCode
        ? error.message
        : '服务器数据读写失败，请检查 MySQL 连接、数据库权限和数据格式',
    })
    return true
  }
}

export function createAppServer() {
  return createServer(async (request, response) => {
    try {
      // handleApiRequest 命中 /api 路径即视为已处理；各 handler 自己负责写出响应。
      const isApi = (request.url || '/').startsWith('/api/') ||
        (request.url || '') === '/api'
      if (isApi) {
        await handleApiRequest(request, response)
        return
      }
      const method = request.method || 'GET'
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
      if (method === 'GET' || method === 'HEAD') {
        // serveStatic 自身负责写出响应（成功/400/404），返回值仅表示已处理。
        await serveStatic(url.pathname, response)
        return
      }
      sendJson(response, 405, { error: '不支持的请求方法' })
    } catch (error) {
      console.error('Unhandled request failure:', error)
      if (!response.headersSent) {
        sendJson(response, 500, { error: '服务器内部错误' })
      } else {
        response.end()
      }
    }
  })
}

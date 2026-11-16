import { inject, provide, type Reactive } from 'vue'
import type { AssetWorkspace } from './workspace'

const workspaceKey = Symbol('asset-workspace')

/** 在根组件提供工作台实例 */
export function provideWorkspace(ws: Reactive<AssetWorkspace>) {
  provide(workspaceKey, ws)
}

/** 在任意子组件获取工作台实例 */
export function useWorkspace(): Reactive<AssetWorkspace> {
  const ws = inject<Reactive<AssetWorkspace>>(workspaceKey)
  if (!ws) throw new Error('useWorkspace must be used within a component tree that provides the asset workspace')
  return ws
}

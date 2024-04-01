import { type VaasConfig } from './types/server'

// 仅用来校验vaas.config.js配置的类型检查
export function validVaasConfig (config: VaasConfig): VaasConfig {
  return config
}

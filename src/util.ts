import { VaasServerConfigKey } from './server/lib/decorator'
import { type VaasConfig } from './types/server'

export function entryClassMixins (baseClass: any, classItemList: any[]) {
  for (const classItem of classItemList) {
    const funcNameList = Object.getOwnPropertyNames(classItem.prototype)
    for (const funcName of funcNameList) {
      if (baseClass.prototype[funcName]) {
        if (funcName === VaasServerConfigKey) {
          baseClass.prototype[funcName] = new Map([
            ...baseClass.prototype[funcName].entries(),
            ...classItem.prototype[funcName].entries()
          ])
          continue
        }
        if (funcName === 'constructor') {
          baseClass.prototype[funcName] = (...args) => {
            classItem.prototype[funcName](...args)
            return baseClass.prototype[funcName](...args)
          }
          continue
        }
        throw new Error('该方法已存在，不能进行entryClassMixins')
      }
      baseClass.prototype[funcName] = classItem.prototype[funcName]
    }
  }
  return baseClass
}

// 仅用来校验vaas.config.js配置的类型检查
export function validVaasConfig (config: VaasConfig): VaasConfig {
  return config
}

import {VaasServerConfigKey} from './server/lib/decorator'

export function entryClassMixins(baseClass: any, classItemList: any[]) {
    for (const classItem of classItemList) {
      const funcNameList = Object.getOwnPropertyNames(classItem.prototype)
      for(const funcName of funcNameList) {
        if(baseClass.prototype[funcName]) {
          if(funcName === VaasServerConfigKey) {
            baseClass.prototype[funcName] = new Map([
              ...baseClass.prototype[funcName].entries(),
              ...classItem.prototype[funcName].entries()
            ])
            continue
          }
          if(funcName ==='constructor') {
            continue
          }
          throw new Error('该方法已存在，不能进行entryClassMixins')
        }
        baseClass.prototype[funcName] = classItem.prototype[funcName]
      }
    }
    return baseClass
}
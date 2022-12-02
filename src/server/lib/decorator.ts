import {ServerValue} from '../../types/server'

export const VaasServerConfigKey = '__appConfig' // vm环境和worker环境上下文不一致导致不能使用Symbol
export function VaasServer(vaasServer:ServerValue={type:'http'}) {
    return function(target: any, propertyKey: string, _descriptor: PropertyDescriptor) {
        if(!target[VaasServerConfigKey]) {
          target[VaasServerConfigKey] = new Map<string,ServerValue>()
        }
        target[VaasServerConfigKey].set(
          propertyKey,
          vaasServer
        )
      }
}
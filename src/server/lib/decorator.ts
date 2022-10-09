import {ServerValue} from '../../types/server'

export const VassServerConfigKey = '__appConfig' // vm环境和worker环境上下文不一致导致不能使用Symbol
export function VassServer(vassServer:ServerValue={type:'http'}) {
    return function(target: any, propertyKey: string, _descriptor: PropertyDescriptor) {
        if(!target[VassServerConfigKey]) {
          target[VassServerConfigKey] = new Map<string,ServerValue>()
        }
        target[VassServerConfigKey].set(
          propertyKey,
          vassServer
        )
      }
}
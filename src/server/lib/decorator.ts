import { type ServerValue } from '../../types/server'
import 'reflect-metadata'

export function VaasServer (vaasServer: ServerValue = { type: 'http' }) {
  return function (target: any, propertyKey: string, _descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(propertyKey, vaasServer, target)
  }
}

export function getVaasServerMap (target: any) {
  const vaasServerMap = new Map<string, ServerValue>()
  const propertyKeyList = Reflect.getMetadataKeys(target)
  for (const propertyKey of propertyKeyList) {
    vaasServerMap.set(propertyKey, Reflect.getMetadata(propertyKey, target))
  }
  return vaasServerMap
}

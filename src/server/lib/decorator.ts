import { type WebsocketServerValue, type HttpServerValue, type ServerValue } from '../../types/server'
import 'reflect-metadata'

export function VaasServer (vaasServer: ServerValue = { type: 'http' }) {
  return function (target: any, propertyKey: string, _descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(propertyKey, vaasServer, target)
  }
}

export function Http (httpServerValue: HttpServerValue = {}) {
  return VaasServer({ type: 'http', ...httpServerValue })
}

export function Rpc () {
  return VaasServer({ type: 'rpc' })
}

export function Websocket (websocketServerValue: WebsocketServerValue = {}) {
  return VaasServer({ type: 'websocket', ...websocketServerValue })
}

export function getVaasServerMap (target: any) {
  const vaasServerMap = new Map<string, ServerValue>()
  const propertyKeyList = Reflect.getMetadataKeys(target)
  for (const propertyKey of propertyKeyList) {
    vaasServerMap.set(propertyKey, Reflect.getMetadata(propertyKey, target))
  }
  return vaasServerMap
}

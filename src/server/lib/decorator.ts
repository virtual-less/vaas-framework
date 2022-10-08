import {ServerValue} from '../../types/server'

export const VassServerSymbol = Symbol('VassServerSymbol')
export function VassServer(vassServer:ServerValue={type:'http'}) {
    return function(target: any, propertyKey: string, _descriptor: PropertyDescriptor) {
        if(!target[VassServerSymbol]) {
          target[VassServerSymbol] = new Map<string,ServerValue>()
        }
        target[VassServerSymbol].set(
          propertyKey,
          vassServer
        )
      }
}
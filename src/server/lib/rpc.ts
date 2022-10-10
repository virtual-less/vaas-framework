import { v4 as uuidv4 } from 'uuid'
import {parentPort} from 'worker_threads'
import {ErrorMessage, ResultMessage, WorkerMessage} from '../../types/server'


export function getSerializableErrorByAppName(appName) {
    return new Error(`${appName}'s data is not serializable`)
}

export function workerPostMessage(
    value:WorkerMessage, 
    error:Error
) {
    try {
        parentPort.postMessage(value)
    } catch {
        parentPort.postMessage({type:'error',value:error})
    }
}

function getRpcEventName(eventName:string):string {
    return `rpc-${eventName}`
}

const rpcEventMap:Map<string,(message:WorkerMessage)=>void> = new Map()
let startRpc = false;
export async function rpcInvote(appServerName:string,params:any):Promise<any> {
    if(!startRpc) {
        parentPort.on('message', async (message:WorkerMessage) => {
            if(message.type ==='result' || message.type ==='error') {
                const callback = rpcEventMap.get(getRpcEventName(message.data.executeId))
                if(callback instanceof Function) {
                    return callback(message)
                }
            } 
            
        })
    }
    startRpc = true;
    const appServerNameData = /^(\w+)\.(\w+)$/.exec(appServerName);
    if (!appServerNameData) {
        throw new Error('rpc调用必须按照app.function名方式填写，app和function名称只支持数字字母下划线')
    }
    const appName = appServerNameData[1];
    const serveName = appServerNameData[2];
    const executeId = uuidv4()
    workerPostMessage({
        type:'execute',
        data:{
            appName, 
            serveName, 
            executeId,
            type:'rpc',
            params
        }
    },getSerializableErrorByAppName(appName))
    return new Promise((resolve,reject)=>{
        rpcEventMap.set(getRpcEventName(executeId),(message:ResultMessage|ErrorMessage)=>{
            if(message.type==='result') {
                return resolve(message.data.result)
            }
            if(message.type==='error') {
                return reject(message.data.error)
            }
        })
    })
    
    

}
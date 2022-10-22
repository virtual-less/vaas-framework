import { v4 as uuidv4 } from 'uuid'
import {parentPort} from 'worker_threads'
import {convertError2ErrorConfig} from './error'
import {ErrorMessage, ResultMessage, WorkerMessage} from '../../types/server'


export function getSerializableErrorByAppName(appName) {
    return new Error(`${appName}'s data is not serializable`)
}

export function workerPostMessage(
    value:WorkerMessage, 
    error:Error
) {
    try {
        if(value.type==='error') {
            value.data.error = convertError2ErrorConfig({
                error:value.data.error
            })
        }
        parentPort.postMessage(value)
    } catch {
        parentPort.postMessage({
            type:'error',
            value:{
                error:convertError2ErrorConfig({
                    error
                })
            }
        })
    }
}

function getRpcEventName(eventName:string):string {
    return `rpc-${eventName}`
}

const rpcEventMap:Map<string,(message:WorkerMessage)=>void> = new Map()
let startRpc = false;

export async function rpcInvote<P,R>(appServerName:string,params:P):Promise<R> {
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
                // @ts-ignore
                return resolve(message.data.result.data)
            }
            if(message.type==='error') {
                return reject(message.data.error)
            }
        })
    })
    
    

}
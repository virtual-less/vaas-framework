import {dynamicRun} from 'vaas-core'
import {promises as fsPromises} from 'fs'
import * as path from 'path'
import {parentPort, workerData} from 'worker_threads'

import {VassServerSymbol} from '../lib/decorator'
import {WorkerMessage, ExecuteMessageBody} from '../../types/server'

class MessageError extends Error {
    executeId?:string
}

function workerPostMessage(
    value:WorkerMessage, 
    error:MessageError=new MessageError(`${workerData.appName}'s data is not serializable`)
) {
    try {
        parentPort.postMessage(value)
    } catch {
        parentPort.postMessage({type:'error',value:error})
    }
}

export class VaasWorker {

    async run() {
        const appClass = await this.loadServer()
        const app = new appClass()
        const appConfig = app[VassServerSymbol]
        workerPostMessage(
            {type:'init',data:{appConfig}},
            new MessageError(`${workerData.appName}'s @VassServer config is not serializable`)
        )
        parentPort.on('message', async (message:WorkerMessage) => {
            if(message.type !=='execute') {return} 
            const executeMessage:ExecuteMessageBody= message.data;
            try {
                const data = await app[executeMessage.serveName](executeMessage.params)
                if(executeMessage.type==='http') {
                    workerPostMessage(
                        {type:'result',data:{
                        result:{
                            outRequestConfig:executeMessage.params.req, 
                            outResponseConfig:executeMessage.params.res, 
                            data
                        },executeId:executeMessage.executeId}}
                    )
                } else {
                    workerPostMessage(
                        {type:'result',data:{
                        result:{
                            data
                        },executeId:executeMessage.executeId}}
                    )
                }
                
            } catch(error) {
                workerPostMessage(
                    {type:'error',data:{error,executeId:executeMessage.executeId}}
                )
            }
        })
    }

    async loadServer():Promise<any> {
        const appDirPath = path.join(workerData.appsDir,workerData.appName)
        const appEntryPath = path.join(appDirPath,'index.js');
        const appEntryStat = await fsPromises.stat(appEntryPath);
        if(!appEntryStat.isFile()) {throw new MessageError(`该微服务(${workerData.appName})不存在index入口文件`)}
        const code = (await fsPromises.readFile(appEntryPath)).toString()
        const appProgram = dynamicRun({
            code,
            filename:appEntryPath,
            overwriteRequire:(callbackData)=>{
                if(callbackData.modulePath[0]==='/') {
                    // node_module和相对路径处理方法，这样引用不会丢失类型判断
                    if(callbackData.modulePath.indexOf(appDirPath)<0) {
                        throw new MessageError(`file[${
                            callbackData.filename
                        }] can't require module[${
                            callbackData.modulePath
                        }] beyond appDirPath[${
                            appDirPath
                        }], use rpcInvote('app.server',{...}) to call server,please`)
                    } 
                    if(!(/\.js$/.exec(callbackData.moduleId))) {
                        return callbackData.nativeRequire(callbackData.modulePath)
                    }
                } else {
                    // 系统模块处理方法
                    const allowModuleSet:Set<string> = workerData.allowModuleSet
                    if(allowModuleSet.has("*")) {return callbackData.nativeRequire(callbackData.modulePath)}
                    if(allowModuleSet.has(callbackData.modulePath)) {return callbackData.nativeRequire(callbackData.modulePath)}
                    throw new MessageError(`file[${
                        callbackData.filename
                    }] can't require module[${
                        callbackData.modulePath
                    }] beyond appDirPath[${
                        appDirPath
                    }], add module[${
                        callbackData.modulePath
                    }] to allowModuleSet,please`)
                }
                
            }
        })
        return appProgram.default
    }

}


new VaasWorker().run().catch((error)=>{
    workerPostMessage(
        {type:'error', data:{error}}, 
        new MessageError(`${workerData.appName}'s Exception is not serializable`)
        )
})

process.on('uncaughtException', (error) => {
    workerPostMessage(
        {type:'error', data:{error}}, 
        new MessageError(`${workerData.appName}'s uncaughtException is not serializable`)
        )
})

process.on('unhandledRejection', (error) => {
    workerPostMessage(
        {type:'error', data:{error}}, 
        new MessageError(`${workerData.appName}'s unhandledRejection is not serializable`)
    )
})
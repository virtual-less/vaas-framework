import {dynamicRun, proxyData} from 'vaas-core'
import {promises as fsPromises} from 'fs'
import {parentPort, workerData} from 'worker_threads'


import {VassServerConfigKey} from '../lib/decorator'
import {workerPostMessage, getSerializableErrorByAppName} from '../lib/rpc'
import {WorkerMessage, ExecuteMessageBody} from '../../types/server'

const packageInfo = require('../../../package.json')


const notSerializableError = getSerializableErrorByAppName(workerData.appName)

export class VaasWorker {

    async run() {
        const appClass = await this.loadServer()
        const app = new appClass()
        const appConfig = app[VassServerConfigKey]
        workerPostMessage(
            {type:'init',data:{appConfig}},
            new Error(`${workerData.appName}'s @VassServer config is not serializable`)
        )
        parentPort.on('message', async (message:WorkerMessage) => {
            if(message.type !=='execute') {return} 
            const executeMessage:ExecuteMessageBody= message.data;
            try {
                const data = await app[executeMessage.serveName](executeMessage.params)
                if(executeMessage.type==='http') {
                    workerPostMessage(
                        {
                            type:'result',
                            data:{
                            result:{
                                outRequestConfig:executeMessage.params.req, 
                                outResponseConfig:executeMessage.params.res, 
                                data
                            },
                            type:executeMessage.type,
                            executeId:executeMessage.executeId
                            }
                        }
                    ,notSerializableError)
                } else {
                    workerPostMessage(
                        {
                            type:'result',
                            data:{
                                result:{
                                    data
                                },
                                type:executeMessage.type,
                                executeId:executeMessage.executeId
                            }
                        }
                    ,notSerializableError)
                }
                
            } catch(error) {
                workerPostMessage(
                    {type:'error',data:{error,executeId:executeMessage.executeId}}
                ,notSerializableError)
            }
        })
    }

    async loadServer():Promise<any> {
        // 关于文件的存在性，在初始化线程前判断，节约线程开支
        const code = (await fsPromises.readFile(workerData.appEntryPath)).toString()
        const appProgram = dynamicRun({
            code,
            filename:workerData.appEntryPath,
            extendVer:{
                process:proxyData(process)
            },
            overwriteRequire:(callbackData)=>{
                if(packageInfo.name === callbackData.moduleId) {
                    return callbackData.nativeRequire(callbackData.moduleId)
                }
                if(callbackData.modulePath[0]==='/') {
                    // node_module和相对路径处理方法，这样引用不会丢失类型判断
                    if(callbackData.modulePath.indexOf(workerData.appDirPath)<0) {
                        throw new Error(`file[${
                            callbackData.filename
                        }] can't require module[${
                            callbackData.modulePath
                        }] beyond appDirPath[${
                            workerData.appDirPath
                        }], use ${packageInfo.name}.rpcInvote('app.server',{...}) to call server,please`)
                    } 
                    if(!(/\.js$/.exec(callbackData.moduleId))) {
                        return callbackData.nativeRequire(callbackData.modulePath)
                    }
                } else {
                    // 系统模块处理方法
                    const allowModuleSet:Set<string> = workerData.allowModuleSet
                    if(allowModuleSet.has("*")) {return callbackData.nativeRequire(callbackData.modulePath)}
                    if(allowModuleSet.has(callbackData.modulePath)) {return callbackData.nativeRequire(callbackData.modulePath)}
                    throw new Error(`file[${
                        callbackData.filename
                    }] can't require module[${
                        callbackData.modulePath
                    }] beyond appDirPath[${
                        workerData.appDirPath
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
        new Error(`${workerData.appName}'s Exception is not serializable`)
        )
})

process.on('uncaughtException', (error) => {
    workerPostMessage(
        {type:'error', data:{error}}, 
        new Error(`${workerData.appName}'s uncaughtException is not serializable`)
        )
})

process.on('unhandledRejection', (error) => {
    workerPostMessage(
        {type:'error', data:{error}}, 
        new Error(`${workerData.appName}'s unhandledRejection is not serializable`)
    )
})
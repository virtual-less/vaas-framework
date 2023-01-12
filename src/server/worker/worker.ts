import {dynamicRun, proxyData} from 'vaas-core'
import {parentPort, workerData} from 'worker_threads'
import {promises as fsPromises} from 'fs'
import * as path from 'path'


import {VaasServerConfigKey} from '../lib/decorator'
import {workerPostMessage} from '../lib/rpc'
import {WorkerMessage, ExecuteMessageBody} from '../../types/server'
import {deprecate} from 'util'

const packageInfo = require('../../../package.json')

export class VaasWorker {

    async run() {
        const appClass = await this.loadServer()
        const app = new appClass()
        const appConfig = app[VaasServerConfigKey]
        workerPostMessage(
            {type:'init',data:{appConfig}}
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
                    )
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
        const {appName, appDirPath} = workerData;
        let appEntryPath = path.join(appDirPath, 'index.js');
        const appEntryPackageJsonPath = path.join(appDirPath, 'package.json');
        const appEntryPackageJsonStat = await fsPromises.stat(appEntryPackageJsonPath);
        if(appEntryPackageJsonStat.isFile()) {
            let appEntryPackageJson:NodeJS.Dict<any> = {}
            try {
                appEntryPackageJson = JSON.parse((await fsPromises.readFile(appEntryPackageJsonPath)).toString())
            } catch(err) {
                err.stack = `该微服务(${appName})的package.json文件异常，请检查(${appEntryPackageJsonPath}) \n ` + err.stack
                throw err
            }
            if(appEntryPackageJson.main && typeof appEntryPackageJson.main==='string') {
                appEntryPath = path.join(appDirPath, appEntryPackageJson.main);
            }
        }
        const FileNotExistError = new Error(`该微服务(${appName})不存在入口文件(${appEntryPath})`)
        try {
            const appEntryStat = await fsPromises.stat(appEntryPath);
            if(!appEntryStat.isFile()) {throw FileNotExistError;}
        } catch(err) {
            throw FileNotExistError;
        }
        // 关于文件的存在性，在初始化线程前判断，节约线程开支
        const appProgram = dynamicRun({
            filepath:appEntryPath,
            extendVer:{
                process:proxyData(process),
                Buffer:proxyData(Buffer),
                global:proxyData(global),
                setTimeout:proxyData(setTimeout),
                clearTimeout:proxyData(clearTimeout),
                setInterval:proxyData(setInterval),
                clearInterval:proxyData(clearInterval),
                setImmediate:proxyData(setImmediate),
                clearImmediate:proxyData(clearImmediate),
            },
            overwriteRequire:(callbackData)=>{
                if(packageInfo.name === callbackData.moduleId) {
                    return callbackData.nativeRequire(callbackData.moduleId)
                }
                if(callbackData.modulePath[0]==='/') {
                    // node_module和相对路径处理方法，这样引用不会丢失类型判断
                    if(callbackData.modulePath.indexOf(workerData.appDirPath)<0) {
                        throw new Error(`file[${
                            callbackData.filepath
                        }] can't require module[${
                            callbackData.modulePath
                        }] beyond appDirPath[${
                            workerData.appDirPath
                        }], use ${packageInfo.name}.rpcInvote('app.server',{...}) to call server,please`)
                    } 
                    if(!(/\.js$/.exec(callbackData.modulePath))) {
                        if(/\.node$/.exec(callbackData.modulePath)) {
                            deprecate(() => {}, `c++ extension method will be deprecated! [${callbackData.modulePath}]`)();
                        }
                        return callbackData.nativeRequire(callbackData.modulePath)
                    }
                } else {
                    // 系统模块处理方法
                    const allowModuleSet:Set<string> = workerData.allowModuleSet
                    if(allowModuleSet.has("*")) {return callbackData.nativeRequire(callbackData.modulePath)}
                    if(allowModuleSet.has(callbackData.modulePath)) {return callbackData.nativeRequire(callbackData.modulePath)}
                    throw new Error(`file[${
                        callbackData.filepath
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
        {type:'error', data:{error}}
    )
})

process.on('uncaughtException', (error) => {
    workerPostMessage(
        {type:'error', data:{error}},
    )
})

process.on('unhandledRejection', (error) => {
    workerPostMessage(
        {type:'error', data:{error}}
    )
})
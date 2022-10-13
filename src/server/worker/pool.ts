import {Worker, WorkerOptions} from 'worker_threads'
import {promises as fsPromises} from 'fs'
import {Buffer} from 'buffer'
import * as path from 'path'
import {WorkerMessage, ServerValue, ExecuteMessageBody, ExecuteMessage, GetAppConfigByAppName, ResultMessage, ErrorMessage} from '../../types/server'

interface VaasWorkerOptions extends WorkerOptions {
    recycleTime:number
}

class VaasWorker extends Worker {
    appServerConfigMap:Map<string, ServerValue>
    createAt:number
    updateAt:number
    recycleTime:number
    messageStatus:'runing'| null
    private latestExecuteId:string
    private messageEventMap:Map<string,(message:WorkerMessage)=>void> = new Map()
    constructor(filename: string | URL, options?: VaasWorkerOptions) {
        super(filename, options)
        this.createAt = Date.now()
        this.updateAt = Date.now()
        this.recycleTime = options.recycleTime
    }

    private getExecuteEventName(eventName:string):string {
        return `execute-${eventName}`
    }

    private doMessage() {
        if(this.messageStatus ==='runing'){return;}
        this.messageStatus = 'runing'
        const messageFunc = async (message:WorkerMessage) => {
            if(message.type==='init') {return;}
            if(message.type==='execute') {
                const executeMessageBody = message.data;
                const vaasWorkPool = VaasWorkPool.instance;
                const vaasWorker = await vaasWorkPool.getWokerByAppName({
                    appName:executeMessageBody.appName,
                })
                try {
                    const serverValue = vaasWorker.appServerConfigMap.get(executeMessageBody.serveName)
                    if(serverValue.type!==executeMessageBody.type) {
                        throw new Error(`appName[${executeMessageBody.appName}]'s serveName[${
                            executeMessageBody.serveName
                        }] not matched type[${executeMessageBody.type}]`)
                    }
                    const result = await vaasWorker.execute(executeMessageBody)
                    const resultMessage:ResultMessage = {
                        type:'result',
                        data:{
                            executeId:executeMessageBody.executeId,
                            type:executeMessageBody.type,
                            result
                        }
                    }
                    this.postMessage(resultMessage)
                } catch(error) {
                    const errorMessage:ErrorMessage = {
                        type:'error',
                        data:{
                            executeId:executeMessageBody.executeId,
                            error
                        }
                    }
                    this.postMessage(errorMessage)
                }
            } else {
                const {executeId} = message.data;
                const callback = this.messageEventMap.get(this.getExecuteEventName(executeId || this.latestExecuteId))
                if(callback instanceof Function) {
                    return callback(message)
                }
            }
        }
        this.on('message', messageFunc)
    }

    execute({appName,serveName, executeId, type, params}:ExecuteMessageBody):Promise<any> {
        this.updateAt = Date.now()
        const executeMessage:ExecuteMessage =  {
            type:'execute',
            data:{
                type,
                appName,
                serveName,
                executeId,
                params
            }
        }
        this.latestExecuteId = executeId;
        this.postMessage(executeMessage)
        this.doMessage();
        return new Promise<any>((resolve,reject)=>{
            let isComplete = false
            const messageEventName = this.getExecuteEventName(executeId)
            this.messageEventMap.set(messageEventName,(message)=>{
                isComplete = true;
                if(message.type==='result') {
                    // 兼容低版本node的buffer未转化问题
                    if(message.data.result.data instanceof Uint8Array) {
                        message.data.result.data = Buffer.from(message.data.result.data)
                    }
                    return resolve(message.data.result)
                }
                if(message.type==='error') {
                    return reject(message.data.error)
                }
            })
            const timeoutId = setTimeout(()=>{
                clearTimeout(timeoutId)
                this.messageEventMap.delete(messageEventName)
                if(!isComplete) {
                    return reject(new Error(`worker run time out[${this.recycleTime}]`))
                }
            }, this.recycleTime)
        })
    }
    
    recyclable() {
        return this.updateAt+this.recycleTime<Date.now()
    }
}

class VaasWorkerSet extends Set<VaasWorker> {
    private workerIterator:IterableIterator<VaasWorker>
    next() {
        if(!this.workerIterator){this.workerIterator = this.values()}
        const nextValue = this.workerIterator.next()
        if(nextValue.done) {
            this.workerIterator = this.values()
            return this.workerIterator.next().value;
        }
        return nextValue.value;
    }
}

export class VaasWorkPool {
    pool:Map<string,VaasWorkerSet> = new Map<string,VaasWorkerSet>()
    workerRecycleCheckTime:number;
    appsDir:string
    getAppConfigByAppName:GetAppConfigByAppName
    static instance:VaasWorkPool = null
    constructor({
        appsDir,
        getAppConfigByAppName
    }:{
        appsDir:string,
        getAppConfigByAppName:GetAppConfigByAppName
    }) {
        if(VaasWorkPool.instance) {
            return VaasWorkPool.instance
        }
        VaasWorkPool.instance = this;
        this.getAppConfigByAppName = getAppConfigByAppName
        this.appsDir = appsDir
    }

    private recycle({vaasWorker, vaasWorkerSet, appName, recycleTime}:{
        vaasWorker:VaasWorker
        vaasWorkerSet:VaasWorkerSet,
        appName:string,
        recycleTime:number
    }) {
        const recycleTimeId = setTimeout(()=>{
            if(vaasWorker.recyclable()) {
                vaasWorkerSet.delete(vaasWorker)
                vaasWorker.terminate()
                if(vaasWorkerSet.size<=0) {
                    this.pool.delete(appName)
                }
            } else {
                this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
            }
            clearTimeout(recycleTimeId)
        },recycleTime+1)
    }
    private async getWorker({appsDir,appName,allowModuleSet,recycleTime,resourceLimits}):Promise<VaasWorker> {
        const appDirPath = path.join(appsDir,appName)
        const appEntryPath = path.join(appDirPath,'index.js');
        const FileNotExistError = new Error(`该微服务(${appName})不存在index入口文件`)
        try {
            const appEntryStat = await fsPromises.stat(appEntryPath);
            if(!appEntryStat.isFile()) {throw FileNotExistError;}
        } catch(err) {
            throw FileNotExistError;
        }
        const worker = new VaasWorker(path.join(__dirname,'worker.js'),{
            resourceLimits,
            recycleTime,
            workerData:{appsDir,appName,appDirPath,appEntryPath,allowModuleSet}
        })
        return await new Promise((reslove,reject)=>{
            worker.once('message', (message:WorkerMessage)=>{
                if(message.type!=='init') {
                    worker.terminate()
                    if(message.type==='error') {
                        return reject(message.data.error)
                    } else {
                        return reject(new Error(`init ${appName} worker failed`))
                    }
                }
                worker.appServerConfigMap = message.data.appConfig
                return reslove(worker)
            });
            worker.once('error', (err)=>{
                worker.removeAllListeners()
                worker.terminate()
                return reject(err)
            });
            worker.once('exit', (code) => {
                worker.removeAllListeners()
                if (code !== 0)
                return reject(new Error(`Worker stopped with exit code ${code}`));
            });
        })
    }

    async getWokerByAppName({appName}):Promise<VaasWorker> {
        const appsDir = this.appsDir;
        const appConfig = await this.getAppConfigByAppName(appName)
        const maxWorkerNum=appConfig.maxWorkerNum
        const allowModuleSet=appConfig.allowModuleSet
        const recycleTime=appConfig.timeout
        const resourceLimits=appConfig.resourceLimits
        if(this.pool.has(appName)) {
            const vaasWorkerSet = this.pool.get(appName)
            if(vaasWorkerSet.size<maxWorkerNum){
                const vaasWorker = await this.getWorker({appsDir,appName,allowModuleSet,resourceLimits,recycleTime})
                vaasWorkerSet.add(vaasWorker)
                this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
            }
            return vaasWorkerSet.next()
        }
        const vaasWorker = await this.getWorker({appsDir,appName,allowModuleSet,resourceLimits,recycleTime})
        const vaasWorkerSet = new VaasWorkerSet([vaasWorker])
        this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
        this.pool.set(appName,vaasWorkerSet)
        return this.pool.get(appName).next()
    }
}



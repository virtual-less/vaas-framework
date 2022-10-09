import {Worker, WorkerOptions} from 'worker_threads'
import {promises as fsPromises} from 'fs'
import * as path from 'path'
import {WorkerMessage, ServerValue, ExecuteMessageBody, ResultMessageBody, ExecuteMessage} from '../../types/server'

interface VaasWorkerOptions extends WorkerOptions {
    recycleTime:number
}

class VaasWorker extends Worker {
    appServerConfigMap:Map<string, ServerValue>
    createAt:number
    updateAt:number
    recycleTime:number
    messageStatus:'runing'| null
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
        const messageFunc = (message:WorkerMessage) => {
            if(message.type==='result') {
                const {executeId, result}:ResultMessageBody = message.data;
                return this.emit(this.getExecuteEventName(executeId),{executeId, result})
            }
            if(message.type==='error') {
                return this.emit(this.getExecuteEventName('error'), message.data)
            }
        }
        this.on('message', messageFunc)
    }

    execute({serveName, executeId, type, params}:ExecuteMessageBody):Promise<any> {
        this.updateAt = Date.now()
        const executeMessage:ExecuteMessage =  {
            type:'execute',
            data:{
                type,
                serveName,
                executeId,
                params
            }
        }
        this.postMessage(executeMessage)
        this.doMessage();
        return new Promise<any>((resolve,reject)=>{
            let resultMessageFunc,errorMessageFunc
            let isComplete = false
            const workerResolve = (value)=>{
                this.removeListener(executeId, resultMessageFunc)
                this.removeListener('error', errorMessageFunc)
                isComplete = true;
                return resolve(value)
            }
            const workerReject = (error)=>{
                this.removeListener(executeId, resultMessageFunc)
                this.removeListener('error', errorMessageFunc)
                isComplete = true;
                return reject(error)
            }
            resultMessageFunc = (value:ResultMessageBody)=>{
                return workerResolve(value.result)
            }
            errorMessageFunc = (error)=>{
                return workerReject(error)
            }
            this.once(this.getExecuteEventName(executeId), resultMessageFunc)
            this.once(this.getExecuteEventName('error'), errorMessageFunc)
            const timeoutId = setTimeout(()=>{
                clearTimeout(timeoutId)
                if(!isComplete) {
                    return workerReject(new Error(`worker run time out[${this.recycleTime}]`))
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
            this.workerIterator.next().value;
        }
        return nextValue.value;
    }
}

export class VaasWorkPool {
    pool:Map<string,VaasWorkerSet> = new Map<string,VaasWorkerSet>()
    workerRecycleCheckTime:number;
    static instance:VaasWorkPool = null
    constructor() {
        if(VaasWorkPool.instance) {
            return VaasWorkPool.instance
        }
        VaasWorkPool.instance = this;
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
    private async getWorker({appsDir,appName,allowModuleSet,recycleTime}):Promise<VaasWorker> {
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

    async getWokerByAppName({appsDir,appName,maxWorkerNum,allowModuleSet,recycleTime}):Promise<VaasWorker> {
        if(this.pool.has(appName)) {
            const vaasWorkerSet = this.pool.get(appName)
            if(vaasWorkerSet.size<maxWorkerNum){
                const vaasWorker = await this.getWorker({appsDir,appName,allowModuleSet,recycleTime})
                vaasWorkerSet.add(vaasWorker)
                this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
            }
            return vaasWorkerSet.next()
        }
        const vaasWorker = await this.getWorker({appsDir,appName,allowModuleSet,recycleTime})
        const vaasWorkerSet = new VaasWorkerSet([vaasWorker])
        this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
        this.pool.set(appName,vaasWorkerSet)
        return this.pool.get(appName).next()
    }
}



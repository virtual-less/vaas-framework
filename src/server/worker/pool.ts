import {Worker, WorkerOptions} from 'worker_threads'
import * as path from 'path'
import {WorkerMessage, ServerValue, ExecuteMessageBody, ResultMessageBody} from '../../types/server'

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

    execute({serveName, executeId, params}:ExecuteMessageBody):Promise<any> {
        this.updateAt = Date.now()
        this.postMessage({
            type:'execute',value:{
                serveName,
                executeId,
                params
            }
        })
        this.doMessage();
        return new Promise<any>((resolve,reject)=>{
            let resultMessageFunc,errorMessageFunc
            const workerResolve = (value)=>{
                this.removeListener(executeId, resultMessageFunc)
                this.removeListener('error', errorMessageFunc)
                return resolve(value)
            }
            const workerReject = (error)=>{
                this.removeListener(executeId, resultMessageFunc)
                this.removeListener('error', errorMessageFunc)
                return reject(error)
            }
            resultMessageFunc = (value:ResultMessageBody)=>{
                return workerResolve(value.result)
            }
            errorMessageFunc = (error)=>{
                return workerReject(error)
            }
            this.once(this.getExecuteEventName(executeId), resultMessageFunc)
            this.once(this.getExecuteEventName('error'), resultMessageFunc)
            setTimeout(()=>{
                return workerReject(new Error(`worker run time out[${this.recycleTime}]`))
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
    pool:Map<string,VaasWorkerSet>
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
    private async getWorker({appsDir,appName,recycleTime}):Promise<VaasWorker> {
        const worker = new VaasWorker(path.join(__dirname,'worker.js'),{
            recycleTime,
            workerData:{appsDir,appName}
        })
        return await new Promise((reslove,reject)=>{
            worker.once('message', (message:WorkerMessage)=>{
                if(message.type!=='init') {
                    worker.terminate()
                    throw new Error(`init ${appName} worker failed`)
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

    async getWokerByAppName({appsDir,appName,maxWorkerNum,recycleTime}):Promise<VaasWorker> {
        if(this.pool.has(appName)) {
            const vaasWorkerSet = this.pool.get(appName)
            if(vaasWorkerSet.size<maxWorkerNum){
                const vaasWorker = await this.getWorker({appsDir,appName,recycleTime})
                vaasWorkerSet.add(vaasWorker)
                this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
            }
            return vaasWorkerSet.next()
        }
        const vaasWorker = await this.getWorker({appsDir,appName,recycleTime})
        const vaasWorkerSet = new VaasWorkerSet([vaasWorker])
        this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
        this.pool.set(appName,vaasWorkerSet)
        return this.pool.get(appName).next()
    }
}



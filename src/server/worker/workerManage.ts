import {Worker, WorkerOptions} from 'worker_threads'
import {Buffer} from 'buffer'
import {convertError2ErrorConfig,convertErrorConfig2Error} from '../lib/error'
import {WorkerMessage, ServerValue, ExecuteMessageBody, ExecuteMessage, ResultMessage, ErrorMessage} from '../../types/server'
import * as Router from 'koa-router';
import { Context } from 'koa';
interface VaasWorkerOptions extends WorkerOptions {
    appName:string;
    recycleTime:number;
    poolInstance:any;
}

export class VaasWorker extends Worker {
    appName:string;
    poolInstance:any;
    appServerConfigMap:Map<string, ServerValue>
    createAt:number
    updateAt:number
    recycleTime:number
    messageStatus:'runing'| null
    isExit:boolean
    rootRoutes:Router.IMiddleware
    routes:Router.IMiddleware
    private latestExecuteId:string
    private messageEventMap:Map<string,{
        info:NodeJS.Dict<any>
        callback:(message:WorkerMessage)=>void
    }> = new Map()
    constructor(filename: string | URL, options?: VaasWorkerOptions) {
        super(filename, options)
        this.createAt = Date.now()
        this.updateAt = Date.now()
        this.appName = options.appName
        this.recycleTime = options.recycleTime
        this.poolInstance = options.poolInstance
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
                try {
                    let vaasWorker = this
                    if(this.appName!==executeMessageBody.appName) {
                        vaasWorker = await this.poolInstance.getWokerByAppName({appName:executeMessageBody.appName})
                    }
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
                            error:convertError2ErrorConfig({error})
                        }
                    }
                    this.postMessage(errorMessage)
                }
            } else {
                const {executeId} = message.data;
                const messageEvent = this.messageEventMap.get(this.getExecuteEventName(executeId || this.latestExecuteId))
                if(messageEvent?.callback instanceof Function) {
                    return messageEvent.callback(message)
                }
            }
        }
        this.on('message', messageFunc)
    }

    execute({appName, serveName, executeId, type, params}:ExecuteMessageBody):Promise<any> {
        if(this.isExit) {
            if(this.latestExecuteId) {
                const messageEvent = this.messageEventMap.get(this.getExecuteEventName(this.latestExecuteId))
                throw new Error(`appName[${
                    appName
                }] worker was exit!maybe cause by ${
                    messageEvent?.info?JSON.stringify(messageEvent.info):'unkown'
                } request`)
            }
            throw new Error(`appName[${appName}] worker was exit`)
        }
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
            const timeoutId = setTimeout(()=>{
                // clearTimeout(timeoutId) //没必要清除
                this.messageEventMap.delete(messageEventName)
                if(!isComplete) {
                    return reject(new Error(`worker run time out[${this.recycleTime}]`))
                }
            }, this.recycleTime)
            this.messageEventMap.set(messageEventName,{
                // 不建议info过大，对性能造成影响
                info:{
                    type,
                    appName,
                    serveName,
                    executeId,
                },
                callback:(message:WorkerMessage)=>{
                    isComplete = true;
                    // 这里是为了性能优化，防止无效setTimeout积压
                    clearTimeout(timeoutId)
                    if(message.type==='result') {
                        // 兼容低版本node的buffer未转化问题
                        if(message.data.result.data instanceof Uint8Array) {
                            message.data.result.data = Buffer.from(message.data.result.data)
                        }
                        return resolve(message.data.result)
                    }
                    if(message.type==='error') {
                        return reject(convertErrorConfig2Error({errorConfig:message.data.error}))
                    }
                }
            })
        })
    }

    generateRouter() {
        const typeList = ['http', 'websocket']
        const workerRootRouter = new Router()
        for (const [serveName,serveValue] of this.appServerConfigMap) {
            if(!typeList.includes(serveValue.type)) {
                continue
            }
            const middleware = async  (ctx:Context) => {
                ctx.serveName = serveName
                ctx.serveValue = serveValue
            }
            if(serveValue.routerName) {
                workerRootRouter[serveValue.method](serveValue.routerName, middleware)
            } else {
                workerRootRouter[serveValue.method](`/${serveName}`, middleware)
            }
        }
        this.rootRoutes = workerRootRouter.routes()
        const workerRouter = new Router()
        workerRouter.use(`/${this.appName}`, this.rootRoutes, workerRootRouter.allowedMethods())
        this.routes = workerRouter.routes()
    }
    
    recyclable() {
        return this.isExit || (this.updateAt+this.recycleTime<Date.now())
    }
}

export class VaasWorkerSet extends Set<VaasWorker> {
    private workerIterator:IterableIterator<VaasWorker>
    maxSize:number=0
    constructor(iterable: Iterable<VaasWorker> ,maxSize:number) {
        super(iterable)
        this.maxSize = maxSize
    }
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
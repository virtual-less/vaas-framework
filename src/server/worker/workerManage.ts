import { Worker, type WorkerOptions } from 'worker_threads'
import { Buffer } from 'buffer'
import { type Context } from 'koa'
import { convertError2ErrorConfig, convertErrorConfig2Error } from '../lib/error'
import {
  type WorkerMessage, type ServerValue, type ExecuteMessageBody,
  type ExecuteMessage, type ResultMessage, type ErrorMessage,
  WorkerMessageType
} from '../../types/server'
import { VaasWorkerStream } from './workerStream'
interface VaasWorkerOptions extends WorkerOptions {
  appName: string
  version: string
  recycleTime: number
  poolInstance: any
}

export class VaasWorker extends Worker {
  appName: string
  version: string
  poolInstance: any
  appServerConfigMap: Map<string, ServerValue>
  routerMiddleware: (ctx: Context) => Promise<void>
  createAt: number
  updateAt: number
  recycleTime: number
  messageStatus: 'runing' | null
  isExit: boolean
  private latestExecuteId: string
  private readonly messageEventMap = new Map<string, {
    info: NodeJS.Dict<any>
    callback: (message: WorkerMessage) => void
  }>()

  constructor (filename: string | URL, options?: VaasWorkerOptions) {
    super(filename, options)
    this.createAt = Date.now()
    this.updateAt = Date.now()
    this.appName = options.appName
    this.version = options.version
    this.recycleTime = options.recycleTime
    this.poolInstance = options.poolInstance
  }

  async init () {
    await this.doMessage()
  }

  private getExecuteEventName (eventName: string): string {
    return `execute-${eventName}`
  }

  private async doMessage () {
    if (this.messageStatus === 'runing') { return }
    this.messageStatus = 'runing'
    return await new Promise((resolve, reject) => {
      const messageFunc = async (message: WorkerMessage) => {
        if (message.type === 'execute') {
          const executeMessageBody = message.data
          try {
            const vaasWorker: VaasWorker = await this.poolInstance.getWokerByAppName({ appName: executeMessageBody.appName, version: this.version })
            const appServerConfigMap = vaasWorker.appServerConfigMap
            const serverValue = appServerConfigMap.get(executeMessageBody.serveName)
            if (serverValue.type !== executeMessageBody.type) {
              throw new Error(`appName[${executeMessageBody.appName}]'s serveName[${
                              executeMessageBody.serveName
                          }] not matched type[${executeMessageBody.type}]`)
            }
            const result = await vaasWorker.execute(executeMessageBody)
            const resultMessage: ResultMessage = {
              type: WorkerMessageType.result,
              data: {
                executeId: executeMessageBody.executeId,
                type: executeMessageBody.type,
                result
              }
            }
            this.postMessage(resultMessage)
          } catch (error) {
            const errorMessage: ErrorMessage = {
              type: WorkerMessageType.error,
              data: {
                type: executeMessageBody.type,
                executeId: executeMessageBody.executeId,
                error: convertError2ErrorConfig({ error })
              }
            }
            this.postMessage(errorMessage)
          }
        } else if (message.type === WorkerMessageType.error || message.type === WorkerMessageType.result) {
          const { executeId } = message.data
          const messageEvent = this.messageEventMap.get(this.getExecuteEventName(executeId || this.latestExecuteId))
          if (messageEvent?.callback instanceof Function) {
            messageEvent.callback(message)
          }
          if (message.type === WorkerMessageType.error) {
            reject(convertErrorConfig2Error({ errorConfig: message.data.error }))
          }
        } else if (message.type === WorkerMessageType.init) {
          this.appServerConfigMap = message.data.appConfig
          resolve(message.data.appConfig)
        }
      }
      this.on('message', messageFunc)
    })
  }

  async execute ({ appName, serveName, executeId, type, params }: ExecuteMessageBody): Promise<any> {
    if (this.isExit) {
      if (this.latestExecuteId) {
        const messageEvent = this.messageEventMap.get(this.getExecuteEventName(this.latestExecuteId))
        throw new Error(`appName[${
                    appName
                }] worker was exit!maybe cause by ${
                    messageEvent?.info ? JSON.stringify(messageEvent.info) : 'unkown'
                } request`)
      }
      throw new Error(`appName[${appName}] worker was exit`)
    }
    this.updateAt = Date.now()
    const executeMessage: ExecuteMessage = {
      type: WorkerMessageType.execute,
      data: {
        type,
        appName,
        serveName,
        executeId,
        params
      }
    }
    this.latestExecuteId = executeId
    this.postMessage(executeMessage)
    return await new Promise<any>((resolve, reject) => {
      let isComplete = false
      const messageEventName = this.getExecuteEventName(executeId)
      const clearMessage = () => {
        // clearTimeout(timeoutId) //没必要清除
        this.messageEventMap.delete(messageEventName)
        if (!isComplete) {
          reject(new Error(`worker run time out[${this.recycleTime}]`))
        }
      }
      const timeoutId = setTimeout(clearMessage, this.recycleTime)
      const workerStream = new VaasWorkerStream()
      this.messageEventMap.set(messageEventName, {
        // 不建议info过大，对性能造成影响
        info: {
          type,
          appName,
          serveName,
          executeId
        },
        callback: (message: WorkerMessage) => {
          isComplete = true
          if (message.type === 'result') {
            isComplete = message.data.result.isComplete
          }
          if (isComplete) {
            clearMessage()
            // 这里是为了性能优化，防止无效setTimeout积压
            clearTimeout(timeoutId)
          }
          if (message.type === 'result') {
            // 兼容低版本node的buffer未转化问题
            if (message.data.result.data instanceof Uint8Array) {
              message.data.result.data = Buffer.from(message.data.result.data)
            }

            if (message.data.result.isStream) {
              if (message.data.result.data.chunk instanceof Uint8Array) {
                message.data.result.data.chunk = Buffer.from(message.data.result.data.chunk)
              }
              if (isComplete) {
                workerStream.writeComplete()
              } else {
                workerStream.write(message.data.result.data.chunk)
              }
              message.data.result.stream = workerStream
            }
            resolve(message.data.result); return
          }
          if (message.type === 'error') {
            reject(convertErrorConfig2Error({ errorConfig: message.data.error }))
          }
        }
      })
    })
  }

  recyclable () {
    return this.isExit || (this.updateAt + this.recycleTime < Date.now())
  }
}

export class VaasWorkerSet extends Set<VaasWorker> {
  private workerIterator: IterableIterator<VaasWorker>
  maxSize: number = 0
  constructor (iterable: Iterable<VaasWorker>, maxSize: number) {
    super(iterable)
    this.maxSize = maxSize
  }

  next () {
    if (!this.workerIterator) { this.workerIterator = this.values() }
    const nextValue = this.workerIterator.next()
    if (nextValue.done) {
      this.workerIterator = this.values()
      return this.workerIterator.next().value
    }
    return nextValue.value
  }
}

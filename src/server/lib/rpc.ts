import { v4 as uuidv4 } from 'uuid'
import { parentPort } from 'worker_threads'
import { convertError2ErrorConfig } from './error'
import { type ErrorMessage, type ResultMessage, type WorkerMessage, WorkerMessageType } from '../../types/server'

export function workerPostMessage (
  value: WorkerMessage
) {
  if (value.type === 'error' && value.data?.error?.message) {
    value.data.error = convertError2ErrorConfig({
      error: value.data.error
    })
  }
  try {
    parentPort.postMessage(value)
  } catch (error) {
    const errorMessage: ErrorMessage = {
      type: WorkerMessageType.error,
      data: {
        type: value.type !== WorkerMessageType.init ? value.data.type : 'http',
        error: convertError2ErrorConfig({
          error
        })
      }
    }
    parentPort.postMessage(errorMessage)
  }
}

export function getRpcEventName (eventName: string): string {
  return `rpc-${eventName}`
}

export const rpcEventMap = new Map<string, (message: WorkerMessage) => void>()

export async function rpcInvote<P=any, R=any, C extends object=any> (appServerName: string, params: P, context?: C): Promise<R> {
  const appServerNameData = /^(\w+)\.(\w+)$/.exec(appServerName)
  if (!appServerNameData) {
    throw new Error('rpc调用必须按照app.function名方式填写，app和function名称只支持数字字母下划线')
  }
  const appName = appServerNameData[1]
  const serveName = appServerNameData[2]
  const executeId = uuidv4()
  workerPostMessage({
    type: WorkerMessageType.execute,
    data: {
      appName,
      serveName,
      executeId,
      type: 'rpc',
      params: { params, context: context || {} }
    }
  })
  return await new Promise((resolve, reject) => {
    rpcEventMap.set(getRpcEventName(executeId), (message: ResultMessage | ErrorMessage) => {
      if (message.type === 'result') {
        resolve(message.data.result.data); return
      }
      if (message.type === 'error') {
        reject(message.data.error)
      }
    })
  })
}

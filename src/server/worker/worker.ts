import { dynamicRun, proxyData } from 'vaas-core'
import { parentPort, workerData } from 'worker_threads'
import { Readable, Writable, pipeline } from 'stream'
import { match as pathMatch } from 'path-to-regexp'

import { getAppEntryPath } from '../lib/util'
import { getVaasServerMap } from '../lib/decorator'
import { workerPostMessage, rpcEventMap, getRpcEventName } from '../lib/rpc'
import {
  type WorkerMessage, type ExecuteMessageBody, type ServerType,
  type ServerValue, type ServerRouterValue, WorkerMessageType
} from '../../types/server'
import { deprecate } from 'util'

const packageInfo = require('../../../package.json')

const pipelinePromise = async (source: any, destination: NodeJS.WritableStream) => {
  return await new Promise((resolve, reject) => {
    const writableStream = pipeline(source, destination, (error) => {
      if (error) { reject(error); return }
      resolve(writableStream)
    })
  })
}

const getWorkerRouteMap = (prefix, appConfig: Map<string, ServerValue>) => {
  let routePrefix = prefix
  if (!prefix || prefix === '/') {
    routePrefix = ''
  }
  if (getWorkerRouteMap.appRouteMap.has(routePrefix)) {
    return getWorkerRouteMap.appRouteMap.get(routePrefix)
  }
  const workerRouteMap = new Map<string, ServerRouterValue>()
  for (const [serveName, serveConfig] of appConfig) {
    workerRouteMap.set(serveName, {
      type: serveConfig.type,
      method: serveConfig.method,
      routerName: serveConfig.routerName,
      routerFn: pathMatch(`${routePrefix}${serveConfig.routerName || `/${serveName}`}`)
    })
  }
  getWorkerRouteMap.appRouteMap.set(routePrefix, workerRouteMap)
  return workerRouteMap
}
getWorkerRouteMap.appRouteMap = new Map<string, Map<string, ServerRouterValue>>()

const workerRouteMatch = ({ path, method }, workerRouteMap: Map<string, ServerRouterValue>) => {
  const lowerCaseMethod = method.toLowerCase()
  for (const [serveName, serveConfig] of workerRouteMap) {
    if (serveConfig.method && serveConfig.method !== lowerCaseMethod) {
      continue
    }
    const matchResult = serveConfig.routerFn(path)
    if (matchResult) {
      return {
        serveName,
        params: matchResult.params
      }
    }
  }
  return null
}

let lastExecuteType: ServerType = null
export class VaasWorker {
  postExecuteMessage ({ executeMessage, data, isComplete, isStream }: { executeMessage: ExecuteMessageBody, data: any, isComplete: boolean, isStream: boolean }) {
    if (executeMessage.type === 'http') {
      workerPostMessage(
        {
          type: WorkerMessageType.result,
          data: {
            result: {
              isComplete,
              isStream,
              outRequestConfig: executeMessage.params.req,
              outResponseConfig: executeMessage.params.res,
              data
            },
            type: executeMessage.type,
            executeId: executeMessage.executeId
          }
        }
      )
    } else {
      workerPostMessage(
        {
          type: WorkerMessageType.result,
          data: {
            result: {
              isComplete,
              isStream,
              data
            },
            type: executeMessage.type,
            executeId: executeMessage.executeId
          }
        }
      )
    }
  }

  async run () {
    const appClass = await this.loadServer()
    const app = new appClass()
    const appConfig = getVaasServerMap(app)
    parentPort.on('message', async (message: WorkerMessage) => {
      if (message.type === 'result' || message.type === 'error') {
        const callback = rpcEventMap.get(getRpcEventName(message.data.executeId))
        if (callback instanceof Function) {
          callback(message); return
        }
      }
      if (message.type !== 'execute') { return }
      const executeMessage: ExecuteMessageBody = message.data
      lastExecuteType = executeMessage.type
      if (executeMessage.type !== 'rpc') {
        const workerRouteMap = getWorkerRouteMap(executeMessage.params?.prefix, appConfig)
        const workerRouteMatchRes = workerRouteMatch({ path: executeMessage.params.req.path, method: executeMessage.params.req.method }, workerRouteMap)
        if (!workerRouteMatchRes) {
          throw new Error(`this App(${executeMessage.appName}) not path has matched (${executeMessage.params.req.method})[${executeMessage.params.req.path}]`)
        }
        executeMessage.params.req.params = workerRouteMatchRes.params
        executeMessage.serveName = workerRouteMatchRes.serveName
      }
      try {
        if (!executeMessage.serveName) {
          throw new Error(`this App(${executeMessage.appName}) not path has matched serveName`)
        }
        const serveConfig = appConfig.get(executeMessage.serveName)
        if (executeMessage.type !== serveConfig.type) {
          throw new Error(`appName[${executeMessage.appName}]'s serveName[${
            executeMessage.serveName
          }] not matched type[${executeMessage.type}]`)
        }
        const data = await app[executeMessage.serveName](executeMessage.params)
        if (data instanceof Readable) {
          const ws = new Writable({
            write: (chunk, encoding, callback) => {
              this.postExecuteMessage({ executeMessage, data: { chunk, encoding }, isComplete: false, isStream: true })
              callback()
            }
          })
          await pipelinePromise(data, ws)
          this.postExecuteMessage({ executeMessage, data: { chunk: null, encoding: '' }, isComplete: true, isStream: true })
        } else {
          this.postExecuteMessage({ executeMessage, data, isComplete: true, isStream: false })
        }
      } catch (error) {
        workerPostMessage(
          {
            type: WorkerMessageType.error,
            data: {
              type: executeMessage.type,
              error,
              executeId: executeMessage.executeId
            }
          }
        )
      }
    })
    workerPostMessage({
      type: WorkerMessageType.init,
      data: {
        status: 'ok'
      }
    })
  }

  async loadServer (): Promise<any> {
    const { appName, appDirPath } = workerData
    // 关于文件的存在性，在初始化线程前判断，节约线程开支
    const appProgram = dynamicRun({
      filepath: await getAppEntryPath({ appName, appDirPath }),
      extendVer: {
        process: proxyData(process),
        Buffer: proxyData(Buffer),
        global: proxyData(global),
        setTimeout: proxyData(setTimeout),
        clearTimeout: proxyData(clearTimeout),
        setInterval: proxyData(setInterval),
        clearInterval: proxyData(clearInterval),
        setImmediate: proxyData(setImmediate),
        clearImmediate: proxyData(clearImmediate)
      },
      overwriteRequire: (callbackData) => {
        const useVmLoadDependencies = workerData.useVmLoadDependencies
        if (!useVmLoadDependencies && callbackData.moduleId[0] !== '.' && callbackData.moduleId[0] !== '/') {
          return callbackData.nativeRequire(callbackData.moduleId)
        }
        if (packageInfo.name === callbackData.moduleId) {
          return callbackData.nativeRequire(callbackData.moduleId)
        }
        if (callbackData.modulePath[0] === '/') {
          // node_module和相对路径处理方法，这样引用不会丢失类型判断
          if (!callbackData.modulePath.includes(workerData.appDirPath)) {
            throw new Error(`file[${
                            callbackData.filepath
                        }] can't require module[${
                            callbackData.modulePath
                        }] beyond appDirPath[${
                            workerData.appDirPath
                        }], use ${packageInfo.name}.rpcInvote('app.server',{...}) to call server,please`)
          }
          if (!(/\.js$/.exec(callbackData.modulePath))) {
            if (/\.node$/.exec(callbackData.modulePath)) {
              deprecate(() => {}, `c++ extension method will be deprecated! [${callbackData.modulePath}]`)()
            }
            return callbackData.nativeRequire(callbackData.modulePath)
          }
        } else {
          // 系统模块处理方法
          const allowModuleSet: Set<string> = workerData.allowModuleSet
          if (allowModuleSet.has('*')) { return callbackData.nativeRequire(callbackData.modulePath) }
          if (allowModuleSet.has(callbackData.modulePath)) { return callbackData.nativeRequire(callbackData.modulePath) }
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

new VaasWorker().run().catch((error) => {
  workerPostMessage(
    {
      type: WorkerMessageType.error,
      data: {
        type: lastExecuteType,
        error
      }
    }
  )
})

process.on('uncaughtException', (error) => {
  workerPostMessage(
    {
      type: WorkerMessageType.error,
      data: {
        type: lastExecuteType,
        error
      }
    }
  )
})

process.on('unhandledRejection', (error) => {
  workerPostMessage(
    {
      type: WorkerMessageType.error,
      data: {
        type: lastExecuteType,
        error
      }
    }
  )
})

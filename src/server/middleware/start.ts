import { v4 as uuidv4 } from 'uuid'
import { type Server as HttpServer, ServerResponse } from 'http'
import type * as Koa from 'koa'
import { WebSocketServer } from 'ws'

import { type VaasWorkPool } from '../worker/pool'
import { type GetAppNameByRequest, type GetByPassFlowVersion } from '../../types/server'
import { Request } from '../lib/request'
import { Response } from '../lib/response'
import { type VaasWorkerStream } from '../worker/workerStream'

async function getServerWorker ({
  ctx,
  vaasWorkPool,
  getAppNameByRequest,
  getByPassFlowVersion
}: {
  ctx: Koa.Context
  vaasWorkPool: VaasWorkPool
  getAppNameByRequest: GetAppNameByRequest
  getByPassFlowVersion: GetByPassFlowVersion
}) {
  let { appName, prefix } = await getAppNameByRequest(ctx.request)
  // 如果未指定App则使用默认path方法指定App
  if (!appName) {
    appName = ctx.path.split('/')[1]
    prefix = `/${appName}`
  }
  const { version } = await getByPassFlowVersion(appName)
  ctx.appName = appName
  ctx.version = version
  const vaasWorker = await vaasWorkPool.getWokerByAppName({
    appName,
    version
  })
  await vaasWorker.routerMiddleware(ctx)
  const nowPrefix = `/${ctx.params.prefix || ''}`
  if (prefix !== nowPrefix) {
    throw new Error(`this App(${ctx.appName})'s prefix(${prefix}) not matched now prefix(${nowPrefix})`)
  }
  return vaasWorker
}

export function webSocketStart ({
  app,
  server,
  vaasWorkPool,
  getAppNameByRequest,
  getByPassFlowVersion
}: {
  app: Koa
  server: HttpServer
  vaasWorkPool: VaasWorkPool
  getAppNameByRequest: GetAppNameByRequest
  getByPassFlowVersion: GetByPassFlowVersion
}) {
  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', async (request, socket, head) => {
    const ctx = app.createContext(request, new ServerResponse(request))
    try {
      const vaasWorker = await getServerWorker({
        ctx,
        vaasWorkPool,
        getAppNameByRequest,
        getByPassFlowVersion
      })
      if (!ctx.serveName) {
        throw new Error(`this App(${ctx.appName}) not path has matched[${ctx.path}]`)
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        async function webSocketMessage (wsRequestData, isBin) {
          let res: any
          let isResStream: boolean
          let resStream: VaasWorkerStream
          try {
            const { data, isStream, stream } = await vaasWorker.execute({
              appName: ctx.appName,
              serveName: ctx.serveName,
              executeId: uuidv4(),
              type: ctx.serveValue.type,
              params: isBin ? wsRequestData : wsRequestData.toString()
            })
            res = data
            isResStream = isStream
            resStream = stream
          } catch (error) {
            res = {
              message: error.message,
              stack: error.stack
            }
          }
          if (isResStream) {
            resStream.addWriteCallBack((chunk) => {
              ws.send(chunk)
            })
            await resStream.waitWriteComplete()
          } else {
            if (res instanceof Uint8Array || typeof res === 'string') {
              ws.send(res)
            } else {
              ws.send(JSON.stringify(res))
            }
          }
        }
        ws.on('message', webSocketMessage)
        ws.once('close', () => {
          ws.removeListener('message', webSocketMessage)
        })
      })
    } catch (error) {
      socket.destroy()
      throw error
    }
  })
}

export function httpStart ({
  vaasWorkPool,
  getAppNameByRequest,
  getByPassFlowVersion
}: {
  vaasWorkPool: VaasWorkPool
  getAppNameByRequest: GetAppNameByRequest
  getByPassFlowVersion: GetByPassFlowVersion
}) {
  return async function (ctx: Koa.Context) {
    const vaasWorker = await getServerWorker({
      ctx,
      vaasWorkPool,
      getAppNameByRequest,
      getByPassFlowVersion
    })
    if (!ctx.serveName) {
      throw new Error(`this App(${ctx.appName}) not path has matched[${ctx.path}]`)
    }
    ctx.requestConfig = Request.getRequestConfigByRequest(ctx.request)
    ctx.requestConfig.params = ctx.params
    ctx.responseConfig = Response.getResponseConfigByResponse(ctx.response)
    const { outRequestConfig, outResponseConfig, data, isStream, stream } = await vaasWorker.execute({
      appName: ctx.appName,
      serveName: ctx.serveName,
      executeId: uuidv4(),
      type: ctx.serveValue.type,
      params: {
        req: ctx.requestConfig,
        res: ctx.responseConfig
      }

    })
    ctx.requestConfig = outRequestConfig
    ctx.responseConfig = outResponseConfig
    Request.mergeRequestConfig2Request({ request: ctx.request, requestConfig: outRequestConfig })
    Response.mergeResponseConfig2Response({ response: ctx.response, responseConfig: outResponseConfig })

    if (isStream) {
      stream.addWriteCallBack((chunk) => {
        ctx.res.write(chunk)
      })
      await stream.waitWriteComplete()
      ctx.res.end()
    } else {
      return ctx.body = data
    }
  }
}

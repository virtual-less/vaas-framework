import * as Router from 'koa-router'
import type * as Koa from 'koa'

import { getVaasServerMap } from '../lib/decorator'

const loadRouter = async ({ prefix, appList, routerFunction }: { prefix: string, routerFunction: ({ serveConfig, appRouter, appName, serveName, appInstance }) => void, appList: Array<{ appName: string, appInstance: any }> }) => {
  const router = prefix ? new Router({ prefix }) : new Router()
  for (const appInfo of appList) {
    const { appName, appInstance } = appInfo
    const vaasServerMap = getVaasServerMap(appInstance)
    const appRouter = new Router()
    for (const [serveName, serveConfig] of vaasServerMap) {
      if (['http', 'websocket'].includes(serveConfig.type)) {
        routerFunction({ serveConfig, appRouter, appName, serveName, appInstance })
      } else {
        throw new Error(`[${appName}][${serveName}]使用的是简易框架，不支持${serveConfig.type}类型`)
      }
    }
    router.use(`/${appName}`, appRouter.routes(), appRouter.allowedMethods())
  }
  return router
}

export const loadHttpRouter = async ({ app, prefix, appList }: { app: Koa, prefix: string, appList: Array<{ appName: string, appInstance: any }> }) => {
  const router = await loadRouter({
    prefix,
    appList,
    routerFunction: ({ serveConfig, appRouter, serveName, appInstance }) => {
      if (serveConfig.type === 'http') {
        const method = serveConfig.method ? serveConfig.method : 'all'
        const routerName = serveConfig.routerName ? serveConfig.routerName : `/${serveName}`
        appRouter[method](routerName, async (ctx) => {
          ctx.body = await appInstance[serveName]({ req: ctx.request, res: ctx.response })
        })
      }
    }
  })
  const routes = router.routes()
  app.use(routes).use(router.allowedMethods())
}

export const loadWebsocketRouter = async ({ prefix, appList }: { prefix: string, appList: Array<{ appName: string, appInstance: any }> }) => {
  const router = await loadRouter({
    prefix,
    appList,
    routerFunction: ({ serveConfig, appRouter, serveName, appInstance }) => {
      if (serveConfig.type === 'websocket') {
        const method = serveConfig.method ? serveConfig.method : 'all'
        const routerName = serveConfig.routerName ? serveConfig.routerName : `/${serveName}`
        appRouter[method](routerName, async (ctx) => {
          const data = await appInstance[serveName]({ req: ctx.request, data: ctx._websocketData })
          ctx._websocketSend(data)
        })
      }
    }
  })
  const routes = router.routes()
  return routes
}

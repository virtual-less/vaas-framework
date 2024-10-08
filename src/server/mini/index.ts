import * as Koa from 'koa'
import { type Server as HttpServer } from 'http'
import * as KoaBodyparser from 'koa-bodyparser'

import { outputCatch } from '../middleware/outputCatch'
import { serverEOL } from '../lib/util'
import { loadHttpRouter } from './router'
import { loadApp } from './app'
import { loadWebsocket } from './websocket'

/**
 * miniVaasServer只有单进程单线程
 * 并且无VM直接运行在宿主环境中
 * 去除限制和配置获取,同时增加中间件的支持
 * 可以仅作为框架使用
 */
export class MiniVaasServer {
  server: HttpServer
  async run ({
    appsDir, port,
    showErrorStack,
    prefix,
    middlewares
  }: {
    appsDir: string, port: number
    showErrorStack: boolean
    prefix: string
    middlewares: Koa.Middleware[]
  }): Promise<Koa> {
    const app = new Koa()
    app.use(outputCatch({ showErrorStack }))
    app.use(KoaBodyparser({
      formLimit: '30mb',
      jsonLimit: '30mb',
      textLimit: '30mb',
      xmlLimit: '30mb'
    }))
    for (const middleware of middlewares) {
      app.use(middleware)
    }
    const appList = await loadApp({ appsDir })
    await loadHttpRouter({ app, prefix, appList })
    return await new Promise((resolve) => {
      this.server = app.listen(port, () => {
        loadWebsocket({ app, prefix, appList, server: this.server })
        serverEOL({ port })
        resolve(app)
      })
    })
  }

  async close (): Promise<boolean> {
    return await new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error)reject(error)
        resolve(true)
      })
    })
  }
}

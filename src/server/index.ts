import * as Koa from 'koa'
import { type Server as HttpServer } from 'http'

import * as KoaBodyparser from 'koa-bodyparser'
import { outputCatch } from './middleware/outputCatch'
import { httpStart, webSocketStart } from './middleware/start'
import { VaasWorkPool } from './worker/pool'
import { type VaasConfig } from '../types/server'

export class VaasServer {
  server: HttpServer
  async run ({
    appsDir, port,
    getAppNameByRequest,
    getAppConfigByAppName,
    getByPassFlowVersion,
    showErrorStack,
    isPrepareWorker
  }: VaasConfig): Promise<Koa> {
    const vaasWorkPool = new VaasWorkPool({
      appsDir,
      getAppConfigByAppName,
      getByPassFlowVersion
    })
    if (isPrepareWorker) {
      await vaasWorkPool.prepareWorker()
    }
    const app = new Koa()
    app.use(outputCatch({ showErrorStack }))
    app.use(KoaBodyparser({
      formLimit: '30mb',
      jsonLimit: '30mb',
      textLimit: '30mb',
      xmlLimit: '30mb'
    }))
    app.use(httpStart({
      vaasWorkPool,
      getAppNameByRequest,
      getByPassFlowVersion
    }))
    return await new Promise((resolve) => {
      this.server = app.listen(port, () => {
        webSocketStart({
          app,
          server: this.server,
          vaasWorkPool,
          getAppNameByRequest,
          getByPassFlowVersion
        })
        return resolve(app)
      })
    })
  }

  async close (): Promise<boolean> {
    return await new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error)reject(error)
        return resolve(true)
      })
    })
  }
}

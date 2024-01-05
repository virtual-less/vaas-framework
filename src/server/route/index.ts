import * as Router from 'koa-router'
import { type Context } from 'koa'
import {
  type ServerValue
} from '../../types/server'

export class Route {
  router: Router
  constructor ({ appServerConfigMap }: { appServerConfigMap: Map<string, ServerValue> }) {
    const typeList = ['http', 'websocket']
    const workerRouter = new Router()
    for (const [serveName, serveValue] of appServerConfigMap) {
      if (!typeList.includes(serveValue.type)) {
        continue
      }
      const middleware = async (ctx: Context) => {
        ctx.serveName = serveName
        ctx.serveValue = serveValue
      }
      const method = serveValue.method || 'all'
      const routerName = serveValue.routerName || `/${serveName}`
      workerRouter[method](routerName, middleware)
    }
    this.router = new Router()
    this.router.use('/:prefix*', workerRouter.routes(), workerRouter.allowedMethods())
  }

  getRouterMiddleware (): (ctx: Context) => Promise<void> {
    // @ts-expect-error
    return this.router.routes()
  }
}

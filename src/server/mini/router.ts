import { promises as fsPromises } from 'fs'
import * as Koa from 'koa'
import * as path from 'path'
import * as Router from 'koa-router'

import { getAppEntryPath } from '../lib/util'
import { getVaasServerMap } from '../lib/decorator'

export const loadRouter = async ({ app, prefix, appsDir}:{app:Koa,prefix:string,appsDir:string})=>{
    const appsDirList = await fsPromises.readdir(appsDir)
    const router = prefix?new Router({prefix}):new Router()
    for(const appName of appsDirList) {
        if(['.','..'].includes(appName)){continue}
        const appDirPath = path.join(appsDir, appName)
        const appEntryPath = await getAppEntryPath({appName, appDirPath})
        const appClass = require(appEntryPath).default
        const appInstance = new appClass()
        const vaasServerMap = getVaasServerMap(appInstance)
        const appRouter = new Router()
        for (const [serveName, serveConfig] of vaasServerMap) {
            if(serveConfig.type!=='http') {
                throw new Error(`[${appName}][${serveName}]使用的是简易框架，仅支持http类型`)
            }
            const method = serveConfig.method?serveConfig.method:'all';
            const routerName = serveConfig.routerName?serveConfig.routerName:`/${serveName}`
            appRouter[method](routerName, async (ctx)=>{
                ctx.body = await appInstance[serveName]({req: ctx.request, res: ctx.response})
            })
        }
        router.use(`/${appName}`, appRouter.routes(), appRouter.allowedMethods());
    }
    return app.use(router.routes()).use(router.allowedMethods());
}

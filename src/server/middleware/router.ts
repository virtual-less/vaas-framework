import { Context } from 'koa';
import { match as getMatchUrlFunc } from 'path-to-regexp';
import { v4 as uuidv4 } from 'uuid'


import {VaasWorkPool} from '../worker/pool'
import {GetAppNameByHost, GetAppConfigByAppName} from '../../types/server'
import { Request } from '../lib/request'
import { Response } from '../lib/response'

export function generateRouter({
    appsDir,vaasWorkPool,
    getAppNameByHost,
    getAppConfigByAppName
}:{
    appsDir:string, vaasWorkPool:VaasWorkPool,
    getAppNameByHost:GetAppNameByHost,
    getAppConfigByAppName:GetAppConfigByAppName
}) {
    
    return async function (ctx:Context) {
        let appName = getAppNameByHost(ctx.hostname)
        if(!appName) {
            const matchApp = ctx.path.match(/^\/(\w+)(\/\w+)?$/)
            if(!matchApp) {throw new Error(`不支持该路径(${ctx.path})传入`)}
            appName = matchApp[1]
        }
        const appConfig = getAppConfigByAppName(appName)
        const vaasWorker = await vaasWorkPool.getWokerByAppName({
            appsDir,appName,
            maxWorkerNum:appConfig.maxWorkerNum, 
            allowModuleSet:appConfig.allowModuleSet,
            recycleTime:appConfig.timeout
        })
        for (const [serveName,serveValue] of vaasWorker.appServerConfigMap) {
            const httpType = 'http';
            if([httpType].indexOf(serveValue.type)===-1) {
                continue
            }
            let routerString = `/${appName}`
            if(serveValue.routerName) {
                routerString+=serveValue.routerName
            } else {
                routerString+=`/${serveName}`
            }
            const matchPath = getMatchUrlFunc(routerString)
            const matchPathRes = matchPath(ctx.path)
            if(matchPathRes) {
                const rightMethod = (!serveValue.method) || (ctx.method.toLowerCase() === serveValue.method.toLowerCase())
                if(rightMethod) {
                    const intoRequestConfig = Request.getRequestConfigByRequest(ctx.request)
                    const intoResponseConfig = Response.getResponseConfigByResponse(ctx.response)
                    const {outRequestConfig, outResponseConfig, data} = await vaasWorker.execute({
                        serveName,
                        executeId:uuidv4(),
                        type:httpType,
                        params:{
                            req:intoRequestConfig, 
                            res:intoResponseConfig
                        }
                        
                    })
                    Request.mergeRequestConfig2Request({request: ctx.request, requestConfig: outRequestConfig})
                    Response.mergeResponseConfig2Response({response: ctx.response, responseConfig: outResponseConfig})
                    return ctx.body = data
                }
            }
        }
        throw new Error(`this App(${appName}) not path has matched[${ctx.path}]`)
    }
}
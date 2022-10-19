import { Context } from 'koa';
import { match as getMatchUrlFunc } from 'path-to-regexp';
import { v4 as uuidv4 } from 'uuid'


import {VaasWorkPool} from '../worker/pool'
import {GetAppNameByRequest} from '../../types/server'
import { Request } from '../lib/request'
import { Response } from '../lib/response'

export function generateRouter({
    vaasWorkPool,
    getAppNameByRequest,
}:{
    vaasWorkPool:VaasWorkPool,
    getAppNameByRequest:GetAppNameByRequest,
}) {
    
    return async function (ctx:Context) {
        let urlPath = ctx.path
        let appName = await getAppNameByRequest(ctx.request)
        if(!appName) {
            const matchApp = urlPath.match(/^\/((\w+)\/\w+|(\w+)\/?$)/)
            if(!matchApp) {throw new Error(`不支持该路径(${urlPath})传入`)}
            appName = matchApp[2] || matchApp[3]
        } else {
            urlPath=urlPath[0]==='/'?`/${appName}${urlPath}`:`/${appName}/${urlPath}`
        }
        
        const vaasWorker = await vaasWorkPool.getWokerByAppName({
            appName,
        })
        for (const [serveName,serveValue] of vaasWorker.appServerConfigMap) {
            const httpType = 'http';
            if([httpType].indexOf(serveValue.type)===-1) {
                continue
            }
            let matchPathRes;
            if(serveValue.routerName instanceof RegExp) {
                matchPathRes = serveValue.routerName.exec(urlPath.replace(`/${appName}`,''))
            } else {
                let routerString = `/${appName}`
                if(serveValue.routerName) {
                    routerString+=serveValue.routerName
                } else {
                    routerString+=`/${serveName}`
                }
                const matchPath = getMatchUrlFunc(routerString)
                matchPathRes = matchPath(urlPath)
            }
            if(matchPathRes) {
                ctx.request
                const rightMethod = (!serveValue.method) || (ctx.method.toLowerCase() === serveValue.method.toLowerCase())
                if(rightMethod) {
                    // @ts-ignore 
                    const params:NodeJS.Dict<string | string[]> = matchPathRes.params || {}
                    const intoRequestConfig = Request.getRequestConfigByRequest(ctx.request)
                    intoRequestConfig.params = params
                    const intoResponseConfig = Response.getResponseConfigByResponse(ctx.response)
                    const {outRequestConfig, outResponseConfig, data} = await vaasWorker.execute({
                        appName,
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
        throw new Error(`this App(${appName}) not path has matched[${urlPath}]`)
    }
}
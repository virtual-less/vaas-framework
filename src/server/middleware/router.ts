import { Context } from 'koa';
import { match as getMatchUrlFunc } from 'path-to-regexp';
import { v4 as uuidv4 } from 'uuid'
import {Server as HttpServer, ServerResponse} from 'http'
import * as Koa from 'koa';
import { WebSocketServer } from 'ws';


import {VaasWorkPool} from '../worker/pool'
import {GetAppNameByRequest, ServerType} from '../../types/server'
import { Request } from '../lib/request'
import { Response } from '../lib/response'



async function getServerWorker({
    ctx,
    vaasWorkPool,
    getAppNameByRequest,
    typeList
}:{
    ctx:Context
    vaasWorkPool:VaasWorkPool,
    getAppNameByRequest:GetAppNameByRequest,
    typeList:Array<ServerType>
}) {
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
        if(!typeList.includes(serveValue.type)) {
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
                return {
                    appName,
                    serveName,
                    serveValue,
                    vaasWorker,
                    matchPathRes
                }
            }
        }
    }
    throw new Error(`this App(${appName}) not path has matched[${urlPath}]`)
}

export function webSocketStart({
    app,
    server,
    vaasWorkPool,
    getAppNameByRequest,
}:{
    app:Koa,
    server:HttpServer,
    vaasWorkPool:VaasWorkPool,
    getAppNameByRequest:GetAppNameByRequest,
}) {
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', async (request, socket, head) => {
        const ctx = app.createContext(request, new ServerResponse(request))
        try {
            const {
                appName,
                serveName,
                serveValue,
                vaasWorker
            } = await getServerWorker({
                ctx,
                vaasWorkPool,
                getAppNameByRequest,
                typeList:['websocket']
            })
            wss.handleUpgrade(request, socket, head, (ws) => {
                async function webSocketMessage (wsRequestData, isBin) {
                    let res:any;
                    try {
                        const {data} = await vaasWorker.execute({
                            appName,
                            serveName,
                            executeId:uuidv4(),
                            type:serveValue.type,
                            params:isBin?wsRequestData:wsRequestData.toString()
                        })
                        res = data
                    } catch(error) {
                        res = {
                            message:error.message,
                            stack:error.stack
                        };
                    }
                    if(res instanceof Uint8Array || typeof res ==='string') {
                        ws.send(res);
                    } else {
                        ws.send(JSON.stringify(res));
                    }
                }
                ws.on('message', webSocketMessage);
                ws.once('close',()=>{
                    ws.removeListener('message', webSocketMessage);
                })
            });
            
        } catch(error) {
            socket.destroy();
            throw error
        }
    });
}


export function generateRouter({
    vaasWorkPool,
    getAppNameByRequest,
}:{
    vaasWorkPool:VaasWorkPool,
    getAppNameByRequest:GetAppNameByRequest,
}) {
    
    return async function (ctx:Context) {
        const {
            appName,
            serveName,
            serveValue,
            vaasWorker,
            matchPathRes
        } = await getServerWorker({
            ctx,
            vaasWorkPool,
            getAppNameByRequest,
            typeList:['http']
        })
        // @ts-ignore 
        const params:NodeJS.Dict<string | string[]> = matchPathRes.params || {}
        const intoRequestConfig = Request.getRequestConfigByRequest(ctx.request)
        intoRequestConfig.params = params
        const intoResponseConfig = Response.getResponseConfigByResponse(ctx.response)
        const {outRequestConfig, outResponseConfig, data} = await vaasWorker.execute({
            appName,
            serveName,
            executeId:uuidv4(),
            type:serveValue.type,
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
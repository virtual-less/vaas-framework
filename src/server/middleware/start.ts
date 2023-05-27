import { v4 as uuidv4 } from 'uuid'
import {Server as HttpServer, ServerResponse} from 'http'
import * as Koa from 'koa';
import { WebSocketServer } from 'ws';


import {VaasWorkPool} from '../worker/pool'
import {GetAppNameByRequest, GetByPassFlowVersion} from '../../types/server'
import { Request } from '../lib/request'
import { Response } from '../lib/response'
import { VaasWorkerStream } from '../worker/workerStream';



async function getServerWorker({
    ctx,
    vaasWorkPool,
    getAppNameByRequest,
    getByPassFlowVersion
}:{
    ctx:Koa.Context
    vaasWorkPool:VaasWorkPool,
    getAppNameByRequest:GetAppNameByRequest,
    getByPassFlowVersion:GetByPassFlowVersion,
}) {
    let urlPath = ctx.path
    let appName = await getAppNameByRequest(ctx.request)
    let isRootRoute = true;
    if(!appName) {
        const matchApp = urlPath.match(/^\/((\w+)\/\w+|(\w+)\/?$)/)
        if(!matchApp) {throw new Error(`不支持该路径(${urlPath})传入`)}
        appName = matchApp[2] || matchApp[3]
        isRootRoute = false
    }
    const version = await getByPassFlowVersion(appName)
    ctx.appName = appName
    ctx.version = version
    const vaasWorker = await vaasWorkPool.getWokerByAppName({
        appName,
        version
    })
    // 这里的操作只是赋值ctx，所以不需要真的next
    const next = ()=>{}
    if(isRootRoute) {
        // @ts-ignore 
        await vaasWorker.rootRoutes(ctx, next)
    } else {
        // @ts-ignore 
        await vaasWorker.routes(ctx, next)
    }
    return vaasWorker
}

export function webSocketStart({
    app,
    server,
    vaasWorkPool,
    getAppNameByRequest,
    getByPassFlowVersion
}:{
    app:Koa,
    server:HttpServer,
    vaasWorkPool:VaasWorkPool,
    getAppNameByRequest:GetAppNameByRequest,
    getByPassFlowVersion:GetByPassFlowVersion,
}) {
    const wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', async (request, socket, head) => {
        const ctx = app.createContext(request, new ServerResponse(request))
        try {
            const vaasWorker = await getServerWorker({
                ctx,
                vaasWorkPool,
                getAppNameByRequest,
                getByPassFlowVersion
            })
            if(!ctx.serveName) {
                throw new Error(`this App(${ctx.appName}) not path has matched[${ctx.path}]`)
            }
            wss.handleUpgrade(request, socket, head, (ws) => {
                async function webSocketMessage (wsRequestData, isBin) {
                    let res:any;
                    let isResStream:boolean;
                    let resStream:VaasWorkerStream;
                    try {
                        const { data, isStream, stream } = await vaasWorker.execute({
                            appName:ctx.appName,
                            serveName:ctx.serveName,
                            executeId:uuidv4(),
                            type:ctx.serveValue.type,
                            params:isBin?wsRequestData:wsRequestData.toString()
                        })
                        res = data
                        isResStream = isStream;
                        resStream = stream;
                    } catch(error) {
                        res = {
                            message:error.message,
                            stack:error.stack
                        };
                    }
                    if(isResStream) {
                        resStream.addWriteCallBack((chunk)=>{
                            ws.send(chunk)
                        })
                        await resStream.waitWriteComplete()
                    } else {
                        if(res instanceof Uint8Array || typeof res ==='string') {
                            ws.send(res);
                        } else {
                            ws.send(JSON.stringify(res));
                        }
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


export function httpStart({
    vaasWorkPool,
    getAppNameByRequest,
    getByPassFlowVersion
}:{
    vaasWorkPool:VaasWorkPool,
    getAppNameByRequest:GetAppNameByRequest,
    getByPassFlowVersion:GetByPassFlowVersion,
}) {
    
    return async function (ctx:Koa.Context) {
        const vaasWorker = await getServerWorker({
            ctx,
            vaasWorkPool,
            getAppNameByRequest,
            getByPassFlowVersion
        })
        if(!ctx.serveName) {
            throw new Error(`this App(${ctx.appName}) not path has matched[${ctx.path}]`)
        }
        const intoRequestConfig = Request.getRequestConfigByRequest(ctx.request)
        intoRequestConfig.params = ctx.params
        const intoResponseConfig = Response.getResponseConfigByResponse(ctx.response)
        const {outRequestConfig, outResponseConfig, data, isStream, stream} = await vaasWorker.execute({
            appName:ctx.appName,
            serveName:ctx.serveName,
            executeId:uuidv4(),
            type:ctx.serveValue.type,
            params:{
                req:intoRequestConfig, 
                res:intoResponseConfig
            }
            
        })
        Request.mergeRequestConfig2Request({request: ctx.request, requestConfig: outRequestConfig})
        Response.mergeResponseConfig2Response({response: ctx.response, responseConfig: outResponseConfig})
        
        if(isStream) {
            stream.addWriteCallBack((chunk)=>{
                ctx.res.write(chunk)
            })
            await stream.waitWriteComplete()
            ctx.res.end()
        } else {
            return ctx.body = data
        }
        
    }
}
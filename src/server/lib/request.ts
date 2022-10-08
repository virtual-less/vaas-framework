import * as Koa from 'koa';
import {RequestConfig} from '../../types/server'

export class Request {

    static getRequestConfigByRequest(request:Koa.Request):RequestConfig {
        return {
            charset: request.charset,
            length: request.length,
            type: request.type,
            headers: request.headers,
            body: request.body,
            rawBody: request.rawBody,
            url: request.url,
            origin: request.origin,
            href: request.href,
            method: request.method,
            path: request.path,
            query: request.query,
            querystring: request.querystring,
            search: request.search,
            host: request.host,
            hostname: request.hostname,
            fresh: request.fresh,
            stale: request.stale,
            idempotent: request.idempotent,
            protocol: request.protocol,
            secure: request.secure,
            ip: request.ip,
            ips: request.ips,
        }
    }
    static mergeRequestConfig2Request({
        request, requestConfig
    }:{request:Koa.Request, requestConfig:RequestConfig}):Koa.Request {
        return Object.assign(request, requestConfig)
    }

    // async rpcInvote(remoteVaasServerName:string, params:any) {
    //     const functionNameData = /^(\w+)\.(\w+)$/.exec(remoteVaasServerName);
    //     if(!functionNameData) {
    //         throw new Error(`remoteVaasServerName[${remoteVaasServerName}] invalid! must be app.function and only [a-zA-Z0-9_]`)
    //     }
    // }
}
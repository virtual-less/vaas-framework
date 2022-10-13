import * as Koa from 'koa';
import {RequestConfig} from '../../types/server'
import {HttpBase} from './httpbase'

export class Request extends HttpBase {

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
            params:{},
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
        return HttpBase.mergeHttpObject(
            request, requestConfig,
            ['url','method','path','query','querystring','search']
        )
    }
}
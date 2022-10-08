import * as Koa from 'koa';
import {ResponseConfig} from '../../types/server'

export class Response {
    static getResponseConfigByResponse(response:Koa.Response):ResponseConfig {
        return {
            headers: response.headers,
            status: response.status,
            message: response.message,
            length: response.length,
            type: response.type,
            lastModified: response.lastModified,
            etag: response.etag,
        }
    }
    static mergeResponseConfig2Response({
        response, responseConfig
    }:{response:Koa.Response, responseConfig:ResponseConfig}):Koa.Response {
        return Object.assign(response,responseConfig)
    }
}
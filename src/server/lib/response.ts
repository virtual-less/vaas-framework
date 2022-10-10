import * as Koa from 'koa';
import {ResponseConfig} from '../../types/server'
import {HttpBase} from './httpbase'

export class Response extends HttpBase {
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
        response = HttpBase.mergeHttpObject(
            response,responseConfig,
            ['status','length','type','lastModified','etag']
        )
        if(responseConfig.headers && Object.keys(responseConfig.headers).length>0) {
            // @ts-ignore 
            response.set(responseConfig.headers)
        }
        return response
    }
}
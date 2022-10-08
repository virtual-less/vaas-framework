import { OutgoingHttpHeader } from "http";

export type ServerType = 'http'| 'rpc'

export interface ServerValue {
    type:ServerType,
    method?: 'get' | 'post' | 'put' | 'delete' | 'patch'| 'options';
    routerName?: string;
  }

export interface AppConfig {
  maxWorkerNum:number,
  timeout:number,
}

export interface GetAppNameByHost {
  (hostname:string): string;
}

export interface GetAppConfigByAppName {
  (appName:string): AppConfig;
}

export interface RequestConfig {
  // readonly _id:string;
  /**
   * Get the charset when present or undefined.
   */
   charset: string;

   /**
    * Return parsed Content-Length when present.
    */
   length: number;

   /**
    * Return the request mime type void of
    * parameters such as "charset".
    */
   type: string;

    /**
     * Return request header, alias as request.header
     */
    headers: NodeJS.Dict<string | string[]>;


    /**
     * Get request body.
     */
     body?: Record<string, unknown>;
    
     /**
     * Get query string.
     */
     rawBody: string;

    /**
     * Get/Set request URL.
     */
    url: string;

    /**
     * Get origin of URL.
     */
    origin: string;

    /**
     * Get full request URL.
     */
    href: string;

    /**
     * Get/Set request method.
     */
    method: string;

    /**
     * Get request pathname.
     * Set pathname, retaining the query-string when present.
     */
    path: string;

    /**
     * Get parsed query-string.
     * Set query-string as an object.
     */
    query: NodeJS.Dict<string | string[]>;

    /**
     * Get/Set query string.
     */
    querystring: string;

    /**
     * Get the search string. Same as the querystring
     * except it includes the leading ?.
     *
     * Set the search string. Same as
     * response.querystring= but included for ubiquity.
     */
    search: string;

    /**
     * Parse the "Host" header field host
     * and support X-Forwarded-Host when a
     * proxy is enabled.
     */
    host: string;

    /**
     * Parse the "Host" header field hostname
     * and support X-Forwarded-Host when a
     * proxy is enabled.
     */
    hostname: string;

    /**
     * Check if the request is fresh, aka
     * Last-Modified and/or the ETag
     * still match.
     */
    fresh: boolean;

    /**
     * Check if the request is stale, aka
     * "Last-Modified" and / or the "ETag" for the
     * resource has changed.
     */
    stale: boolean;

    /**
     * Check if the request is idempotent.
     */
    idempotent: boolean;

    /**
     * Return the protocol string "http" or "https"
     * when requested with TLS. When the proxy setting
     * is enabled the "X-Forwarded-Proto" header
     * field will be trusted. If you're running behind
     * a reverse proxy that supplies https for you this
     * may be enabled.
     */
    protocol: string;

    /**
     * Short-hand for:
     *
     *    this.protocol == 'https'
     */
    secure: boolean;

    /**
     * Request remote address. Supports X-Forwarded-For when app.proxy is true.
     */
    ip: string;

    /**
     * When `app.proxy` is `true`, parse
     * the "X-Forwarded-For" ip address list.
     *
     * For example if the value were "client, proxy1, proxy2"
     * you would receive the array `["client", "proxy1", "proxy2"]`
     * where "proxy2" is the furthest down-stream.
     */
    ips: string[];
}

export interface ResponseConfig {
    /**
     * Return response header.
     */
    headers: NodeJS.Dict<OutgoingHttpHeader>;
   /**
     * Get/Set response status code.
     */
    status: number;

    /**
     * Get response status message
     */
    message: string;

    /**
     * Return parsed response Content-Length when present.
     * Set Content-Length field to `n`.
     */
    length: number;

    /**
     * Return the response mime type void of
     * parameters such as "charset".
     *
     * Set Content-Type response header with `type` through `mime.lookup()`
     * when it does not contain a charset.
     *
     * Examples:
     *
     *     this.type = '.html';
     *     this.type = 'html';
     *     this.type = 'json';
     *     this.type = 'application/json';
     *     this.type = 'png';
     */
    type: string;

    /**
     * Get the Last-Modified date in Date form, if it exists.
     * Set the Last-Modified date using a string or a Date.
     *
     *     this.response.lastModified = new Date();
     *     this.response.lastModified = '2013-09-13';
     */
    lastModified: Date;

    /**
     * Get/Set the ETag of a response.
     * This will normalize the quotes if necessary.
     *
     *     this.response.etag = 'md5hashsum';
     *     this.response.etag = '"md5hashsum"';
     *     this.response.etag = 'W/"123456789"';
     *
     * @param {String} etag
     * @api public
     */
    etag: string;
}

export interface HttpParams {
  req:RequestConfig,
  res:ResponseConfig
}

export type  WorkerMessageType = 'init' | 'error' | 'execute' | 'result'
export interface ExecuteMessageBody {
    serveName:string, 
    executeId:string,
    type:ServerType,
    params:any
}

export interface ExecuteMessage {
  type:'execute',
  data:ExecuteMessageBody
}

export interface ResultMessageBody {
  executeId:string,
  result:{
    data:any,
    [key:string]:any
  }
}

export interface ResultMessage {
  type:'result',
  data:ResultMessageBody
}

export interface ErrorMessageBody {
  executeId?:string,
  error:any
}
export interface ErrorMessage {
  type:'error'
  data:ErrorMessageBody
}

export interface InitMessageBody {
  appConfig:Map<string, ServerValue>
}

export interface InitMessage {
  type:'init',
  data:InitMessageBody
}


export type WorkerMessage = ExecuteMessage|ResultMessage|ErrorMessage|InitMessage
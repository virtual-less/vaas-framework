import { type OutgoingHttpHeader } from 'http'
import { type ResourceLimits } from 'worker_threads'
import type * as Koa from 'koa'
import { type VaasWorkerStream } from '../server/worker/workerStream'

export type ServerType = 'http' | 'websocket' | 'rpc'

export interface ServerValue {
  type: ServerType
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options'
  routerName?: string
}

export interface HttpServerValue {
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options'
  routerName?: string
}

// 目前Websocket和HTTP基本一致
export type WebsocketServerValue = HttpServerValue

export interface ServerRouterValue extends ServerValue {
  routerFn?: Function
}

export interface AppConfig {
  maxWorkerNum: number
  allowModuleSet: Set<string>
  timeout: number
  resourceLimits?: ResourceLimits
  useVmLoadDependencies: boolean
}

export type GetAppNameByRequest = (request: Koa.Request) => Promise<{ appName: string, prefix: string }>

export type GetAppConfigByAppName = (appName: string) => Promise<AppConfig>

export type GetByPassFlowVersion = (appName: string) => Promise<{ version: string }>

export interface VaasConfig {
  appsDir: string
  port: number
  getAppNameByRequest: GetAppNameByRequest
  getAppConfigByAppName: GetAppConfigByAppName
  getByPassFlowVersion: GetByPassFlowVersion
  showErrorStack: boolean
  isPrepareWorker: boolean
}

export interface RequestConfig {
  /**
   * Get the charset when present or undefined.
   */
  readonly charset: string

  /**
    * Return parsed Content-Length when present.
    */
  readonly length: number

  /**
    * Return the request mime type void of
    * parameters such as "charset".
    */
  readonly type: string

  /**
     * Return request header, alias as request.header
     */
  readonly headers: NodeJS.Dict<string | string[]>

  /**
     * Get request body.
     */
  readonly body?: Record<string, any>

  /**
     * Get query string.
     */
  readonly rawBody: string

  /**
     * Get/Set request URL.
     */
  url: string

  /**
     * Get origin of URL.
     */
  readonly origin: string

  /**
     * Get full request URL.
     */
  readonly href: string

  /**
     * Get/Set request method.
     */
  method: string

  /**
     * Get request pathname.
     * Set pathname, retaining the query-string when present.
     */
  path: string

  /**
     * Get parsed routerName-params.
     * Set routerName-params as an object.
     */
  params: NodeJS.Dict<string | string[]>

  /**
     * Get parsed query-string.
     * Set query-string as an object.
     */
  query: NodeJS.Dict<string | string[]>

  /**
     * Get/Set query string.
     */
  querystring: string

  /**
     * Get the search string. Same as the querystring
     * except it includes the leading ?.
     *
     * Set the search string. Same as
     * response.querystring= but included for ubiquity.
     */
  search: string

  /**
     * Parse the "Host" header field host
     * and support X-Forwarded-Host when a
     * proxy is enabled.
     */
  readonly host: string

  /**
     * Parse the "Host" header field hostname
     * and support X-Forwarded-Host when a
     * proxy is enabled.
     */
  readonly hostname: string

  /**
     * Check if the request is fresh, aka
     * Last-Modified and/or the ETag
     * still match.
     */
  readonly fresh: boolean

  /**
     * Check if the request is stale, aka
     * "Last-Modified" and / or the "ETag" for the
     * resource has changed.
     */
  readonly stale: boolean

  /**
     * Check if the request is idempotent.
     */
  readonly idempotent: boolean

  /**
     * Return the protocol string "http" or "https"
     * when requested with TLS. When the proxy setting
     * is enabled the "X-Forwarded-Proto" header
     * field will be trusted. If you're running behind
     * a reverse proxy that supplies https for you this
     * may be enabled.
     */
  readonly protocol: string

  /**
     * Short-hand for:
     *
     *    this.protocol == 'https'
     */
  readonly secure: boolean

  /**
     * Request remote address. Supports X-Forwarded-For when app.proxy is true.
     */
  readonly ip: string

  /**
     * When `app.proxy` is `true`, parse
     * the "X-Forwarded-For" ip address list.
     *
     * For example if the value were "client, proxy1, proxy2"
     * you would receive the array `["client", "proxy1", "proxy2"]`
     * where "proxy2" is the furthest down-stream.
     */
  readonly ips: string[]
}

export interface ResponseConfig {
  /**
     * Return response header.
     */
  headers: NodeJS.Dict<OutgoingHttpHeader>
  /**
     * Get/Set response status code.
     */
  status: number

  /**
     * Get response status message
     */
  readonly message: string

  /**
     * Return parsed response Content-Length when present.
     * Set Content-Length field to `n`.
     */
  length: number

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
  type: string

  /**
     * Get the Last-Modified date in Date form, if it exists.
     * Set the Last-Modified date using a string or a Date.
     *
     *     this.response.lastModified = new Date();
     *     this.response.lastModified = '2013-09-13';
     */
  lastModified: Date

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
  etag: string
}

export interface HttpParams {
  req: RequestConfig
  res: ResponseConfig
}

export interface RpcParams<P=any, C=any> {
  params: P
  context: C
}

export interface ErrorConfig {
  message: string
  name: string
  stack: string
}

export interface WorkerConfig {
  appName: string
  version: string
  appsDir: string
  maxWorkerNum: number
  allowModuleSet: Set<string>
  recycleTime: number
  resourceLimits: ResourceLimits
  useVmLoadDependencies: boolean
}

export enum WorkerMessageType {
  error = 'error',
  execute = 'execute',
  result = 'result',
  init = 'init',
  crash = 'crash',
}

export interface ExecuteMessageBody {
  appName: string
  serveName?: string
  executeId: string
  type: ServerType
  params: any
}

export interface ExecuteMessage {
  type: WorkerMessageType.execute
  data: ExecuteMessageBody
}

export interface ResultMessageBody {
  executeId: string
  type: ServerType
  result: {
    data: any
    isComplete: boolean
    isStream: boolean
    stream?: VaasWorkerStream
    [key: string]: any
  }
}

export interface ResultMessage {
  type: WorkerMessageType.result
  data: ResultMessageBody
}

// todo 要将error类型改为Error，并批量处理Error与ErrorConfig的转换
export interface ErrorMessageBody {
  executeId?: string
  type: ServerType
  error: any
}
export interface ErrorMessage {
  type: WorkerMessageType.error
  data: ErrorMessageBody
}

export interface InitMessageBody {
  status: 'ok' | 'error'
}

export interface InitMessage {
  type: WorkerMessageType.init
  data: InitMessageBody
}

export type WorkerMessageBody = ExecuteMessageBody | ResultMessageBody | ErrorMessageBody | InitMessageBody
export type WorkerMessage = ExecuteMessage | ResultMessage | ErrorMessage | InitMessage

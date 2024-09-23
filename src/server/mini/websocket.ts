import type * as Koa from 'koa'
import { WebSocketServer } from 'ws'
import { type Server as HttpServer, ServerResponse } from 'http'
import { loadWebsocketRouter } from './router'
export const loadWebsocket = async ({ app, prefix, appList, server }: { app: Koa, prefix: string, appList: Array<{ appName: string, appInstance: any }>, server: HttpServer }) => {
  const wss = new WebSocketServer({ noServer: true })
  const routes = await loadWebsocketRouter({ prefix, appList })
  server.on('upgrade', async (request, socket, head) => {
    const ctx = app.createContext(request, new ServerResponse(request))
    // 这里使用中间件的方式调用
    wss.handleUpgrade(request, socket, head, (ws) => {
      const send = (data) => {
        if (typeof data !== 'string' && !(data instanceof Buffer)) {
          data = JSON.stringify(data)
        }
        return ws.send(data)
      }
      const message = (data) => {
        ctx._websocketData = data
        ctx._websocketSend = send
        // @ts-expect-error
        routes(ctx)
      }
      ws.on('message', message)
      const clean = () => {
        ws.removeListener('message', message)
        ws.removeListener('error', clean)
        ws.removeListener('close', clean)
        socket.destroy()
        request.destroy()
      }
      ws.once('close', clean)
      ws.once('error', clean)
    })
  })
}

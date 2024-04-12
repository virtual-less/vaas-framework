export function outputCatch ({ showErrorStack }: { showErrorStack: boolean }) {
  return async function (ctx, next) {
    try {
      await next()
      ctx.status = ctx?.response?.status || 200
    } catch (err) {
      ctx.status = ctx?.response?.status || 500
      const outputData = { ...err }
      if (showErrorStack) {
        outputData.stack = err.stack
      }
      return ctx.body = outputData
    }
  }
}

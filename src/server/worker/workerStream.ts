export class VaasWorkerStream {
    private callback:(chunk:Buffer)=>void
    private completeCallback:()=>void
    write(chunk:Buffer) {
        // 防止未添加callback就运行
        setImmediate(()=>{
            this.callback(chunk)
        })
    }
    writeComplete() {
        // 防止completeCallback快于callback
        setImmediate(() => {
            this.completeCallback()
        })
    }

    addWriteCallBack(callback:(chunk:Buffer)=>void) {
        this.callback = callback
    }

    waitWriteComplete() {
        return new Promise((resolve)=>{
            this.completeCallback = ()=>{
                resolve(true)
            }
        }) 
    }
}
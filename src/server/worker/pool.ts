import * as path from 'path'
import {convertErrorConfig2Error} from '../lib/error'
import {WorkerMessage, GetAppConfigByAppName, WorkerConfig} from '../../types/server'
import {VaasWorker, VaasWorkerSet} from './workerManage'


export class VaasWorkPool {
    pool:Map<string,Map<string,VaasWorkerSet>> = new Map<string,Map<string,VaasWorkerSet>>()
    workerRecycleCheckTime:number;
    appsDir:string
    getAppConfigByAppName:GetAppConfigByAppName
    static instance:VaasWorkPool = null
    constructor({
        appsDir,
        getAppConfigByAppName
    }:{
        appsDir:string,
        getAppConfigByAppName:GetAppConfigByAppName
    }) {
        if(VaasWorkPool.instance) {
            return VaasWorkPool.instance
        }
        VaasWorkPool.instance = this;
        this.getAppConfigByAppName = getAppConfigByAppName
        this.appsDir = appsDir
    }

    private recycle({
        vaasWorker, vaasWorkerSet, 
        appName, version, recycleTime
    }:{
        vaasWorker:VaasWorker
        vaasWorkerSet:VaasWorkerSet,
        appName:string,
        version:string,
        recycleTime:number
    }) {
        const recycleTimeId = setTimeout(()=>{
            const appPool = this.pool.get(appName)
            if(vaasWorker.recyclable()) {
                vaasWorkerSet.delete(vaasWorker)
                vaasWorker.terminate()
                vaasWorker.removeAllListeners()
                vaasWorker.poolInstance = null
                if(vaasWorkerSet.size<=0) {
                    appPool && appPool.delete(version)
                }
                if(appPool && appPool.size<=0) {
                    this.pool.delete(appName)
                }
            } else {
                this.recycle({vaasWorker, vaasWorkerSet, appName, version, recycleTime})
            }
            clearTimeout(recycleTimeId)
        },recycleTime+1)
    }
    private async getWorker({
        appsDir,appName,version,
        allowModuleSet,recycleTime,resourceLimits,
        useVmLoadDependencies
    }:WorkerConfig):Promise<VaasWorker> {
        const appDirPath = path.join(appsDir,appName, version)
        const worker = new VaasWorker(path.join(__dirname,'worker.js'),{
            appName,
            version,
            poolInstance:this,
            resourceLimits,
            recycleTime,
            workerData:{appsDir,appName,appDirPath,allowModuleSet,useVmLoadDependencies}
        })
        return await new Promise((reslove,reject)=>{
            worker.once('message', (message:WorkerMessage)=>{
                if(message.type!=='init') {
                    worker.terminate()
                    if(message.type==='error') {
                        return reject(convertErrorConfig2Error({errorConfig:message.data.error}))
                    } else {
                        return reject(new Error(`init ${appName} worker failed`))
                    }
                }
                worker.appServerConfigMap = message.data.appConfig
                worker.generateRouter()
                return reslove(worker)
            });
            worker.once('error', (err)=>{
                worker.removeAllListeners()
                worker.terminate()
                return reject(err)
            });
            worker.once('exit', (code) => {
                worker.isExit = true;
                worker.removeAllListeners()
                if (code !== 0)
                return reject(new Error(`appName[${appName}] Worker stopped with exit code ${code}`));
            });
        })
    }

    async getWorkConfigByAppName({appName,version}): Promise<WorkerConfig> {
        const appConfig = await this.getAppConfigByAppName(appName)
        return {
            appName,
            version,
            appsDir:this.appsDir,
            maxWorkerNum:appConfig.maxWorkerNum,
            allowModuleSet:new Set(appConfig.allowModuleSet),
            recycleTime:appConfig.timeout,
            resourceLimits:appConfig.resourceLimits,
            useVmLoadDependencies:appConfig.useVmLoadDependencies
        }
    }

    async getWokerByAppName({
        appName,
        version
    }:{
        appName:string,
        version:string,
    }):Promise<VaasWorker> {
        let appPool;
        if(this.pool.has(appName)) {
            appPool = this.pool.get(appName)
        } else {
            appPool = new Map<string,VaasWorkerSet>()
            this.pool.set(appName, appPool)
        }
        if(appPool.has(version)) {
            const vaasWorkerSet = appPool.get(version)
            if(vaasWorkerSet.size<vaasWorkerSet.maxSize){
                const workConfig = await this.getWorkConfigByAppName({appName,version});
                const vaasWorker = await this.getWorker(workConfig)
                vaasWorkerSet.add(vaasWorker)
                this.recycle({
                    vaasWorker, vaasWorkerSet, 
                    appName, version, recycleTime:workConfig.recycleTime
                })
            }
            return vaasWorkerSet.next()
        }
        const workConfig = await this.getWorkConfigByAppName({appName,version});
        const vaasWorker = await this.getWorker(workConfig)
        const vaasWorkerSet = new VaasWorkerSet([vaasWorker], workConfig.maxWorkerNum)
        this.recycle({
            vaasWorker, vaasWorkerSet, 
            appName, version, recycleTime: workConfig.recycleTime
        })
        appPool.set(version, vaasWorkerSet)
        return appPool.get(version).next()
    }
}



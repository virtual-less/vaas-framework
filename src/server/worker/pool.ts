import {promises as fsPromises} from 'fs'
import * as path from 'path'
import {convertErrorConfig2Error} from '../lib/error'
import {WorkerMessage,GetAppConfigByAppName} from '../../types/server'
import {VaasWorker, VaasWorkerSet} from './workerManage'


export class VaasWorkPool {
    pool:Map<string,VaasWorkerSet> = new Map<string,VaasWorkerSet>()
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

    private recycle({vaasWorker, vaasWorkerSet, appName, recycleTime}:{
        vaasWorker:VaasWorker
        vaasWorkerSet:VaasWorkerSet,
        appName:string,
        recycleTime:number
    }) {
        const recycleTimeId = setTimeout(()=>{
            if(vaasWorker.recyclable()) {
                vaasWorkerSet.delete(vaasWorker)
                vaasWorker.terminate()
                vaasWorker.removeAllListeners()
                vaasWorker.poolInstance = null
                if(vaasWorkerSet.size<=0) {
                    this.pool.delete(appName)
                }
            } else {
                this.recycle({vaasWorker, vaasWorkerSet, appName, recycleTime})
            }
            clearTimeout(recycleTimeId)
        },recycleTime+1)
    }
    private async getWorker({appsDir,appName,allowModuleSet,recycleTime,resourceLimits}):Promise<VaasWorker> {
        const appDirPath = path.join(appsDir,appName)
        const appEntryPath = path.join(appDirPath,'index.js');
        const FileNotExistError = new Error(`该微服务(${appName})不存在index入口文件`)
        try {
            const appEntryStat = await fsPromises.stat(appEntryPath);
            if(!appEntryStat.isFile()) {throw FileNotExistError;}
        } catch(err) {
            throw FileNotExistError;
        }
        const worker = new VaasWorker(path.join(__dirname,'worker.js'),{
            appName,
            poolInstance:this,
            resourceLimits,
            recycleTime,
            workerData:{appsDir,appName,appDirPath,appEntryPath,allowModuleSet}
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

    async getWorkConfigByAppName({appName}) {
        const appsDir = this.appsDir;
        const appConfig = await this.getAppConfigByAppName(appName)
        const maxWorkerNum=appConfig.maxWorkerNum
        const allowModuleSet=appConfig.allowModuleSet
        const recycleTime=appConfig.timeout
        const resourceLimits=appConfig.resourceLimits
        return {
            appsDir,
            maxWorkerNum,
            allowModuleSet,
            recycleTime,
            resourceLimits
        }
    }

    async getWokerByAppName({appName}):Promise<VaasWorker> {
        if(this.pool.has(appName)) {
            const vaasWorkerSet = this.pool.get(appName)
            if(vaasWorkerSet.size<vaasWorkerSet.maxSize){
                const workConfig = await this.getWorkConfigByAppName({appName});
                const vaasWorker = await this.getWorker({
                    appsDir:workConfig.appsDir,
                    appName,
                    allowModuleSet:workConfig.allowModuleSet,
                    resourceLimits:workConfig.resourceLimits,
                    recycleTime:workConfig.recycleTime,
                })
                vaasWorkerSet.add(vaasWorker)
                this.recycle({
                    vaasWorker, vaasWorkerSet, 
                    appName, recycleTime:workConfig.recycleTime
                })
            }
            return vaasWorkerSet.next()
        }
        const workConfig = await this.getWorkConfigByAppName({appName});
        const vaasWorker = await this.getWorker({
            appsDir:workConfig.appsDir,
            appName,
            allowModuleSet:workConfig.allowModuleSet,
            resourceLimits:workConfig.resourceLimits,
            recycleTime:workConfig.recycleTime,
        })
        const vaasWorkerSet = new VaasWorkerSet([vaasWorker], workConfig.maxWorkerNum)
        this.recycle({
            vaasWorker, vaasWorkerSet, 
            appName, recycleTime: workConfig.recycleTime
        })
        this.pool.set(appName,vaasWorkerSet)
        return this.pool.get(appName).next()
    }
}



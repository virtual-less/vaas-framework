#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path'
import * as os from 'os'
import fetch from 'node-fetch'
import {promises as fsPromises} from 'fs'
import * as compressing from 'compressing'

import {VaasServer} from '../server/index'
const packageInfo = require('../../package.json')
const program = new Command();
const vaasServer = new VaasServer()

function getConfig(configPath) {
    let defaultAppDir = path.join(process.cwd(),'build/apps')
    const defaultConfigPath = path.join(process.cwd(),'vaas.config.js')
    if(configPath) {
        if(!path.isAbsolute(configPath)) {
            configPath = path.join(process.cwd(),configPath)
        }
    }
    const tsconfigPath = path.join(process.cwd(),'tsconfig.json')
    try {
        const tsconfig = require(tsconfigPath)
        const tsOutDir = tsconfig?.compilerOptions?.outDir
        if(tsOutDir) {
            defaultAppDir = path.join(process.cwd(),tsOutDir,'apps')
        }
    } catch(error) {}
    const vaasConfig = require(configPath || defaultConfigPath)
    const finalyConfig = Object.assign({
        appsDir:defaultAppDir, 
        port:8080, 
        getAppNameByRequest:async (_request)=>{
            return ''
        }, 
        getAppConfigByAppName:async(_appName)=>{
            return {
                maxWorkerNum: 2,
                allowModuleSet:new Set(['*']),
                timeout: 30*1000
            }
        }, 
        showErrorStack:true
    },vaasConfig)
    return finalyConfig
}

program
    .name('vaas-cli')
    .description('CLI to run vaas project')
    .version(packageInfo.version)
    .option('-c, --configPath <configPath>','server config path')
    .action(async (options) => {
        const config = getConfig(options.configPath)
        vaasServer.run(config)
        process.stdout.write(`${os.EOL} vaas server run: http://127.0.0.1:${config.port} ${os.EOL}`)
    });


function getApiJsonError(apiJson) {
    if(apiJson.errmsg) {
        const error = new Error(apiJson.errmsg)
        if(apiJson.stack){error.stack = apiJson.stack}
        console.error(error)
        throw error
    }
}

program.command('deploy')
.description('deploy app to platform')
.option('-c, --configPath <configPath>','server config path')
.option('-h, --platformAddressHost <host>', 'platform remote address')
.option('-a, --appNames <appname>', 'platform remote address', '*')
.action(async (options) => {
    if(!options.platformAddressHost) {
        throw 'option platformAddressHost can\'t be empty!'
    }
    const getUploadUrlApi = `${options.platformAddressHost}/getUploadUrl`
    const deployApi = `${options.platformAddressHost}/deploy`
    const config = getConfig(options.configPath)
    const appNameList = await fsPromises.readdir(config.appsDir)
    const appNamesList = options.appNames.split(',')
    for(const appName of appNameList) {
        if(['.','..'].includes(appName)){continue}
        const IsPackageApp = appNamesList.includes('*') || appNamesList.includes(appName)
        if(!IsPackageApp){continue}
        const fileName = `${appName}.tgz`
        const getUploadUrlResp = await fetch(`${getUploadUrlApi}?fileName=${fileName}`)
        const getUploadUrlJson = await getUploadUrlResp.json()
        getApiJsonError(getUploadUrlJson)
        const distAppPath = path.join(config.appsDir,fileName)
        const appDirPath = path.join(config.appsDir,appName)
        const stat = await fsPromises.stat(appDirPath)
        if(!stat.isDirectory()){continue}
        await compressing.tgz.compressDir(appDirPath,distAppPath)
        await fetch(getUploadUrlJson.data.uploadUrl, { 
            method: 'PUT', 
            body: await fsPromises.readFile(distAppPath)
        })
        await fsPromises.unlink(distAppPath)
        const deployApiResp = await fetch(deployApi, {
            method: 'post',
            body: JSON.stringify({
                appBuildTgzS3Key:getUploadUrlJson.data.key,
                appName
            }),
            headers: {'Content-Type': 'application/json'}
        })
        const deployApiJson = await deployApiResp.json()
        getApiJsonError(deployApiJson)
        
    }
    

});

program.command('help')
    .description('help')
    .action(() => {
        program.help()
    });

program.parse();
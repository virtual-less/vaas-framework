#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path'
import * as os from 'os'

import {VaasServer} from '../server/index'
const packageInfo = require('../../package.json')
const program = new Command();
const vaasServer = new VaasServer()

program
    .name('vaas-cli')
    .description('CLI to run vaas project')
    .version(packageInfo.version)
    .option('-C, --configPath <configPath>','server config path')
    .action(async (options) => {
        const defaultConfigPath = path.join(process.cwd(),'vaas.config.js')
        if(options.configPath) {
            if(!path.isAbsolute(options.configPath)) {
                options.configPath = path.join(process.cwd(),options.configPath)
            }
        }
        let defaultAppDir = path.join(process.cwd(),'build/apps')
        const tsconfigPath = path.join(process.cwd(),'tsconfig.json')
        try {
            const tsconfig = require(tsconfigPath)
            const tsOutDir = tsconfig?.compilerOptions?.outDir
            if(tsOutDir) {
                defaultAppDir = path.join(process.cwd(),tsOutDir,'apps')
            }
        } catch(error) {}
        let vaasConfig = {}
        try {
            vaasConfig = require(options.configPath || defaultConfigPath)
        } catch(error) {
            if(options.configPath) {
                throw new Error(`vass config path is not exist![${options.configPath}]`)
            }
        }
        const finalyConfig = Object.assign({
            appsDir:defaultAppDir, 
            port:8080, 
            getAppNameByHost:async (_host)=>{
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
        vaasServer.run(finalyConfig)
        process.stdout.write(`${os.EOL} vaas server run: http://127.0.0.1:${finalyConfig.port} ${os.EOL}`)
    });

program.command('help')
    .description('help')
    .action(() => {
        program.help()
    });

program.parse();
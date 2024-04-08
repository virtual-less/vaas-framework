import { promises as fsPromises } from 'fs'
import * as path from 'path'
export const getAppEntryPath = async ({ appName, appDirPath })=>{
    let appEntryPath = path.join(appDirPath, 'index.js')
    const appEntryPackageJsonPath = path.join(appDirPath, 'package.json')
    const appEntryPackageJsonStat = await fsPromises.stat(appEntryPackageJsonPath)
    if (appEntryPackageJsonStat.isFile()) {
      let appEntryPackageJson: NodeJS.Dict<any> = {}
      try {
        appEntryPackageJson = JSON.parse((await fsPromises.readFile(appEntryPackageJsonPath)).toString())
      } catch (err) {
        err.stack = `该微服务(${appName})的package.json文件异常，请检查(${appEntryPackageJsonPath}) \n ` + err.stack
        throw err
      }
      if (appEntryPackageJson.main && typeof appEntryPackageJson.main === 'string') {
        appEntryPath = path.join(appDirPath, appEntryPackageJson.main)
      }
    }
    const FileNotExistError = new Error(`该微服务(${appName})不存在入口文件(${appEntryPath})`)
    try {
      const appEntryStat = await fsPromises.stat(appEntryPath)
      if (!appEntryStat.isFile()) { throw FileNotExistError }
    } catch (err) {
      throw FileNotExistError
    }
    return appEntryPath
}
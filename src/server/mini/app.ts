import { promises as fsPromises } from 'fs'
import * as path from 'path'

import { getAppEntryPath } from '../lib/util'
export const loadApp = async ({ appsDir }: { appsDir: string }) => {
  const appsDirList = await fsPromises.readdir(appsDir)
  const appList: Array<{ appName: string, appInstance: any }> = []
  for (const appName of appsDirList) {
    if (['.', '..'].includes(appName)) { continue }
    const appDirPath = path.join(appsDir, appName)
    const appEntryPath = await getAppEntryPath({ appName, appDirPath })
    const appClass = require(appEntryPath).default
    const appInstance = new appClass()
    appList.push({ appName, appInstance })
  }
  return appList
}

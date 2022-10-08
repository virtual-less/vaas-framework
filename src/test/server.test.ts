import * as assert from 'assert';
// import * as path from 'path';
import {describe, it} from 'mocha';
// import {VaasServer} from '../server/index';

// const server = new VaasServer()

// server.run({
//   appsDir:path.join(__dirname,'apps'), 
//   port:8080, 
//   getAppNameByHost:(host)=>{
//     return ''
//   }, 
//   getAppConfigByAppName:(appName)=>{
//     return {
//       maxWorkerNum:2,
//       timeout:3000
//     }
//   }, 
//   showErrorStack:true
// })

describe('Array', function () {
  describe('#indexOf()', function () {
    it('should return -1 when the value is not present', function () {
      assert.equal([1, 2, 3].indexOf(4), -1);
    });
  });
});
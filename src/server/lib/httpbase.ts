export class HttpBase {
    static mergeHttpObject<T extends Object, S>(target: T, source: S, mergeKeys:Array<string>): T {
        for(const mergeKey of mergeKeys) {
            if(source[mergeKey]) {
                target[mergeKey] = source[mergeKey]
            }
        }
        return target
        
    }
}
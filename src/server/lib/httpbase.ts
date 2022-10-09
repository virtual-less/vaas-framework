export class HttpBase {
    static mergeHttpObject<T extends Object, S>(target: T, source: S): T {
        const sourceKeys = Object.keys(source)
        for(const sourceKey of sourceKeys) {
            const descriptor = Reflect.getOwnPropertyDescriptor(target, sourceKey);
            if(descriptor && (descriptor.writable || descriptor.set )) {
                target[sourceKey] = source[sourceKey]
            }
            return target
        }
        
    }
}
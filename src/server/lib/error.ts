import {ErrorConfig} from '../../types/server'


export function convertError2ErrorConfig({error}:{error:Error}) {
    return {
        message:error.message,
        stack:error.stack,
        ...error
    }
}

export function convertErrorConfig2Error({errorConfig}:{errorConfig:ErrorConfig}):Error {
    const error = new Error(errorConfig.message)
    return Object.assign(error, errorConfig);
}
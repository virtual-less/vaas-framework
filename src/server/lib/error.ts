import {ErrorConfig} from '../../types/server'


export function convertError2ErrorConfig({error}:{error:Error}) {
    return {
        message:error.message,
        name:error.name,
        stack:error.stack,
    }
}

export function convertErrorConfig2Error({errorConfig}:{errorConfig:ErrorConfig}):Error {
    const error = new Error(errorConfig.message)
    error.stack = errorConfig.stack
    return error;
}
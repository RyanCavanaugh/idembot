// import * as bragi from 'bragi';

export interface Log {
    log(message: string, data?: any): void;
}

export function get(_groupName: string): Log {
    return {
        log: (message: string, data?: any) =>  console.log(message, data)// bragi.log(message, data)
    };
}

export const Cache = get("Cache");


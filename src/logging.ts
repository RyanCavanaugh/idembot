import * as bragi from 'bragi';

export interface Log {
    log(message: string, data?: any): void;
}

export function get(groupName: string): Log {
    return {
        log: (message: string, data?: any) => bragi.log(message, data)
    };
}

export const Cache = get("Cache");


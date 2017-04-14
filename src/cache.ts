import fs = require('mz/fs');
import path = require('path');

export interface CacheSaveEntry<T> {
    timestamp: string | undefined;
    content: T;
}

export type CacheLoadResult<T> = {
    exists: true,
    content: T,
    timestamp: string
} | { exists: false };

export interface Cache {
    save(content: any, key: string, timestamp: Date): Promise<void>;
    load(key: string): Promise<CacheLoadResult<any>>;
}

export function createCache(cacheRoot: string): Cache {
    function getFilename(key: string) {
        return path.join(cacheRoot, key);
    }

    async function save(content: any, key: string, timestamp: Date) {
        const filePath = getFilename(key);
        await mkdirp(path.dirname(filePath));
        const withTime: CacheSaveEntry<any> = { timestamp: timestamp.toUTCString(), content };
        await fs.writeFile(filePath, JSON.stringify(withTime), 'utf8');
    }

    async function load(key: string): Promise<CacheLoadResult<any>> {
        const path = getFilename(key);
        if (await fs.exists(path)) {
            const result: CacheLoadResult<any> = JSON.parse(await fs.readFile(path, 'utf8'));
            result.exists = true;
            return result;
        } else {
            return {
                exists: false,
            };
        }
    }

    return {
        save,
        load
    };
}

async function mkdirp(pathToMake: string) {
    let start = pathToMake;
    const pathsToMake: string[] = [];
    // Trim until we find something which does exist
    while (true) {
        const exists = await fs.exists(start);
        if (exists) break;
        pathsToMake.push(start);
        start = path.dirname(start);
    }
    while (pathsToMake.length) {
        await fs.mkdir(pathsToMake.pop()!);
    }
}

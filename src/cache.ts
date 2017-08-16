import fs = require("fs-extra");
import { dirname, join as joinPaths } from "path";

export interface CacheSaveEntry<T> {
    timestamp: string | undefined;
    content: T;
}

export type CacheLoadResult<T> = {
    exists: true,
    content: T,
    timestamp: string,
} | { exists: false };

export interface Cache {
    save(content: any, key: string, timestamp: Date): Promise<void>;
    load(key: string): Promise<CacheLoadResult<any>>;
}

export function createCache(cacheRoot: string): Cache {
    function getFilename(key: string): string {
        return joinPaths(cacheRoot, key);
    }

    async function save(content: any, key: string, timestamp: Date): Promise<void> {
        const filePath = getFilename(key);
        await fs.mkdirp(dirname(filePath));
        const withTime: CacheSaveEntry<any> = { timestamp: timestamp.toUTCString(), content };
        await fs.writeFile(filePath, JSON.stringify(withTime), { encoding: "utf8" });
    }

    async function load(key: string): Promise<CacheLoadResult<any>> {
        const path = getFilename(key);
        if (await fs.pathExists(path)) {
            const result: CacheLoadResult<any> = JSON.parse(await fs.readFile(path, "utf8"));
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
        load,
    };
}

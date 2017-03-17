import fs = require('mz/fs');
import path = require('path');

export interface CacheSaveEntry<T> {
    timestamp: Date;
    content: T;
}

export interface CacheLoadResult<T> extends CacheSaveEntry<T> {
    exists: boolean;
}

export interface Cache {
    save(content: any, timestamp: Date, id: number, category: string, subName?: string): Promise<void>;
    load(id: number, category: string, subName?: string): Promise<CacheLoadResult<any>>;
}

export function createCache(cacheRoot: string, repoOwner: string, repoName: string): Cache {
    const rootPath = path.join(cacheRoot, repoOwner, repoName);

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

    function makeFilename(id: number, category: string, subName: string) {
        // e.g. 5132.comments.json, or 2432.json
        const name = subName ?  `${id}.${subName}.json` : `${id}.json`;
        // 0000, 1000, 2000, etc
        const subpart = `${Math.floor(id / 1000)}000`;
        // {root}/issues/3000/
        const filePath = path.join(rootPath, category, subpart);
        // {root}/issues/4000/4607.comments.json
        const fullFilename = path.join(filePath, name);

        return {
            name,
            path: filePath,
            fullFilename
        }
    }

    // e.g. issue 4132 comments go to
    // cache/owner/repo/issues/4000/4132.json
    async function save(content: any, timestamp: Date, id: number, category: string, subName = '') {
        const path = makeFilename(id, category, subName);

        await mkdirp(path.path);
        const withTime: CacheSaveEntry<any> = { timestamp, content };
        await fs.writeFile(path.fullFilename, JSON.stringify(withTime), 'utf8');
    }

    async function load(id: number, category: string, subName = ''): Promise<CacheLoadResult<any>> {
        const path = makeFilename(id, category, subName);
        if (await fs.exists(path.fullFilename)) {
            const result: CacheLoadResult<any> = JSON.parse(await fs.readFile(path.fullFilename, 'utf8'));
            result.exists = true;
            return result;
        } else {
            return { 
                exists: false,
                timestamp: new Date(0),
                content: undefined
            };
        }
    }

    return {
        save,
        load
    };
}




import { Pool } from './pool';
import { Cache } from './cache';
import * as client from './client';
import * as Wrapped from './github';
import WeakStringMap from './weak-string-map';

let cache: Cache | undefined = undefined;
export function useCache(c: Cache) {
    cache = c;
}

function keyFromIssue(issue: GitHubAPI.Issue): Keys.Issue {
    const repo = Wrapped.parseRepoReference(issue.repository_url);
    return [repo.owner, repo.name, issue.number];
}

export namespace Keys {
    export type User = string;
    export type Issue = [string, string, number];
    export type Label = [string, string, string];
}

export const Issues = new Pool({
    constructor: Wrapped.Issue,
    keyToString: (key: Keys.Issue) => key[0] + '/' + key[1] + '#' + key[2],
    keyOf: keyFromIssue,
    fetchData: async key => {
        const data = JSON.parse(await client.exec('GET', path('repos', key[0], key[1], 'issues', key[2])));
        const timestamp = new Date();
        cache && await cache.save(data, timestamp, data.number, 'issues');
        return JSON.parse(data) as GitHubAPI.Issue;
    }
});

export const Users = new Pool({
    constructor: Wrapped.User,
    keyToString: (k: Keys.User) => k,
    keyOf: data => data.login,
    fetchData: async login => {
        const data = await client.exec('GET', path('users', login));
        return JSON.parse(data) as GitHubAPI.User;
    },
});

export const IssueComments = new Pool({
    constructor: Wrapped.IssueComment,
    fetchData: () => {
        throw new Error('Cannot fetch issue comment directly')
    },
    keyToString: id => id.toString(),
    keyOf: raw => raw.id
});

export namespace Labels {
    const pool = new WeakStringMap<Wrapped.Label>();
    export function get(repo: Wrapped.Repository, data: GitHubAPI.Label) {
        const key = [repo.owner, repo.name, ':label:', name].join('/');
        let value = pool.get(key);
        if (value !== undefined) {
            return value;
        }
        value = new Wrapped.Label(repo, data);
        pool.set(key, value);
        return value;
    }
}

function path(...parts: (string | number)[]) {
    return '/' + parts.map(encodeURIComponent).join('/');
}

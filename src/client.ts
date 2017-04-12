import https = require('https');
import http = require('http');

import { Cache, createCache } from './cache';
import * as Wrapped from './github';
import WeakStringMap from './weak-string-map';
import * as Pools from './pools';

export type IssuePageFetchResult = {
    issues: GitHubAPI.Issue[];
    fetchMore?: () => Promise<IssuePageFetchResult>;
}

let oauthToken: string, cache: Cache;

export function initialize(_oauthToken: string, _cache: Cache) {
    oauthToken = _oauthToken;
    cache = _cache;
}

let me: Wrapped.User | undefined;
export async function getMyLogin() {
    if (me === undefined) {
        const self: string = JSON.parse(await exec('GET', '/user')).login;
        me = await Pools.Users.get(self);
    }
    return me;
}

export async function addLabels(issue: Wrapped.Issue, labels: string[]) {
    // https://developer.github.com/v3/issues/labels/#add-labels-to-an-issue
    await exec(
        "POST",
        path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'labels'),
        {},
        JSON.stringify(labels)
    );
}

export async function removeLabels(issue: Wrapped.Issue, labels: string[]) {
    // https://developer.github.com/v3/issues/labels/#remove-a-label-from-an-issue
    for (const label of labels) {
        await exec(
            "DELETE",
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'labels', label)
        );
    }
}

export async function setLabels(issue: Wrapped.Issue, labels: string[]) {
    // https://developer.github.com/v3/issues/labels/#replace-all-labels-for-an-issue
    await exec(
        "PUT",
        path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'labels'),
        {},
        JSON.stringify(labels)
    );
}

export async function fetchIssueComments(issue: Wrapped.Issue): Promise<GitHubAPI.IssueComment[]> {
    const raw = await execPaged(path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'comments'));
    return raw as GitHubAPI.IssueComment[];
}

export async function lockIssue(issue: Wrapped.Issue) {
    await exec('PUT',
        path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'lock'),
        {},
        ""
    );
}

export async function unlockIssue(issue: Wrapped.Issue) {
    await exec('DELETE',
        path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'lock')
    );
}

export async function closeIssue(issue: Wrapped.Issue) {
    await exec('PATCH',
        path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number),
        {},
        JSON.stringify({ state: 'closed' })
    );
}

export async function reopenIssue(issue: Wrapped.Issue) {
    await exec('PATCH',
        path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number),
        {},
        JSON.stringify({ state: 'open' })
    );
}

export async function addComment(issue: Wrapped.Issue, body: string) {
    await exec('POST',
        path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'comments'),
        {},
        JSON.stringify({ body })
    );
}

export async function editComment(comment: Wrapped.IssueComment, body: string) {
    await exec('PATCH',
        path('repos', comment.repository.owner, comment.repository.name, 'issues', 'comments', comment.id),
        {},
        JSON.stringify({ body })
    );
}

export async function fetchChangedIssues(repo: GitHubAPI.RepoReference, opts?: { since?: Date, page?: number }) {
    // https://developer.github.com/v3/issues/#list-issues
    const timestamp = new Date();
    const queryString: any = {
        sort: 'updated',
        filter: 'all',
        direction: 'desc',
        per_page: 100
    };
    if (opts) {
        if (opts.since) queryString.since = opts.since.toISOString();
        if (opts.page) queryString.page = opts.page;
    }

    const page: GitHubAPI.Issue[] = JSON.parse(await exec('GET',
        path('repos', repo.owner, repo.name, 'issues'),
        queryString));
    
    for (const issue of page) {
        await cache.save(issue, timestamp, issue.number, 'issues');
    }

    return {
        issues: page.map((issue: GitHubAPI.Issue) => Pools.Issues.instantiate(issue)),
        fetchMore: undefined
    };
}

async function execPaged(path: string, perPage: number = 100, queryString: { [key: string]: string } = {}): Promise<{}[]> {
    const result: {}[] = [];
    var pageNumber = 1;
    while (true) {
        console.log(`Fetch page ${pageNumber}...`);
        const qs = { ...queryString, page: pageNumber.toString(), per_page: perPage.toString() };
        const page = await exec('GET', path, qs);
        const arr = JSON.parse(page);
        if (!Array.isArray(arr)) {
            throw new Error("Didn't parse an array from a paged fetch");
        }
        result.push(...arr);
        if (arr.length < perPage) {
            return result;
        }
        pageNumber++;
    }
}


export async function exec(method: string, path: string, queryString: { [key: string]: string } = {}, body?: string | undefined): Promise<string> {
    const hostname = "api.github.com";
    const headers: any = {
        "User-Agent": "RyanCavanaugh idembot",
        "Accept": "application/vnd.github.squirrel-girl-preview+json",
        "Authorization": `token ${oauthToken}`
    };

    const bodyStream = body === undefined ? undefined : Buffer.from(body);
    if (bodyStream !== undefined) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = bodyStream.length;
    }

    const fullPath = path + '?' + Object.keys(queryString).map(k => k + '=' + encodeURIComponent(queryString[k])).join('&');

    console.log(`HTTPS: ${method} https://${hostname}${fullPath}`);

    return new Promise<string>((resolve, reject) => {
        const req = https.request({
            method,
            path: fullPath,
            headers,
            hostname,
        }, res => {
            // console.log('Headers: ' + JSON.stringify(res.headers, undefined, 2));
            if (res.statusCode! >= 400) {
                console.log(`Error! Status code ${res.statusCode} returned`);
                reject(`Status code ${res.statusCode} returned`);
                return;
            }
            res.setEncoding('utf8');
            var data = '';
            res.on('data', chunk => {
                data = data + chunk;
            });
            res.on('end', () => {
                resolve(data);
            });
            res.on('error', err => {
                console.log('Connection Error!');
                console.log(err);
                reject(err);
            })
        });
        if (bodyStream !== undefined) {
            req.write(bodyStream);
        }
        req.end();
    });
}

function path(...parts: (string | number)[]) {
    return '/' + parts.map(encodeURIComponent).join('/');
}

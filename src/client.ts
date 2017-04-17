import https = require('https');
import http = require('http');

import { Issue, IssueOrPullRequest } from './github';
import { IssueFilter, PullRequestFilter } from './options';
import * as Wrapped from './github';
import WeakStringMap from './weak-string-map';
import path from './build-path';

export type IssuePageFetchResult = {
    issues: GitHubAPI.Issue[];
    fetchMore?: () => Promise<IssuePageFetchResult>;
}

let oauthToken: string;

export function initialize(_oauthToken: string) {
    oauthToken = _oauthToken;
}

let me: string | undefined;
export async function getMyLogin(): Promise<string> {
    if (me === undefined) {
        me = (JSON.parse(await exec('GET', '/user')) as GitHubAPI.User).login;
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

export type IssuePageResult = {
    page: GitHubAPI.Issue[];
    next?(): Promise<IssuePageResult>;
};

export async function fetchAllIssuesAndPRsRaw(repo: GitHubAPI.RepoReference, filter?: IssueFilter) {
    return fetchPage(1);
    async function fetchPage(page: number): Promise<IssuePageResult> {
        // https://developer.github.com/v3/issues/#list-issues
        const timestamp = new Date();
        const queryString: any = {
            sort: 'created',
            filter: 'all',
            direction: 'asc',
            per_page: 100,
            page
        };

        if (filter && filter.openOnly) {
            queryString.filter = 'open';
        }

        const thisPage: GitHubAPI.Issue[] = JSON.parse(await exec('GET',
            path('repos', repo.owner, repo.name, 'issues'),
            queryString));

        return {
            page: thisPage,
            next: thisPage.length === 100 ? (() => fetchPage(page + 1)) : undefined
        };
    }
}

export async function fetchChangedIssuesRaw(repo: GitHubAPI.RepoReference, filter?: IssueFilter) {
    // https://developer.github.com/v3/issues/#list-issues
    const queryString: any = {
        sort: 'updated',
        filter: 'all',
        direction: 'desc',
        per_page: 100
    };

    if (filter && filter.openOnly) {
        queryString.filter = 'open';
    }

    let page: GitHubAPI.Issue[] = JSON.parse(await exec('GET',
        path('repos', repo.owner, repo.name, 'issues'),
        queryString));
    page = page.filter(i => !i.pull_request);
    return page;
}

export async function fetchChangedPRsRaw(repo: GitHubAPI.RepoReference, filter?: PullRequestFilter) {
    // https://developer.github.com/v3/pulls/#list-pull-requests
    const queryString: any = {
        sort: 'updated',
        state: 'all',
        direction: 'desc',
        per_page: 100
    };

    if (filter && filter.openOnly) {
        queryString.state = 'open';
    }

    const page: GitHubAPI.PullRequest[] = JSON.parse(await exec('GET',
        path('repos', repo.owner, repo.name, 'pulls'),
        queryString));
    return page;
}

export async function fetchIssueComments(issue: Wrapped.Issue): Promise<GitHubAPI.IssueComment[]> {
    const raw = await execPaged(path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'comments'));
    return raw as GitHubAPI.IssueComment[];
}

export async function fetchPR(repo: GitHubAPI.RepoReference, number: number): Promise<GitHubAPI.PullRequest> {
    const result = JSON.parse(await exec('GET', path('repos', repo.owner, repo.name, 'pulls', number)));
    return result;
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

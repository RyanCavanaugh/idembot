import https = require('https');
import http = require('http');

import { Cache, createCache } from './cache';
import * as Wrapped from './github';
import WeakStringMap from './weak-string-map';

type Issue = GitHubAPI.Issue;
type PR = GitHubAPI.Issue;
type IssueOrPR = Issue | PR;

function path(...parts: (string | number)[]) {
    return '/' + parts.map(encodeURIComponent).join('/');
}

export type IssuePageFetchResult = {
    issues: GitHubAPI.Issue[];
    fetchMore?: () => Promise<IssuePageFetchResult>;
}

/**
 * Naming convention in this class:
 *   fetchThing: *always* does a network request
 */
export default class GitHubAPIClient {
    constructor(private oauthToken: string, private cache: Cache) {
    }

    private async fetchFromPool<T>(cache: WeakStringMap<T>, key: string, create: Promise<T>) {
        const result = cache.get(key);
        if (result === undefined) {
            const fetched = await create;
            cache.set(key, fetched);
            return fetched;
        } else {
            return result;
        }
    }

    private updateFromPool<Data,
        Instance extends { update(d: Data): void },
        Cls extends { new (c: GitHubAPIClient, d: Data): Instance; }>
        (cache: WeakStringMap<Instance>, key: string, data: Data, ctor: Cls) {
        const result = cache.get(key);
        if (result === undefined) {
            const fetched = new ctor(this, data);
            cache.set(key, fetched);
            return fetched;
        } else {
            result.update(data);
            return result;
        }
    }

    private issueCache = new WeakStringMap<Wrapped.Issue>();
    private issueKey(owner: string, repo: string, issueNumber: string) {
        return owner + '/' + repo + '#' + issueNumber;
    }
    public async getIssue(owner: string, repo: string, issueNumber: string) {
        return this.fetchFromPool(this.issueCache, this.issueKey(owner, repo, issueNumber), this.fetchIssue(owner, repo, issueNumber));
    }
    private async fetchIssue(owner: string, repo: string, issueNumber: string) {
        const timestamp = new Date();
        const result = await this.exec('GET', path('repos', owner, repo, 'issues', issueNumber));
        const data: GitHubAPI.Issue = JSON.parse(result);
        await this.cache.save(data, timestamp, data.number, 'issues');
        return new Wrapped.Issue(this, data);
    }
    private getIssueSync(owner: string, repo: string, data: GitHubAPI.Issue) {
        return this.updateFromPool(this.issueCache, this.issueKey(owner, repo, data.number.toString()), data, Wrapped.Issue);
    }

    private userCache = new WeakStringMap<Wrapped.User>();
    public getUserSync(data: GitHubAPI.User) {
        return this.updateFromPool(this.userCache, data.login, data, Wrapped.User);
    }
    public async getUser(login: string) {
        return await this.fetchFromPool(this.userCache, login, this.fetchUser(login));
    }
    private async fetchUser(login: string) {
        const data = JSON.parse(await this.exec('GET', path('users', login)));
        return new Wrapped.User(this, data);
    }

    private labelCache = new WeakStringMap<Wrapped.Label>();
    public getLabelSync(data: GitHubAPI.Label) {
        return this.updateFromPool(this.labelCache, data.url, data, Wrapped.Label);
    }

    private commentCache = new WeakStringMap<Wrapped.Comment>();
    public getCommentSync(data: GitHubAPI.IssueComment) {
        return this.updateFromPool(this.commentCache, data.id.toString(), data, Wrapped.Comment);
    }

    private me: Wrapped.User | undefined;
    public async getMyLogin() {
        if (this.me === undefined) {
            const self = JSON.parse(await this.exec('GET', '/user')).login;
            this.me = await this.getUser(self);
        }
        return this.me;
    }

    public async addLabels(issue: Wrapped.Issue, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#add-labels-to-an-issue
        await this.exec(
            "POST",
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'labels'),
            {},
            JSON.stringify(labels)
        );
    }

    public async removeLabels(issue: Wrapped.Issue, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#remove-a-label-from-an-issue
        for (const label of labels) {
            await this.exec(
                "DELETE",
                path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'labels', label)
            );
        }
    }

    public async setLabels(issue: Wrapped.Issue, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#replace-all-labels-for-an-issue
        await this.exec(
            "PUT",
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'labels'),
            {},
            JSON.stringify(labels)
        );
    }

    public async getIssueComments(issue: Wrapped.Issue) {
        const timestamp = new Date();
        const raw = await this.execPaged(path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'comments'));
        await this.cache.save(raw, timestamp, issue.number, 'issues', 'comments');
        return raw.map(c => this.getCommentSync(<GitHubAPI.IssueComment>c));
    }

    public async lockIssue(issue: Wrapped.Issue) {
        await this.exec('PUT',
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'lock'),
            {},
            ""
        );
    }

    public async unlockIssue(issue: Wrapped.Issue) {
        await this.exec('DELETE',
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'lock')
        );
    }

    public async closeIssue(issue: Wrapped.Issue) {
        await this.exec('PATCH',
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number),
            {},
            JSON.stringify({ state: 'closed' })
        );
    }

    public async reopenIssue(issue: Wrapped.Issue) {
        await this.exec('PATCH',
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number),
            {},
            JSON.stringify({ state: 'open' })
        );
    }

    public async addComment(issue: Wrapped.Issue, body: string) {
        await this.exec('POST',
            path('repos', issue.repository.owner, issue.repository.name, 'issues', issue.number, 'comments'),
            {},
            JSON.stringify({ body })
        );
    }

    public async editComment(comment: Wrapped.Comment, body: string) {
        await this.exec('PATCH',
            path('repos', comment.repository.owner, comment.repository.name, 'issues', 'comments', comment.id),
            {},
            JSON.stringify({ body })
        );
    }

    public async fetchChangedIssues(repo: GitHubAPI.RepoReference, opts?: { since?: Date, page?: number }) {
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

        const page: GitHubAPI.Issue[] = JSON.parse(await this.exec('GET',
            path('repos', repo.owner, repo.name, 'issues'),
            queryString));
        
        for (const issue of page) {
            await this.cache.save(issue, timestamp, issue.number, 'issues');
        }

        return {
            issues: page.map((issue: GitHubAPI.Issue) => this.getIssueSync(repo.owner, repo.name, issue)),
            fetchMore: undefined
        };
    }

    private async execPaged(path: string, perPage: number = 100, queryString: { [key: string]: string } = {}): Promise<{}[]> {
        const result: {}[] = [];
        var pageNumber = 1;
        while (true) {
            console.log(`Fetch page ${pageNumber}...`);
            const qs = { ...queryString, page: pageNumber.toString(), per_page: perPage.toString() };
            const page = await this.exec('GET', path, qs);
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


    private async exec(method: string, path: string, queryString: { [key: string]: string } = {}, body?: string | undefined): Promise<string> {
        const hostname = "api.github.com";
        const headers: any = {
            "User-Agent": "RyanCavanaugh idembot",
            "Accept": "application/vnd.github.squirrel-girl-preview+json",
            "Authorization": `token ${this.oauthToken}`
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
}

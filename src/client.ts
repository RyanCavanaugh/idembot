import https = require('https');
import http = require('http');

import * as Wrapped from './github';
import WeakStringMap from './weak-string-map';

type Issue = GitHubAPI.Issue;
type PR = GitHubAPI.Issue;
type IssueOrPR = Issue | PR;

function path(...parts: (string | number)[]) {
    return '/' + parts.map(encodeURIComponent).join('/');
}

/**
 * Given an issue returns a string like ['Microsoft', 'TypeScript']
 */
function parseRepoReference(issue: GitHubAPI.Issue) {
    // "https://api.github.com/repos/octocat/Hello-World
    const regex = /^https:\/\/[^\/]+\/repos\/([^\/]+)\/([^\/]+)/;
    const match = regex.exec(issue.repository_url);
    if (match == null) {
        throw new Error(`Issue repository URL was in an unexpected format: ${issue.repository_url}`);
    }
    return [match[1], match[2]];
}

export type IssuePageFetchResult = {
    issues: GitHubAPI.Issue[];
    fetchMore?: () => Promise<IssuePageFetchResult>;
}

export default class GithubAPIClient {
    constructor(public oauthToken: string) {
    }

    private async fetchFromCache<T>(cache: WeakStringMap<T>, key: string, create: Promise<T>) {
        const result = cache.get(key);
        if (result === undefined) {
            const fetched = await create;
            cache.set(key, fetched);
            return fetched;
        } else {
            return result;
        }
    }
    private async updateFromCache<Data,
        Instance extends { update(d: Data): void },
        Cls extends { new(c: GithubAPIClient, d: Data): Instance; }>
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
    public async getIssue(owner: string, repo: string, issueNumber: string) {
        return this.fetchFromCache(this.issueCache, owner + '/' + repo + '#' + issueNumber, this.fetchIssue(owner, repo, issueNumber));
    }
    private async fetchIssue(owner: string, repo: string, issueNumber: string) {
        return new Wrapped.Issue(<any>null, <any>null);
    }

    private userCache = new WeakStringMap<Wrapped.User>();
    public async getUser(login: string, data?: GitHubAPI.User) {
        if (data === undefined) {
            return await this.fetchFromCache(this.userCache, login, this.fetchUser(login));
        } else {
            return this.updateFromCache(this.userCache, login, data, Wrapped.User);
        }
    }
    private async fetchUser(login: string) {
        const data = JSON.parse(await this.exec('GET', path('users', login)));
        return new Wrapped.User(this, data);
    }
    

    public async addLabels(issue: GitHubAPI.Issue, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#add-labels-to-an-issue
        await this.exec(
            "POST",
            path('repos', ...parseRepoReference(issue), 'issues', issue.number, 'labels'),
            {},
            JSON.stringify(labels)
        );
    }

    public async removeLabels(issue: GitHubAPI.Issue, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#remove-a-label-from-an-issue
        for (const label of labels) {
            await this.exec(
                "DELETE",
                path('repos', ...parseRepoReference(issue), 'issues', 'label', label)
            );
        }
    }

    public async setLabels(issue: GitHubAPI.Issue, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#replace-all-labels-for-an-issue
        await this.exec(
            "PUT",
            path('repos', ...parseRepoReference(issue), 'issues', issue.number, 'labels'),
            {},
            JSON.stringify(labels)
        );
    }

    public addAssignee() {

    }

    public async fetchChangedIssues(repo: GitHubAPI.RepoReference) {
        // https://developer.github.com/v3/issues/#list-issues
        const page = await this.exec('GET',
            path('repos', repo.owner, repo.name, 'issues'),
            {
                sort: 'updated',
                filter: 'all',
                direction: 'desc'
            });
        return {
            issues: JSON.parse(page),
            fetchMore: undefined
        };
    }

    private async exec(method: string, path: string, queryString: { [key: string]: string } = {}, body?: string | undefined): Promise<string> {
        const hostname = "api.github.com";
        const headers: any = {
            "User-Agent": "RyanCavanaugh idembot",
            "Accept": "application/vnd.github.v3+json",
            "Authorization": `token ${this.oauthToken}`
        };

        if (body !== undefined) {
            headers["Content-Type"] = "application/json";
            headers["Content-Length"] = body.length.toString();
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
                console.log('Headers: ' + JSON.stringify(res.headers, undefined, 2));
                res.setEncoding('utf8');
                var data = '';
                res.on('data', chunk => {
                    data = data + chunk;
                });
                res.on('end', () => {
                    resolve(data);
                });
                res.on('error', err => {
                    console.log('Error!');
                    console.log(err);
                    reject(err);
                })
            });
            if (body !== undefined) {
                req.write(body, 'utf8');
            }
            req.end();
        });
    }
}

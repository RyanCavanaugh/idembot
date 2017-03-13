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
    private updateFromCache<Data,
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
    private issueKey(owner: string, repo: string, issueNumber: string) {
        return owner + '/' + repo + '#' + issueNumber;
    }
    public async getIssue(owner: string, repo: string, issueNumber: string) {
        return this.fetchFromCache(this.issueCache, this.issueKey(owner, repo, issueNumber), this.fetchIssue(owner, repo, issueNumber));
    }
    private async fetchIssue(owner: string, repo: string, issueNumber: string) {
        return new Wrapped.Issue(<any>null, <any>null);
    }
    private getIssueSync(owner: string, repo: string, data: GitHubAPI.Issue) {
        return this.updateFromCache(this.issueCache, this.issueKey(owner, repo, data.number.toString()), data, Wrapped.Issue);
    }

    private userCache = new WeakStringMap<Wrapped.User>();
    public getUserSync(data: GitHubAPI.User) {
        return this.updateFromCache(this.userCache, data.login, data, Wrapped.User);
    }
    public async getUser(login: string, data?: GitHubAPI.User) {
        return await this.fetchFromCache(this.userCache, login, this.fetchUser(login));
    }
    private async fetchUser(login: string) {
        const data = JSON.parse(await this.exec('GET', path('users', login)));
        return new Wrapped.User(this, data);
    }
    
    private labelCache = new WeakStringMap<Wrapped.Label>();
    public getLabelSync(data: GitHubAPI.Label) {
        return this.updateFromCache(this.labelCache, data.url, data, Wrapped.Label);
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
            issues: JSON.parse(page).map((issue: GitHubAPI.Issue) => this.getIssueSync(repo.owner, repo.name, issue)),
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
                if (res.statusCode! >= 400) {
                    console.log('Error!');
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

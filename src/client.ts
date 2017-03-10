import https = require('https');

type Issue = GitHubAPI.Issue;
type PR = GitHubAPI.Issue;
type IssueOrPR = Issue | PR;

function path(...parts: (string | number)[]) {
    return parts.map(encodeURIComponent).join('/');
}

export default class GithubAPIClient {
    constructor(public owner: string, public repo: string) {
    }

    public addLabels(issue: IssueOrPR, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#add-labels-to-an-issue
        this.exec(
            "POST",
            path('repos', this.owner, this.repo, 'issues', issue.number, 'labels'),
            JSON.stringify(labels)
        );
    }

    public removeLabels(issue: IssueOrPR, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#remove-a-label-from-an-issue
        for (const label of labels) {
            this.exec(
                "DELETE",
                path('repos', this.owner, this.repo, 'issues', 'label', label)
            );
        }
    }

    public setLabels(issue: IssueOrPR, labels: string[]) {
        // https://developer.github.com/v3/issues/labels/#replace-all-labels-for-an-issue
        this.exec(
            "PUT",
            path('repos', this.owner, this.repo, 'issues', issue.number, 'labels'),
            JSON.stringify(labels)
        );
    }

    private exec(method: string, path: string, body?: string | undefined) {
        const req = https.request({
            method,
            path,
            headers: {
                "user-agent": "RyanCavanaugh/idembot"
            },
            hostname: "https://api.github.com/",
        });
        if (body !== undefined) {
            req.write(body);
        }
        req.end();
    }
}

import * as Wrapped from './github';

export interface CommandLineOptions {
    dry: boolean;
    backport: boolean;
    ruleNames: string[];
    cacheRoot: string;
}

export interface IssueFilter {
    openOnly?: boolean;
}

export interface PullRequestFilter {
    openOnly?: boolean;
}

export interface RepoOptions {
    issueFilter?: IssueFilter;
    prFilter?: PullRequestFilter;
}

export interface SetupOptions {
    repos: (GitHubAPI.RepoReference & RepoOptions)[];
    rules: {
        issues?: {
            [key: string]: (issue: Wrapped.Issue) => void | Promise<any>;
        };
        pullRequests?: {
            [key: string]: (issue: Wrapped.PullRequest) => void | Promise<any>;
        };
        issuesAndPullRequests?: {
            [key: string]: (issue: Wrapped.IssueOrPullRequest) => void | Promise<any>;
        };
    }
}


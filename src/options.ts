import * as Wrapped from "./github";

export type ParsedCommandLineOptions = BaseParsedCommandLineOptions & (QueriesOptions | SingleOptions);

export interface BaseParsedCommandLineOptions {
    dry: boolean;
    ruleNames: string[];
    cacheRoot: string;
}

export interface QueriesOptions {
    kind: "queries";
    queries: Query[];
}

export interface SingleOptions {
    kind: "single";
    single: {
        owner: string;
        name: string;
        id: string;
    };
}

export type Query = PRQuery | IssueQuery;

export interface BaseQuery {
    repo: string;
}

export interface PRQuery extends BaseQuery {
    kind: "prs";
    state: "open" | "closed" | "all";
    count: number | "all";
    sort: "created" | "updated" | "popularity" | "long-running";
    direction: "asc" | "desc";
}

export interface IssueQuery extends BaseQuery {
    kind: "issues";
    state: "open" | "closed" | "all";
    count: number | "all";
}

export interface SetupOptions {
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
    };
}

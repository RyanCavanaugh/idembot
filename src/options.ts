import * as Wrapped from './github';

export interface CommandLineOptions {
    dry: boolean;
    backport: boolean;
    ruleNames: string[];
    cacheRoot: string;
}

export interface SetupOptions {
    repos: GitHubAPI.RepoReference[];
    rules: {
        [key: string]: (issue: Wrapped.Issue) => void | Promise<any>;
    }
}


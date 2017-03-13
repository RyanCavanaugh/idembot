import * as Wrapped from './github';

export interface CommandLineOptions {
    dry: boolean;
}

export interface SetupOptions {
    repos: GitHubAPI.RepoReference[];
    rules: {
        [key: string]: (issue: Wrapped.Issue) => void | Promise<any>;
    }
}


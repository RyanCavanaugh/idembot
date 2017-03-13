export interface CommandLineOptions {
    dry: boolean;
}

export interface SetupOptions {
    repos: GitHubAPI.RepoReference[];
    rules: {
        [key: string]: (issue: GitHubAPI.Issue) => void | Promise<any>;
    }
}


import Client from './client';

function parseDate(s: string): Date;
function parseDate(s: string | null): Date | null;
function parseDate(s: string | null): Date | null {
    if (s === null) return null;
    return new Date(s);
}

export class User {
    constructor(private client: Client, private originalData: GitHubAPI.User) {
    }
    public update(data: GitHubAPI.User) {

    }
}

export class Issue {
    /** This is the actual user-facing number */
    readonly number: string;
    /** Title */
    readonly title: string;
    /** The main body of the issue */
    readonly body: string;
    /** State can be "open" or "closed" */
    readonly state: "open" | "closed";
    /** Whether the issue has been locked or not */
    readonly locked: boolean;

    /** When this issue was created */
    readonly created_at: Date;
    /** When this issue was last updated */
    readonly updated_at: Date;
    /** When this issue was closed, if it's closed */
    readonly closed_at: Date | null;

    /** The labels this issue has */
    readonly labels: ReadonlyArray<Label>;

    /** The author of this issue */
    readonly user: User;

    constructor(private client: Client, private originalData: GitHubAPI.Issue) {
        // Copy some fields
        Object.assign(this, {
            number: originalData.number.toString(),
            title: originalData.title,
            body: originalData.body,
            state: originalData.state,
            locked: originalData.locked
        });

        this.created_at = parseDate(originalData.created_at);
        this.updated_at = parseDate(originalData.updated_at);
        this.closed_at = parseDate(originalData.closed_at);

        this.user = client.getUser(originalData.user.login);
    }

    assignee: User | null;
    assignees: User[];
    // milestone: Milestone | null;

    // Sometimes appears
    // repository?: Repository;

    pull_request?: {
        url: string;
        html_url: string;
        diff_url: string;
        patch_url: string;
        body: string;
    }

}
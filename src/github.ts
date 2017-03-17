import Client from './client';
import WeakStringMap from './weak-string-map';
import { addAction } from './actionRunner';
import moment = require('moment');

import { IAction, Labels, Comments, Issues } from './action';

function parseDate(s: string): moment.Moment;
function parseDate(s: string | null): moment.Moment | null;
function parseDate(s: string | null): moment.Moment | null {
    if (s === null) return null;
    return moment(new Date(s));
}

function parseRepoReference(url: string) {
    // https://api.github.com/repos/octocat/Hello-World/something
    const regex = /^https:\/\/[^\/]+\/repos\/([^\/]+)\/([^\/]+)/;
    const match = regex.exec(url);
    if (match == null) {
        throw new Error(`Repository URL was in an unexpected format: ${url}`);
    }
    return Repository.create(match[1], match[2]);
}

export class User {
    readonly login: string;

    constructor(private client: Client, private originalData: GitHubAPI.User) {
        this.update(originalData);
    }
    public update(data: GitHubAPI.User) {
        Object.assign(this, {
            login: data.login
        });
    }
}

export class Label {
    readonly name: string;
    readonly color: string;
    constructor(private client: Client, private originalData: GitHubAPI.Label) {
        this.update(originalData);
    }

    update(data: GitHubAPI.Label) {
        Object.assign(this, { name: data.name, color: data.color });
    }
}

export class Comment {
    readonly id: number;
    readonly user: User;
    readonly created_at: moment.Moment;
    readonly updated_at: moment.Moment;
    readonly body: string;
    readonly repository: Repository;

    constructor(private client: Client, private originalData: GitHubAPI.IssueComment) {
        this.update(originalData);
    }

    update(data: GitHubAPI.IssueComment) {
        Object.assign(this, {
            id: data.id,
            user: this.client.getUserSync(data.user),
            created_at: parseDate(data.created_at),
            updated_at: parseDate(data.updated_at),
            body: data.body,
            repository: parseRepoReference(data.issue_url)
        });
    }
}

export class Milestone {
    /** Internal milestone id */
    readonly id: number;
    /** This is the actual user-facing number */
    readonly number: number;

    /** Title  */
    readonly title: string;
    /** Description  */
    readonly description: string;
    /** State can be "open" or "closed" */
    readonly state: "open" | "closed";

    /** Who created this milestone */
    readonly creator: User;

    /** When this milestone was created */
    readonly created_at: moment.Moment;
    /** When this milestone was last updated */
    readonly updated_at: moment.Moment;
    /** When this milestone is due, if applicable */
    readonly due_on: moment.Moment | null;
    /** When this milestone was closed, if applicable */
    readonly closed_at: moment.Moment | null;

    constructor(private client: Client, private originalData: GitHubAPI.Milestone) {
        Object.assign(this, {
            id: originalData.id,
            number: originalData.number,
            title: originalData.title,
            description: originalData.description,
            state: originalData.state
        });

        this.creator = client.getUserSync(originalData.creator);

        this.created_at = parseDate(originalData.created_at);
        this.updated_at = parseDate(originalData.updated_at);
        this.closed_at = parseDate(originalData.closed_at);
        this.due_on = parseDate(originalData.closed_at);
    }
}

export class Repository {
    private static cache = new WeakStringMap<Repository>();
    public static create(owner: string, name: string) {
        const key = owner + '/' + name;
        const result = Repository.cache.get(key);
        if (result === undefined) {
            const repo = new Repository(owner, name);
            Repository.cache.set(key, repo);
            return repo;
        }
        return result;
    }
    constructor(public readonly owner: string, public readonly name: string) {
    }
}

export class Issue {
    /** This is the actual user-facing number */
    readonly number: number;
    /** Title */
    readonly title: string;
    /** The main body of the issue */
    readonly body: string;
    /** State can be "open" or "closed" */
    readonly state: "open" | "closed";
    /** Whether the issue has been locked or not */
    readonly locked: boolean;

    /** When this issue was created */
    readonly created_at: moment.Moment;
    /** When this issue was last updated */
    readonly updated_at: moment.Moment;
    /** When this issue was closed, if it's closed */
    readonly closed_at: moment.Moment | null;

    /** The labels this issue has */
    readonly labels: ReadonlyArray<Label>;

    /** The author of this issue */
    readonly user: User;

    /** A list, possibly empty, of who is assigned to this issue */
    readonly assignees: ReadonlyArray<User>;

    /** A milestone, if one is assigned */
    readonly milestone: Milestone | null;

    readonly isPullRequest: boolean;

    readonly repository: Repository;

    /** Returns a string like 'Microsoft/TypeScript#14' */
    get fullName(): string {
        return `${this.repository.owner}/${this.repository.name}#${this.number}`
    }

    constructor(private client: Client, private originalData: GitHubAPI.Issue) {
        // Copy some fields
        Object.assign(this, {
            number: originalData.number,
            title: originalData.title,
            body: originalData.body,
            state: originalData.state,
            locked: originalData.locked
        });

        this.repository = parseRepoReference(originalData.repository_url);

        // Parse some dates
        this.created_at = parseDate(originalData.created_at);
        this.updated_at = parseDate(originalData.updated_at);
        this.closed_at = parseDate(originalData.closed_at);

        // Intern some instances
        this.user = client.getUserSync(originalData.user);
        this.labels = originalData.labels.map(l => client.getLabelSync(l));
        this.assignees = originalData.assignees.map(user => client.getUserSync(user));

        // Set the PR flag
        this.isPullRequest = !!originalData.pull_request;
    }

    update() {
        // TODO: impl
    }

    async getComments(): Promise<Comment[]> {
        return await this.client.getIssueComments(this);
    }

    /**
    * Adds a label to an issue or PR.
    */
    addLabel(...labels: string[]) {
        return addAction(new Labels.Add(this, labels));
    }
    /**
     * Adds labels to an issue or PR.
     */
    addLabels(labels: string[]) {
        return addAction(new Labels.Add(this, labels));
    }
    /**
     * Deletes a label from an issue.
     */
    removeLabel(...labels: string[]) {
        return addAction(new Labels.Remove(this, labels));
    }
    /**
     * Deletes labels from an issue.
     */
    removeLabels(labels: string[]) {
        return addAction(new Labels.Remove(this, labels));
    }
    /**
     * Sets, exactly, which labels are on an issue
     */
    setLabels(...labels: string[]) {
        return addAction(new Labels.Set(this, labels));
    }

    /**
     * Returns true if this issue has the specified label
     */
    hasLabel(labelName: string | Label) {
        const name = typeof labelName === 'string' ? labelName : labelName.name;
        return this.labels.some(l => l.name === name);
    }

    /**
     * Adds or updates a comment with the specified slug to the issue
     */
    addComment(slug: string, body: string) {
        return addAction(new Comments.Add(this, slug, body));
    }

    lock() {
        return addAction(new Issues.Lock(this));
    }

    unlock() {
        return addAction(new Issues.Unlock(this));
    }

    close() {
        return addAction(new Issues.Close(this));
    }

    reopen() {
        return addAction(new Issues.Reopen(this));
    }
}

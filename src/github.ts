import sleep = require('sleep-promise');

import * as client from './client';
import WeakStringMap from './weak-string-map';
import { addAction } from './actionRunner';
import moment = require('moment');
import { Cache } from './cache';

import * as Actions from './action';
import path from './build-path';

export function useCache(c: Cache) {
    cache = c;
}

let cache: Cache | undefined = undefined;

function parseDate(s: string): moment.Moment;
function parseDate(s: string | null): moment.Moment | null;
function parseDate(s: string | null): moment.Moment | null {
    if (s === null) return null;
    return moment(new Date(s));
}

export function parseRepoReference(url: string) {
    // https://api.github.com/repos/octocat/Hello-World/something
    const regex = /^https:\/\/[^\/]+\/repos\/([^\/]+)\/([^\/]+)/;
    const match = regex.exec(url);
    if (match == null) {
        throw new Error(`Repository URL was in an unexpected format: ${url}`);
    }
    return Repository.create(match[1], match[2]);
}

export class User {
    private static pool = createPool<User, GitHubAPI.User, string>({
        fetchData: async (login) => {
            return JSON.parse(await client.exec('GET', path('users', login)))
        },
        construct: data => new User(data),
        keyFromData: data => data.login
    });
    static async fromLogin(login: string): Promise<User> {
        return await User.pool.fromKey(login);
    }
    static fromData(data: GitHubAPI.User): User {
        return User.pool.fromData(data);
    }

    readonly login: string;

    static getCacheKey(login: string) {
        return `users/${login}`;
    }

    getCacheKey() {
        return User.getCacheKey(this.login);
    }

    private constructor(private originalData: GitHubAPI.User) {
        this.update(originalData);
    }
    public update(data: GitHubAPI.User) {
        Object.assign(this, {
            login: data.login
        });
    }
}

export class Label {
    private static pool = createPool<Label, [GitHubAPI.RepoReference, GitHubAPI.Label], [GitHubAPI.RepoReference, string]>({
        fetchData: async (key) => {
            return JSON.parse(await client.exec('GET', path('repos', key[0].owner, key[0].name, 'labels', key[1])));
        },
        construct: data => new Label(data[0], data[1]),
        keyFromData: data => [data[0], data[1].name]
    });

    static fromData(repo: GitHubAPI.RepoReference, data: GitHubAPI.Label) {
        return Label.pool.fromData([repo, data]);
    }

    readonly name: string;
    readonly color: string;
    private constructor(public repo: GitHubAPI.RepoReference, data: GitHubAPI.Label) {
        this.update([repo, data]);
    }

    update(data: [GitHubAPI.RepoReference, GitHubAPI.Label]) {
        Object.assign(this, { name: data[1].name, color: data[1].color });
    }
}

export class IssueComment {
    readonly id: number;
    readonly user: User;
    readonly created_at: moment.Moment;
    readonly updated_at: moment.Moment;
    readonly body: string;
    readonly repository: Repository;

    static fromData(originalData: GitHubAPI.IssueComment, issue: Issue) {
        return new IssueComment(originalData, issue);
    }

    private constructor(private originalData: GitHubAPI.IssueComment, public issue: Issue) {
        this.update(originalData);
    }

    update(data: GitHubAPI.IssueComment) {
        Object.assign(this, {
            id: data.id,
            user: User.fromData(data.user),
            created_at: parseDate(data.created_at),
            updated_at: parseDate(data.updated_at),
            body: data.body,
            repository: parseRepoReference(data.issue_url)
        });
    }

    async getReactions(): Promise<GitHubAPI.Reaction[]> {
        // GET /repos/:owner/:repo/issues/comments/:id/reactions
        const reactions = await client.fetchIssueCommentReactions(parseRepoReference(this.originalData.url), this.id);
        return reactions;
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

    constructor(private originalData: GitHubAPI.Milestone) {
        Object.assign(this, {
            id: originalData.id,
            number: originalData.number,
            title: originalData.title,
            description: originalData.description,
            state: originalData.state
        });

        this.creator = User.fromData(originalData.creator);

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

    public get reference(): GitHubAPI.RepoReference {
        return { name: this.name, owner: this.name };
    }

    private constructor(public readonly owner: string, public readonly name: string) {
    }
}

export abstract class IssueOrPullRequest {
    static async fromData(data: GitHubAPI.Issue): Promise<Issue | PullRequest> {
        if (data.pull_request) {
            return await PullRequest.fromReference(parseRepoReference(data.url), data.number);
        } else {
            return await Issue.fromIssueData(data);
        }
    }

    static getCacheKey(repo: GitHubAPI.RepoReference, number: number, isPR: boolean) {
        return IssueOrPullRequest.getCacheKeyBasePath(repo, number, isPR) + '.json';
    }

    static getCommentsCacheKey(repo: GitHubAPI.RepoReference, number: number, isPR: boolean) {
        return IssueOrPullRequest.getCacheKeyBasePath(repo, number, isPR) + '.comments.json';
    }

    static getCacheKeyBasePath(repo: GitHubAPI.RepoReference, number: number, isPR: boolean) {
        const kind = isPR ? "pull_requests" : "issues";
        // 0000, 1000, 2000, etc
        const thousands = `${Math.floor(number / 1000)}000`;
        // e.g. Microsoft/TypeScript/issues/3000/3123
        return `${repo.owner}/${repo.name}/${kind}/${thousands}/${number}`;
    }

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

    readonly html_url: string;

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

    abstract readonly isPullRequest: boolean;

    readonly repository: Repository;

    protected constructor(private originalData: GitHubAPI.Issue) {
        // Copy some fields
        Object.assign(this, {
            number: originalData.number,
            title: originalData.title,
            body: originalData.body,
            state: originalData.state,
            locked: originalData.locked,
            html_url: originalData.html_url
        });

        this.repository = parseRepoReference(originalData.url);

        // Parse some dates
        this.created_at = parseDate(originalData.created_at);
        this.updated_at = parseDate(originalData.updated_at);
        this.closed_at = parseDate(originalData.closed_at);

        // Intern some instances
        this.user = User.fromData(originalData.user);
        this.labels = originalData.labels ? originalData.labels.map(l => Label.fromData(this.repository, l)) : [];
        this.assignees = originalData.assignees.map(user => User.fromData(user));
    }

    /** Returns a string like 'Microsoft/TypeScript#14' */
    get fullName(): string {
        return `${this.repository.owner}/${this.repository.name}#${this.number}`
    }

    update() {
        // TODO: impl
    }

    async getComments(): Promise<IssueComment[]> {
        const data = await client.fetchIssueComments(this);
        return data.map(raw => IssueComment.fromData(raw, this));
    }

    /**
    * Adds a label to an issue or PR.
    */
    addLabel(...labels: string[]) {
        return addAction(new Actions.Labels.Add(this, labels));
    }
    /**
     * Adds labels to an issue or PR.
     */
    addLabels(labels: string[]) {
        return addAction(new Actions.Labels.Add(this, labels));
    }
    /**
     * Deletes a label from an issue.
     */
    removeLabel(...labels: string[]) {
        return addAction(new Actions.Labels.Remove(this, labels));
    }
    /**
     * Deletes labels from an issue.
     */
    removeLabels(labels: string[]) {
        return addAction(new Actions.Labels.Remove(this, labels));
    }
    /**
     * Sets, exactly, which labels are on an issue
     */
    setLabels(...labels: string[]) {
        return addAction(new Actions.Labels.Set(this, labels));
    }

    /**
     * Shortcut method for setting/clearing labels with an object literal, e.g.
     * issue.setHasLabels({
     *  "Needs Info": false,
     *  "Ready for Triage": true
     * }).
     * You can specify a null value to cause nothing to happen either way
     */
    setHasLabels(labelMap: { [key: string]: boolean | null }) {
        for (const key of Object.keys(labelMap)) {
            const value = labelMap[key];
            if (value === true) {
                this.addLabel(key);
            } else if (value === false) {
                this.removeLabel(key);
            }
        }
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
        return addAction(new Actions.Comments.Add(this, slug, body));
    }

    lock() {
        return addAction(new Actions.Issues.Lock(this));
    }

    unlock() {
        return addAction(new Actions.Issues.Unlock(this));
    }

    close() {
        return addAction(new Actions.Issues.Close(this));
    }

    reopen() {
        return addAction(new Actions.Issues.Reopen(this));
    }
}

export class Issue extends IssueOrPullRequest {
    static fromData(data: GitHubAPI.Issue): never {
        throw new Error("Don't call me");
    }

    static fromIssueData(data: GitHubAPI.Issue) {
        return new Issue(data);
    }

    readonly isPullRequest: boolean = false;

    private constructor(data: GitHubAPI.Issue) {
        super(data);
    }
}

export type StatusSummary = "pass" | "fail" | "pending";
export class PullRequest extends IssueOrPullRequest {
    static async fromReference(repo: GitHubAPI.RepoReference, number: number): Promise<PullRequest> {
        return new PullRequest(await client.fetchPR(repo, number), await client.fetchIssue(repo, number));
    }

    static fromData(data: GitHubAPI.Issue): never {
        throw new Error("Don't call me");
    }

    static getPRCacheKey(repo: GitHubAPI.RepoReference, number: number, isPR: boolean) {
        return IssueOrPullRequest.getCacheKeyBasePath(repo, number, isPR) + 'pr.json';
    }

    // TODO interning
    static async fromIssueAndPRData(prData: GitHubAPI.PullRequest, issueData: GitHubAPI.Issue): Promise<PullRequest> {
        const issueKey = this.getCacheKey(parseRepoReference(prData.url), prData.number, true);
        const prKey = this.getPRCacheKey(parseRepoReference(prData.url), prData.number, true);

        if (cache) {
            const prCached = await cache.load(prKey);
            const issueCached = await cache.load(issueKey);
            if (prCached.exists && issueCached.exists) {
                const cachedPR = prCached.content as GitHubAPI.PullRequest;
                const cachedIssue = issueCached.content as GitHubAPI.Issue;
                if (cachedPR.updated_at === prData.updated_at) {
                    return PullRequest.fromPullRequestData(cachedPR, cachedIssue);
                }
            }
        }

        return PullRequest.fromPullRequestData(prData, issueData);
    }

    // TODO interning
    static fromPullRequestData(prData: GitHubAPI.PullRequest, issueData: GitHubAPI.Issue) {
        return new PullRequest(prData, issueData);
    }

    head: GitHubAPI.Commit;
    merge_commit_sha: string;
    merged: boolean;
    mergeable: boolean | null;
    mergeable_state: GitHubAPI.MergeableState;
    
    comments: number;
    commits: number;
    additions: number;
    deletions: number;
    changed_files: number;

    readonly isPullRequest: boolean = true;

    private constructor(prData: GitHubAPI.PullRequest, issueData: GitHubAPI.Issue) {
        super(issueData);

        Object.assign(this, {
            merge_commit_sha: prData.merge_commit_sha,
            merged: prData.merged,
            mergeable: prData.mergeable,
            mergeable_state: prData.mergeable_state,
            comments: prData.comments,
            commits: prData.commits,
            additions: prData.additions,
            deletions: prData.deletions,
            changed_files: prData.changed_files,
            head: prData.head
        });
    }

    public async getStatusSummary(): Promise<GitHubAPI.StatusSummary> {
        // GET /repos/:owner/:repo/commits/:ref/status
        return (await client.fetchRefStatusSummary(this.repository.reference, this.head.sha)).state;
    }

    public async getReviews(): Promise<GitHubAPI.PullRequestReview[]> {
        return await client.fetchPRReviews(this.repository.reference, this.number);
    }

    public async getMergeableState(): Promise<boolean | null> {
        if (this.merged) {
            return null;
        }

        var retryCounter = 5;
        while (this.mergeable === null && retryCounter > 0) {
            const newData = await client.fetchPR(this.repository.reference, this.number);;
            if (newData.mergeable === null) {
                console.log(`Sleep 3 seconds and try to get real mergeable state of ${this.number}`);
                await sleep(3000);
                retryCounter--;
            } else {
                this.mergeable = newData.mergeable;
                break;
            }
        }
        return this.mergeable;
    }
}


interface PoolSettings<KeyType, DataType, InstanceType> {
    /** Class constructor for creating a new InstanceType */
    construct: (data: DataType) => InstanceType;
    /** Fetch a key from the data type */
    keyFromData(data: DataType): KeyType;
    /** Fetch the data for this based on the key */
    fetchData(key: KeyType): Promise<DataType>;
    /** Construct a string representation of a key */
    keyToString?(key: KeyType): string;
    /** Construct a string representation of a key */
    keyToCacheKey?(key: KeyType): string;
}

interface Pool<InstanceType, DataType, KeyType> {
    fromKey(key: KeyType): Promise<InstanceType>;
}

function createPool<InstanceType extends { update(d: DataType): void }, DataType, KeyType>(settings: PoolSettings<KeyType, DataType, InstanceType>) {
    const pool = new WeakStringMap<InstanceType>();
    settings.keyToString = settings.keyToString || ((k: any) => k);
    settings.keyToCacheKey = settings.keyToCacheKey || ((k: any) => k);

    return ({
        fromKey: async function (key: KeyType) {
            const keyString = settings.keyToString!(key);
            const extant = pool.get(keyString);
            if (extant) return extant;

            const cacheKey = settings.keyToCacheKey!(key);
            const cached = cache && await cache.load(cacheKey);
            if (cached && cached.exists) {
                return settings.construct(cached.content);
            }

            const now = new Date();
            const data = await settings.fetchData(key);
            cache && cache.save(data, cacheKey, now);
            return settings.construct(data);
        },
        fromData: function(data: DataType) {
            const keyString = settings.keyToString!(settings.keyFromData(data));
            const extant = pool.get(keyString);
            if (extant) {
                extant.update(data);
                return extant;
            }
            const result = settings.construct(data);
            pool.set(keyString, result);
            return result;
            
        }
    });
}

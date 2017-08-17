/** Not actually part of the GitHub API */
export interface RepoReference {
    readonly owner: string;
    readonly name: string;
}

export interface Repository {
    id: number;
    owner: User;
    name: string;
    full_name: string;
    description: string;
    private: boolean;
    fork: boolean;
    url: string;
    // Tons of other fields omitted for now...
}

// https://developer.github.com/v3/reactions/#reaction-types
export type ReactionType = "+1" | "-1" | "laugh" | "confused" | "heart" | "hooray";
export interface Reaction {
    id: number;
    user: User;
    content: ReactionType;
    created_at: string;
}

// TODO: Remainder of reaction API

// https://developer.github.com/v3/issues/#get-a-single-issue
export interface Issue {
    url: string;
    repository_url: string;
    labels_url: string;
    comments_url: string;
    events_url: string;
    html_url: string;
    id: number;
    number: number;
    title: string;
    body: string;
    user: User;
    labels: Label[] | undefined;
    state: "open" | "closed";
    locked: boolean;
    assignee: User | null;
    assignees: User[];
    milestone: Milestone | null;
    comments: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;

    // Sometimes (!) appears
    repository?: Repository;

    pull_request?: {
        url: string;
        html_url: string;
        diff_url: string;
        patch_url: string;
    };
}

/**
 * When the GitHub API lists PRs, it includes some (but not all) PR-specific fields.
 */
export interface PullRequestFromList extends Issue {
    merged_at: string | null;
    merge_commit_sha: string;

    url: string;
    repository_url: string;
    labels_url: string;
    comments_url: string;
    events_url: string;
    html_url: string;
    id: number;
    number: number;
    title: string;
    body: string;
    user: User;
    state: "open" | "closed";
    locked: boolean;
    assignee: User | null;
    assignees: User[];
    milestone: Milestone | null;
    comments: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;

    // Sometimes (!) appears
    repository?: Repository;

    pull_request?: {
        url: string;
        html_url: string;
        diff_url: string;
        patch_url: string;
    };
}

export interface PullRequestReview {
    id: number;
    user: User;
    body: string;
    commit_id: string;
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED";
    submitted_at: string;
    html_url: string;
    pull_request_url: string;
}

/**
 * dirty: Merge conflict. Merging will be blocked
 * unknown: Mergeability was not checked yet. Merging will be blocked
 * blocked: Blocked by a failing/missing required status check.
 * behind: Head branch is behind the base branch.
 *         Only if required status checks is enabled but loose policy is not.
 *         Merging will be blocked.
 * unstable: Failing/pending commit status that is not part of the required status checks.
 *           Merging is allowed (yellow box).
 * has_hooks: This is for Enterprise only, if a repo has custom pre-receive hooks. Merging is allowed (green box).
 * clean: No conflicts, everything good. Merging is allowed (green box).
 */
export type MergeableState = "dirty" | "unknown" | "blocked" | "behind" | "unstable" | "has_hooks" | "clean";
export interface PullRequest extends PullRequestFromList {
    merged: boolean;
    /** Mergeable is null if it's not computed yet */
    mergeable: boolean | null;
    /** Allegedly undocumented but has been around for 5 years */
    mergeable_state: MergeableState;
    merged_by?: User;
    comments: number;
    commits: number;
    additions: number;
    deletions: number;
    changed_files: number;
    maintainer_can_modify: boolean;
    statuses_url: string;
    // TODO: Spec out
    head: Commit;
    base: Commit;

    review_comments: number;
}

export interface PullRequestFile {
    sha: string;
    filename: string;
    status: "added" | "modified" | "removed";
    additions: number;
    deletions: number;
    changes: number;
}

// https://developer.github.com/v3/pulls/#list-commits-on-a-pull-request
export interface PullRequestCommit {
    url: string;
    sha: string;
    commit: {
        author: Committer;
        committer: Committer;
        message: string;
    };
    author: User;
    committer: User;
    parents: Array<{
        url: string;
        sha: string;
    }>;
}

export interface Committer {
    name: string;
    email: string;
    date: string;
}

export interface Commit {
    label: string;
    ref: string;
    sha: string;
    user: User;
    repo: Repository;
}

export type StatusSummary = "success" | "pending" | "failure" | "error";
/// https://developer.github.com/v3/repos/statuses/
export interface CombinedStatus {
    state: StatusSummary;
    sha: string;
    total_count: number;
}

// e.g., from:
// https://api.github.com/repos/DefinitelyTyped/DefinitelyTyped/statuses/210d1978139c51386a145af2c36440b3967535e9
export interface CommitStatusesElement {
    url: string;
    id: number;
    state: StatusSummary;
    description: string;
    target_url: string;
    context: string;
    created_at: string;
    updated_at: string;
    creator: User;
}

export interface User {
    login: string;
    id: number;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: "User";
    site_admin: boolean;
}

export interface Label {
    url: string;
    name: string;
    color: string;
}

export interface Milestone {
    url: string;
    html_url: string;
    labels_url: string;
    id: number;
    number: number;
    title: string;
    description: string;
    creator: User;
    open_issues: number;
    closed_issues: number;
    state: "open" | "closed";
    created_at: string;
    updated_at: string;
    due_on: string | null;
    closed_at: string | null;
}

export type IssueEvent =
    IssueClosedEvent |
    IssueReopenedEvent |
    IssueSubscribedEvent |
    IssueMergedEvent |
    IssueReferencedEvent |
    IssueMentionedEvent |
    IssueAssignedEvent |
    IssueUnassignedEvent |
    IssueLabeledEvent |
    IssueUnlabeledEvent |
    IssueMilestonedEvent |
    IssueDemilestonedEvent |
    IssueRenamedEvent |
    IssueLockedEvent |
    IssueUnlockedEvent |
    IssueHeadRefDeletedEvent |
    IssueHeadRefRestoredEvent;

export interface IssueEventBase {
    id: number;
    url: string;
    actor: User | null;
    commit_id: string | null;
    commit_url: string | null;
    created_at: string;
}

export interface IssueClosedEvent extends IssueEventBase {
    event: "closed";
}

export interface IssueReopenedEvent extends IssueEventBase {
    event: "reopened";
}

export interface IssueSubscribedEvent extends IssueEventBase {
    event: "subscribed";
}

export interface IssueMergedEvent extends IssueEventBase {
    event: "merged";
}

export interface IssueReferencedEvent extends IssueEventBase {
    event: "referenced";
}

export interface IssueMentionedEvent extends IssueEventBase {
    event: "mentioned";
}

export interface IssueLabeledEvent extends IssueEventBase {
    event: "labeled";
    // N.B.: Not a Label! Lacks 'url'
    label: { name: string; color: string };
}

export interface IssueAssignedEvent extends IssueEventBase {
    event: "assigned";
    assigner: User;
    asignee: User;
}

export interface IssueUnassignedEvent extends IssueEventBase {
    event: "unassigned";
    assigner: User;
    asignee: User;
}

export interface IssueUnlabeledEvent extends IssueEventBase {
    event: "unlabeled";
    // N.B.: Not a Label! Lacks 'url'
    label: { name: string; color: string };
}

export interface IssueMilestonedEvent extends IssueEventBase {
    event: "milestoned";
    // N.B.: Not a Milestone! Only includes 'title'
    milestone: { title: string };
}

export interface IssueDemilestonedEvent extends IssueEventBase {
    event: "demilestoned";
    // N.B.: Not a Milestone! Only includes 'title'
    milestone: { title: string };
}

export interface IssueRenamedEvent extends IssueEventBase {
    event: "renamed";
    from: string;
    to: string;
}

export interface IssueLockedEvent extends IssueEventBase {
    event: "locked";
}

export interface IssueUnlockedEvent extends IssueEventBase {
    event: "unlocked";
}

export interface IssueHeadRefDeletedEvent extends IssueEventBase {
    event: "head_ref_deleted";
}

export interface IssueHeadRefRestoredEvent extends IssueEventBase {
    event: "head_ref_restored";
}

export interface IssueComment {
    url: string;
    html_url: string;
    issue_url: string;
    id: number;
    user: User;
    created_at: string;
    updated_at: string;
    body: string;
}

export interface Project {
    id: number;
    name: string;
    body: string;
    number: number;
    state: string;
}

export interface ProjectColumn {
    id: number;
    name: string;
}

export interface ProjectColumnCard {
    id: number;
    note: string | null;
    // e.g. https://api.github.com/repos/DefinitelyTyped/DefinitelyTyped/issues/17902
    content_url: string;
}

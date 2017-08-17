import https = require("https");

import path from "./build-path";
import {
    Issue, IssueComment, IssueOrPullRequest, parseBasicRepoReference, ProjectCard, ProjectColumn, PullRequest,
} from "./github";
import * as api from "./github-api";
import { Query } from "./options";

export interface IssuePageFetchResult {
    issues: api.Issue[];
    fetchMore?(): Promise<IssuePageFetchResult>;
}

let oauthToken: string;

export function initialize(_oauthToken: string): void {
    oauthToken = _oauthToken;
}

let me: string | undefined;
export async function getMyLogin(): Promise<string> {
    if (me === undefined) {
        me = (await parseGet("/user") as api.User).login;
    }
    return me;
}

export async function addLabels(issue: Issue, labels: ReadonlyArray<string>): Promise<void> {
    // https://developer.github.com/v3/issues/labels/#add-labels-to-an-issue
    const body = JSON.stringify(labels);
    await exec(
        "POST",
        path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number, "labels"),
        { body },
    );
}

export async function removeLabels(issue: Issue, labels: ReadonlyArray<string>): Promise<void> {
    // https://developer.github.com/v3/issues/labels/#remove-a-label-from-an-issue
    for (const label of labels) {
        await exec(
            "DELETE",
            path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number, "labels", label),
        );
    }
}

export async function setLabels(issue: Issue, labels: ReadonlyArray<string>): Promise<void> {
    // https://developer.github.com/v3/issues/labels/#replace-all-labels-for-an-issue
    const body = JSON.stringify(labels);
    await exec(
        "PUT",
        path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number, "labels"),
        { body },
    );
}

export async function lockIssue(issue: Issue): Promise<void> {
    await exec("PUT",
        path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number, "lock"),
        { body: "" },
    );
}

export async function unlockIssue(issue: Issue): Promise<void> {
    await exec("DELETE",
        path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number, "lock"),
    );
}

export async function closeIssue(issue: Issue): Promise<void> {
    const body = JSON.stringify({ state: "closed" });
    await exec("PATCH",
        path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number),
        { body },
    );
}

export async function reopenIssue(issue: Issue): Promise<void> {
    const body = JSON.stringify({ state: "open" });
    await exec("PATCH",
        path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number),
        { body },
    );
}

export async function addComment(issue: Issue, body: string): Promise<void> {
    await exec("POST",
        path("repos", issue.repository.owner, issue.repository.name, "issues", issue.number, "comments"),
        { body: JSON.stringify({ body }) },
    );
}

export async function editComment(comment: IssueComment, body: string): Promise<void> {
    await exec("PATCH",
        path("repos", comment.repository.owner, comment.repository.name, "issues", "comments", comment.id),
        { body: JSON.stringify({ body }) },
    );
}

export interface IssuePageResult {
    page: api.Issue[];
    next?(): Promise<IssuePageResult>;
}

export async function fetchAllIssuesAndPRsRaw(repo: api.RepoReference): Promise<IssuePageResult> {
    return fetchPage(1);
    async function fetchPage(page: number): Promise<IssuePageResult> {
        // https://developer.github.com/v3/issues/#list-issues
        const queryString: any = {
            sort: "created",
            filter: "all",
            direction: "asc",
            per_page: 100,
            page,
        };

        const thisPage = await parseGet(path("repos", repo.owner, repo.name, "issues"), { queryString }) as api.Issue[];

        return {
            page: thisPage,
            next: thisPage.length === 100 ? (() => fetchPage(page + 1)) : undefined,
        };
    }
}

export async function fetchChangedIssuesRaw(repo: api.RepoReference): Promise<api.Issue[]> {
    // https://developer.github.com/v3/issues/#list-issues
    const queryString: any = {
        sort: "updated",
        filter: "all",
        direction: "desc",
        per_page: 100,
    };

    const page = await parseGet(path("repos", repo.owner, repo.name, "issues"), { queryString }) as api.Issue[];
    return page.filter((i) => !i.pull_request);
}

export async function runQuery(q: Query, callback: (item: PullRequest | Issue) => Promise<void>): Promise<void> {
    if (q.kind === "prs") {
        // https://developer.github.com/v3/pulls/#list-pull-requests
        let count = 0;
        let pageNumber = 1;
        const repo = parseBasicRepoReference(q.repo);
        while (true) {
            const queryString: any = {
                sort: q.sort,
                state: q.state,
                direction: q.direction,
                per_page: 100,
                page: pageNumber,
            };

            const ref = parseBasicRepoReference(q.repo);

            const page = await parseGet(path("repos", ref.owner, ref.name, "pulls"), { queryString }) as
                api.PullRequestFromList[];
            for (const item of page) {
                const pr = await PullRequest.fromReference(repo, item.number);
                await callback(pr);
                count++;
                if (count === q.count) return;
            }
            // Exhausted the query
            if (page.length < 100) return;
            pageNumber++;
        }
    } else {
        throw new Error("Other query kinds NYI");
    }
}

export function fetchChangedPRsRaw(repo: api.RepoReference): Promise<api.PullRequestFromList[]> {
    // https://developer.github.com/v3/pulls/#list-pull-requests
    const queryString: any = {
        sort: "updated",
        state: "all",
        direction: "desc",
        per_page: 100,
    };

    return parseGet(path("repos", repo.owner, repo.name, "pulls"), { queryString }) as
        Promise<api.PullRequestFromList[]>;
}

const ProjectsPreview = "application/vnd.github.inertia-preview+json";

export function fetchProjectColumns(projectId: number): Promise<api.ProjectColumn[]> {
    return parseGet(path("projects", projectId, "columns"), { preview: ProjectsPreview }) as
        Promise<api.ProjectColumn[]>;
}

export function fetchProjectColumnCards(columnId: number): Promise<api.ProjectColumnCard[]> {
    return parseGet(path("projects", "columns", columnId, "cards"), { preview: ProjectsPreview }) as
        Promise<api.ProjectColumnCard[]>;
}

export async function createProjectCard(columnId: number, issue: IssueOrPullRequest): Promise<void> {
    const body = JSON.stringify({ content_id: issue.id, content_type: "Issue" });
    await exec("POST", path("projects", "columns", columnId, "cards"), {
        preview: ProjectsPreview,
        body,
    });
}

export async function moveProjectCard(card: ProjectCard, targetColumn: ProjectColumn): Promise<void> {
    await exec("POST", path("projects", "columns", "cards", card.id, "moves"), {
        preview: ProjectsPreview,
        body: JSON.stringify({
            position: "bottom",
            column_id: targetColumn.columnId,
        }),
    });
}

export async function deleteProjectCard(card: ProjectCard): Promise<void> {
    await exec("DELETE", path("projects", "columns", "cards", card.id), {
        preview: ProjectsPreview,
    });
}

export async function fetchIssueComments(issue: Issue): Promise<api.IssueComment[]> {
    const raw = await execPaged(path(
        "repos", issue.repository.owner, issue.repository.name, "issues", issue.number, "comments"));
    return raw as api.IssueComment[];
}

export async function fetchPRCommits(issue: PullRequest): Promise<api.PullRequestCommit[]> {
    // https://developer.github.com/v3/pulls/#list-commits-on-a-pull-request
    const raw = await execPaged(path(
        "repos", issue.repository.owner, issue.repository.name, "pulls", issue.number, "commits"));
    return raw as api.PullRequestCommit[];
}

export async function fetchPRFiles(issue: PullRequest): Promise<api.PullRequestFile[]> {
    const raw = await execPaged(path(
        "repos", issue.repository.owner, issue.repository.name, "pulls", issue.number, "files"));
    return raw as api.PullRequestFile[];
}

export function fetchIssueCommentReactions(repo: api.RepoReference, commentId: number): Promise<api.Reaction[]> {
    // https://developer.github.com/v3/reactions/#list-reactions-for-an-issue-comment
    // GET /repos/:owner/:repo/issues/comments/:id/reactions
    return parseGet(path("repos", repo.owner, repo.name, "issues", "comments", commentId, "reactions")) as
        Promise<api.Reaction[]>;
}

export async function fetchPR(repo: api.RepoReference, number: number | string): Promise<api.PullRequest> {
    return parseGet(path("repos", repo.owner, repo.name, "pulls", number)) as Promise<api.PullRequest>;
}

export interface MergePrOptions {
    readonly title: string;
    readonly message: string;
    readonly sha: string;
}
export async function mergePR(pr: PullRequest, { title, message, sha }: MergePrOptions): Promise<void> {
    // https://developer.github.com/v3/pulls/#merge-a-pull-request-merge-button
    await exec("PUT", path("repos", pr.repository.owner, pr.repository.name, "pulls", pr.number, "merge"), {
        body: JSON.stringify({
            commit_title: title,
            commit_message: message,
            sha,
            merge_method: "squash",
        }),
    });
}

export function fetchIssue(repo: api.RepoReference, number: number | string): Promise<api.Issue> {
    return parseGet(path("repos", repo.owner, repo.name, "issues", number)) as Promise<api.Issue>;
}

export async function fetchPRReviews(repo: api.RepoReference, number: number): Promise<api.PullRequestReview[]> {
    const url = path("repos", repo.owner, repo.name, "pulls", number, "reviews");
    // https://developer.github.com/v3/pulls/reviews/#list-reviews-on-a-pull-request
    // GET /repos/:owner/:repo/pulls/:number/reviews
    try {
        return await parseGet(url, {
            preview: "application/vnd.github.black-cat-preview+json",
        }) as Promise<api.PullRequestReview[]>;
    } catch (e) {
        if (e instanceof ExecError && e.statusCode === 404) {
            // No reviews
            return [];
        }
        throw e;
    }
}

export async function fetchRefStatusSummary(repo: api.RepoReference, ref: string): Promise<api.CombinedStatus> {
    // https://developer.github.com/v3/repos/statuses/#get-the-combined-status-for-a-specific-ref
    // GET /repos/:owner/:repo/commits/:ref/status
    return parseGet(path("repos", repo.owner, repo.name, "commits", ref, "status")) as Promise<api.CombinedStatus>;
}

async function execPaged(path: string, perPage: number = 100): Promise<Array<{}>> {
    const result: Array<{}> = [];
    let pageNumber = 1;
    while (true) {
        console.log(`Fetch page ${pageNumber}...`);
        const qs = { page: pageNumber.toString(), per_page: perPage.toString() };
        const arr = await parseGet(path, { queryString: qs });
        if (!Array.isArray(arr)) {
            throw new Error("Didn't parse an array from a paged fetch");
        }
        result.push(...arr);
        if (arr.length < perPage) {
            return result;
        }
        pageNumber++;
    }
}

export interface ExecOptions {
    queryString?: { [key: string]: string };
    body?: string;
    preview?: string;
}

export class ExecError extends Error {
    constructor(message: string, readonly statusCode: number) {
        super(message);
    }
}

let lastRateLimit = -1; // starts off unknown
let lastRateLimitRemaining = -1;
export async function exec(
    method: "GET" | "PUT" | "POST" | "DELETE" | "PATCH",
    basePath: string,
    opts: ExecOptions = {},
    ): Promise<string> {
    const hostname = "api.github.com";
    const bodyStream = opts.body === undefined ? undefined : Buffer.from(opts.body);
    const path = getPathWithQuery(basePath, opts.queryString);
    console.log(`[${lastRateLimitRemaining} / ${lastRateLimit}] HTTPS: ${method} https://${hostname}${path}`);
    const headers = getHeaders(bodyStream, opts.preview);
    return new Promise<string>((resolve, reject) => {
        const req = https.request({ method, path, headers, hostname }, (res) => {
            // console.log('Headers: ' + JSON.stringify(res.headers, undefined, 2));
            lastRateLimit = parseIntFromHeader(res.headers["x-ratelimit-limit"]);
            lastRateLimitRemaining = parseIntFromHeader(res.headers["x-ratelimit-remaining"]);
            const { statusCode } = res;
            if (statusCode === undefined) {
                throw new Error();
            }
            if (statusCode >= 400) {
                reject(new ExecError(`Status code ${statusCode} returned from ${basePath}`, statusCode));
                return;
            }

            res.setEncoding("utf8");
            let data = "";
            res.on("data", (chunk) => {
                data = data + chunk;
            });
            res.on("end", () => {
                resolve(data);
            });
            res.on("error", (err) => {
                console.error("Connection Error!");
                console.error(err);
                reject(err);
            });
        });
        req.on("error", (e) => {
            console.error(e);
            reject(e);
        });
        if (bodyStream !== undefined) {
            req.write(bodyStream);
        }
        req.end();
    });
}

function parseIntFromHeader(header: string | string[]): number {
    if (typeof header !== "string")
        throw new Error();
    const int = Number.parseInt(header);
    if (Number.isNaN(int))
        throw new Error();
    return int;
}

function getPathWithQuery(basePath: string, queryString: { [key: string]: string } | undefined): string {
    let fullPath = basePath;
    if (queryString && Object.keys(queryString).length > 0) {
        const encoded = Object.keys(queryString).map((k) =>
            k + "=" + encodeURIComponent(queryString[k])).join("&");
        fullPath = fullPath + "?" + encoded;
    }
    return fullPath;
}

function getHeaders(bodyStream: Buffer | undefined, preview: string | undefined): { [key: string]: string | number } {
    const headers: { [key: string]: string | number } = {
        "User-Agent": "RyanCavanaugh idembot",
        "Accept": preview || "application/vnd.github.squirrel-girl-preview+json",
        "Authorization": `token ${oauthToken}`,
    };
    if (bodyStream !== undefined) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = bodyStream.length;
    }
    return headers;
}

async function parseGet(path: string, opts?: ExecOptions): Promise<{}> {
    return JSON.parse(await exec("GET", path, opts));
}

import * as client from "./client";

import { IssueComment, IssueOrPullRequest, Project, ProjectColumn, PullRequest } from "./github";

export type OnChangeHandler = (item: IssueOrPullRequest) => void;

// TODO: something useful here
export interface ActionExecuteInfo {} // tslint:disable-line no-empty-interface

export interface IAction {
    summary: string;
    onChanged(handler: OnChangeHandler): void;
}

export interface IActionImplementation extends IAction {
    execute(info: ActionExecuteInfo): Promise<void>;
}

export abstract class BaseAction implements IActionImplementation {
    abstract get summary(): string;

    protected beforeChangeHandlers: OnChangeHandler[] = [];
    protected afterChangeHandlers: OnChangeHandler[] = [];
    onChanged(handler: OnChangeHandler): void {
        this.afterChangeHandlers.push(handler);
    }
    onBeforeChange(handler: OnChangeHandler): void {
        this.beforeChangeHandlers.push(handler);
    }

    protected async fireOnBeforeChange(issue: IssueOrPullRequest): Promise<void> {
        for (const before of this.beforeChangeHandlers) {
            await before(issue);
        }
    }

    protected async fireOnChanged(issue: IssueOrPullRequest): Promise<void> {
        for (const after of this.afterChangeHandlers) {
            await after(issue);
        }
    }

    abstract async execute(info: ActionExecuteInfo): Promise<void>;
}

export abstract class BaseIssueAction extends BaseAction {
    constructor(readonly issue: IssueOrPullRequest) {
        super();
    }

    protected async fireOnBeforeChange(): Promise<void> {
        await super.fireOnBeforeChange(this.issue);
    }

    protected async fireOnChanged(): Promise<void> {
        await super.fireOnChanged(this.issue);
    }
}

export namespace PullRequests {
    export abstract class Base extends BaseAction {
        constructor(readonly pr: PullRequest) {
            super();
        }
    }

    export class Merge extends Base {
        get summary(): string {
            return `Merge pull request ${this.pr.fullName}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            await client.mergePR(this.pr, await this.getMergeOptions());
        }

        private async getMergeOptions(): Promise<client.MergePrOptions> {
            const { pr } = this;
            const canMerge = await pr.getMergeableState();
            if (!canMerge) {
                throw new Error("TODO");
            }

            const commits = await pr.getCommitsRaw();

            const title = `Merge PR #${pr.number}: ${pr.title}`;

            let message = "";
            for (const commit of commits) {
                message += `* ${commit.commit.message}\n`;
            }

            const sha = commits[commits.length - 1].sha;

            return { title, message, sha };
        }
    }
}

export namespace Labels {
    export abstract class Base extends BaseIssueAction {
        constructor(issue: IssueOrPullRequest, readonly labels: ReadonlyArray<string>) {
            super(issue);
        }
    }

    export class Add extends Base {
        get summary(): string {
            return `Add labels ${JSON.stringify(this.labels)} to issue ${this.issue.number}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            const labelsToAdd = this.labels.filter((lab) => !this.issue.hasLabel(lab));
            if (labelsToAdd.length === 0) return;
            await this.fireOnBeforeChange();
            await client.addLabels(this.issue, labelsToAdd);
            await this.fireOnChanged();
        }
    }

    export class Remove extends Base {
        get summary(): string {
            return `Remove labels ${JSON.stringify(this.labels)} to issue ${this.issue.number}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            const labelsToRemove = this.labels.filter((lab) => this.issue.hasLabel(lab));
            if (labelsToRemove.length === 0) return;
            await this.fireOnBeforeChange();
            await client.removeLabels(this.issue, this.labels);
            await this.fireOnChanged();
        }
    }

    export class Set extends Base {
        get summary(): string {
            return `Apply label set ${JSON.stringify(this.labels)} to issue ${this.issue.number}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            const desired = this.labels.slice().sort();
            const actual = this.issue.labels.map((l) => l.name).sort();
            if (JSON.stringify(desired) === JSON.stringify(actual)) {
                return;
            }
            await this.fireOnBeforeChange();
            await client.setLabels(this.issue, this.labels);
            await this.fireOnChanged();
        }
    }
}

export namespace Comments {
    export interface CommentHeader {
        slug: string;
    }
    
    export function parseHeader(body: string): CommentHeader | undefined {
        const regex = /^<!--header (.*) headerend-->/g;
        const match = regex.exec(body);
        return match ? JSON.parse(match[1]) : undefined;
    }

    function makeHeader(header: CommentHeader): string {
        return `<!--header ${JSON.stringify(header)} headerend-->`;
    }

    function makeFooter(): string {
        return `<!--footer bot @ ${(new Date()).toLocaleString()} footerend-->`;
    }

    function makeComment(slug: string, body: string): string {
        return makeHeader({ slug }) + "\r\n" + body + "\r\n" + makeFooter();
    }

    function getBody(comment: IssueComment): string | undefined {
        const regex = /headerend-->\r\n([^]*?)\r\n<!--footer/;
        const match = regex.exec(comment.body);
        if (match) {
            return match[1];
        }
        return undefined;
    }

    export abstract class Base extends BaseIssueAction {
        constructor(issue: IssueOrPullRequest, readonly slug: string) {
            super(issue);
        }
    }

    export class Add extends Base {
        constructor(issue: IssueOrPullRequest, slug: string, readonly body: string) {
            super(issue, slug);
        }
        get summary(): string {
            return `Write comment (slug '${this.slug}') on issue ${this.issue.number}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            const me = await client.getMyLogin();
            // Find my comments, if it exists
            const comments = (await this.issue.getComments()).filter((c) => c.user.login === me);
            for (const c of comments) {
                const header = parseHeader(c.body);
                if (header && (header.slug === this.slug)) {
                    const body = getBody(c);
                    if (body !== this.body) {
                        debugger;
                        await this.fireOnBeforeChange();
                        await client.editComment(c, makeComment(this.slug, this.body));
                        await this.fireOnChanged();
                    }
                    return;
                }
            }
            await this.fireOnBeforeChange();
            await client.addComment(this.issue, makeComment(this.slug, this.body));
            await this.fireOnChanged();
        }
    }

}

export namespace Assignees {
    export abstract class Base extends BaseIssueAction {
        constructor(issue: IssueOrPullRequest, readonly assignees: ReadonlyArray<string>) {
            super(issue);
        }
    }
    export class Add extends Base {
        get summary(): string {
            return `Assign issue ${this.issue.fullName} to ${JSON.stringify(this.assignees)}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            throw new Error("Not implemented");
        }
    }
}

export namespace Issues {
    export class SetColumn extends BaseIssueAction {
        get summary(): string {
            const column = this.column ? this.column.name : "(none)";
            return `Move issue ${this.issue.fullName} to column ${column} in project ${this.project.projectId}`;
        }

        constructor(issue: IssueOrPullRequest, readonly project: Project, readonly column: ProjectColumn | undefined) {
            super(issue);
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            await this.project.doSetIssueColumn(this.issue, this.column);
        }
    }

    export class Lock extends BaseIssueAction {
        get summary(): string {
            return `Lock issue ${this.issue.fullName}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            if (this.issue.locked) return;
            await this.fireOnBeforeChange();
            await client.lockIssue(this.issue);
            await this.fireOnChanged();
        }
    }

    export class Unlock extends BaseIssueAction {
        get summary(): string {
            return `Unlock issue ${this.issue.fullName}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            if (!this.issue.locked) return;
            await this.fireOnBeforeChange();
            await client.unlockIssue(this.issue);
            await this.fireOnChanged();
        }
    }

    export class Close extends BaseIssueAction {
        get summary(): string {
            return `Close issue ${this.issue.fullName}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            if (this.issue.state === "open") {
                await this.fireOnBeforeChange();
                await client.closeIssue(this.issue);
                await this.fireOnChanged();
            }
        }
    }

    export class Reopen extends BaseIssueAction {
        get summary(): string {
            return `Reopen issue ${this.issue.fullName}`;
        }

        async execute(_info: ActionExecuteInfo): Promise<void> {
            if (this.issue.state === "closed") {
                await this.fireOnBeforeChange();
                await client.reopenIssue(this.issue);
                await this.fireOnChanged();
            }
        }
    }
}

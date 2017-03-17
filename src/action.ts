import GithubAPIClient from './client';
import { addAction } from './actionRunner';

import { Issue, Comment, User, Label, Milestone } from './github';

export type Logger = {};
export type OnChangeHandler = (item: Issue) => void;

export type ActionExecuteInfo = {
    client: GithubAPIClient,
    log: Logger
}

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
    onChanged(handler: OnChangeHandler) {
        this.afterChangeHandlers.push(handler);
    }
    onBeforeChange(handler: OnChangeHandler) {
        this.beforeChangeHandlers.push(handler);
    }

    protected async fireOnBeforeChange(issue: Issue) {
        for (const before of this.beforeChangeHandlers) {
            await before(issue);
        }
    }

    protected async fireOnChanged(issue: Issue) {
        for (const after of this.afterChangeHandlers) {
            await after(issue);
        }
    }

    public abstract async execute(info: ActionExecuteInfo): Promise<void>;
}

export abstract class BaseIssueAction extends BaseAction {
    constructor(public issue: Issue) {
        super();
    }

    protected async fireOnBeforeChange() {
        await super.fireOnBeforeChange(this.issue);
    }

    protected async fireOnChanged() {
        await super.fireOnChanged(this.issue);
    }
}

export namespace Labels {
    export abstract class Base extends BaseIssueAction {
        constructor(issue: Issue, public labels: string[]) {
            super(issue);
        }
    }

    export class Add extends Base {
        get summary() {
            return `Add labels ${JSON.stringify(this.labels)} to issue ${this.issue.number}`;
        }

        async execute(info: ActionExecuteInfo) {
            const labelsToAdd = this.labels.filter(lab => !this.issue.hasLabel(lab));
            if (labelsToAdd.length === 0) return;
            await this.fireOnBeforeChange();
            await info.client.addLabels(this.issue, labelsToAdd);
            await this.fireOnChanged();
        }
    }

    export class Remove extends Base {
        get summary() {
            return `Remove labels ${JSON.stringify(this.labels)} to issue ${this.issue.number}`;
        }

        async execute(info: ActionExecuteInfo) {
            const labelsToRemove = this.labels.filter(lab => this.issue.hasLabel(lab));
            if (labelsToRemove.length === 0) return;
            await this.fireOnBeforeChange();
            await info.client.removeLabels(this.issue, labelsToRemove);
            await this.fireOnChanged();
        }
    }

    export class Set extends Base {
        get summary() {
            return `Apply label set ${JSON.stringify(this.labels)} to issue ${this.issue.number}`;
        }

        async execute(info: ActionExecuteInfo) {
            const desired = this.labels.slice().sort();
            const actual = this.issue.labels.map(l => l.name).sort();
            if (JSON.stringify(desired) === JSON.stringify(actual)) {
                return;
            }
            await this.fireOnBeforeChange();
            await info.client.setLabels(this.issue, this.labels);
            await this.fireOnChanged();
        }
    }
}

export namespace Comments {
    interface CommentHeader {
        slug: string;

    }
    function parseHeader(body: string): CommentHeader | undefined {
        const regex = /^<!--header (.*) headerend-->/g;
        const match = regex.exec(body);
        return match ? JSON.parse(match[1]) : undefined;
    }

    function makeHeader(header: CommentHeader) {
        // return `<!-- 🤖🔊 ${JSON.stringify(header)} 🔊🤖 -->`;
        return `<!--header ${JSON.stringify(header)} headerend-->`;
    }

    function makeFooter() {
        // return `<!-- 🤖🔈 potent-bot @ ${(new Date()).toLocaleString()} 🔈🤖 -->`;
        return `<!--footer potent-bot @ ${(new Date()).toLocaleString()} footerend-->`;
    }

    function makeComment(slug: string, body: string) {
        return makeHeader({ slug }) + '\r\n' + body + '\r\n' + makeFooter();
    }

    function getBody(comment: Comment) {
        //const regex = /🔊🤖 -->\r?\n(.*)\r?\n<!-- 🤖🔈/;
        const regex = /headerend-->\r?\n(.*)\r?\n<!--footer/;
        const match = regex.exec(comment.body);
        if (match) {
            return match[1];
        }
        return comment.body;
    }

    export abstract class Base extends BaseIssueAction {
        constructor(issue: Issue, public slug: string) {
            super(issue);
        }
    }
    export class Add extends Base {
        constructor(issue: Issue, slug: string, public body: string) {
            super(issue, slug);
        }
        get summary() {
            return `Write comment (slug '${this.slug}') on issue ${this.issue.number}`;
        }

        async execute(info: ActionExecuteInfo) {
            const me = await info.client.getMyLogin();
            // Find my comments, if it exists
            const comments = (await this.issue.getComments()).filter(c => c.user.login === me.login);
            for (const c of comments) {
                const header = parseHeader(c.body);
                if (header && (header.slug === this.slug)) {
                    const body = getBody(c);
                    if (body !== this.body) {
                        console.log('Actual: ' + body);
                        console.log('Desired: ' + this.body);
                        this.fireOnBeforeChange();
                        await info.client.editComment(c, makeComment(this.slug, this.body));
                        this.fireOnChanged();
                    }
                    return;
                }
            }
            this.fireOnBeforeChange();
            await info.client.addComment(this.issue, makeComment(this.slug, this.body));
            this.fireOnChanged();
        }
    }

}

export namespace Assignees {
    export abstract class Base extends BaseIssueAction {
        constructor(issue: Issue, public assignees: string[]) {
            super(issue);
        }
    }
    export class Add extends Base {
        get summary() {
            return `Assign issue ${this.issue.fullName} to ${JSON.stringify(this.assignees)}`;
        }

        async execute(info: ActionExecuteInfo) {
            throw new Error('Not implemented');
        }
    }
}

export namespace Issues {
    export class Lock extends BaseIssueAction {
        get summary() {
            return `Lock issue ${this.issue.fullName}`;
        }

        async execute(info: ActionExecuteInfo) {
            if (this.issue.locked) return;
            this.fireOnBeforeChange();
            await info.client.lockIssue(this.issue);
            this.fireOnChanged();
        }
    }

    export class Unlock extends BaseIssueAction {
        get summary() {
            return `Unlock issue ${this.issue.fullName}`;
        }

        async execute(info: ActionExecuteInfo) {
            if (!this.issue.locked) return;
            this.fireOnBeforeChange();
            await info.client.unlockIssue(this.issue);
            this.fireOnChanged();
        }
    }

    export class Close extends BaseIssueAction {
        get summary() {
            return `Close issue ${this.issue.fullName}`;
        }

        async execute(info: ActionExecuteInfo) {
            if (this.issue.state === 'open') {
                this.fireOnBeforeChange();
                await info.client.closeIssue(this.issue);
                this.fireOnChanged();
            }
        }
    }

    export class Reopen extends BaseIssueAction {
        get summary() {
            return `Reopen issue ${this.issue.fullName}`;
        }

        async execute(info: ActionExecuteInfo) {
            if (this.issue.state === 'closed') {
                this.fireOnBeforeChange();
                await info.client.reopenIssue(this.issue);
                this.fireOnChanged();
            }
        }

    }
}

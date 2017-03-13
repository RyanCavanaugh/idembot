/// <reference path="../types/github.d.ts" />

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

export namespace Labels {
    export abstract class Base extends BaseAction {
        constructor(public issue: Issue, public labels: string[]) {
            super();
        }

        protected async fireOnBeforeChange() {
            await super.fireOnBeforeChange(this.issue);
        }

        protected async fireOnChanged() {
            await super.fireOnChanged(this.issue);
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
        return `<!-- potent-bot @ ${(new Date()).toLocaleString()} -->`;
    }

    function makeComment(slug: string, body: string) {
        return makeHeader({slug}) + '\r\n' + body + '\r\n' + makeFooter();
    }

    function getBody(comment: Comment) {
        const regex = /🔊🤖 -->\r?\n(.*)\r?\n<!-- 🤖🔈/;
        const match = regex.exec(comment.body);
        if (match) {
            return match[1];
        }
        return comment.body;
    }

    export abstract class Base extends BaseAction {
        constructor(public issue: Issue, public slug: string) {
            super();
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
                        this.fireOnBeforeChange(this.issue);
                        await info.client.editComment(c, makeComment(this.slug, this.body));
                        this.fireOnChanged(this.issue);
                    }
                    return;
                }                
            }
            this.fireOnBeforeChange(this.issue);
            await info.client.addComment(this.issue, makeComment(this.slug, this.body));
            this.fireOnChanged(this.issue);
        }
    }
   
}

export namespace Assignees {
    export abstract class Base extends BaseAction {
        constructor(public issue: Issue, public assignees: string[]) {
            super();
        }
    }
    export class Add extends Base {
        get summary() {
            return `Assign issue ${this.issue.number} to ${JSON.stringify(this.assignees)}`;
        }

        async execute(info: ActionExecuteInfo) {
        }
    }
}

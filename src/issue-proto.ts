import { IAction } from './action';
import * as Action from './action';
import { addAction } from './actionRunner';

declare global {
    namespace GitHubAPI {
        interface Issue extends IssueHelper { }
    }
}

export function apply<T extends GitHubAPI.Issue>(item: T): T {
    return Object.setPrototypeOf(item, HelperImpl);
}

export interface IssueHelper {
    hasLabel(this: GitHubAPI.Issue, s: string): boolean;
    authorIs(this: GitHubAPI.Issue, name: string): boolean;

    addLabel(this: GitHubAPI.Issue, label: string): IAction;
}

const HelperImpl: IssueHelper = {
    hasLabel(label: string) {
        return this.labels.some(l => l.name === label);
    },
    authorIs(name: string) {
        return this.user.login === name;
    },
    addLabel(...label: string[]) {
        return Action.addLabel(this, ...label);
    }
};





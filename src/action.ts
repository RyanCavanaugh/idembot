/// <reference path="../types/github.d.ts" />

import GithubAPIClient from './client';
import { addAction } from './actionRunner';

type Logger = {};

type Issue = GitHubAPI.Issue;
type PR = GitHubAPI.Issue;
type IssueOrPR = Issue | PR;

type OnChangeHandler = (item: IssueOrPR) => void;

type ActionExecuteInfo = {
    client: GithubAPIClient,
    log: Logger
}

export interface IAction {
    execute(issueOrPR: IssueOrPR, info: ActionExecuteInfo): boolean;
    onChanged(handler: OnChangeHandler): void;
}

export abstract class BaseAction {
    protected changeHandlers: OnChangeHandler[] = [];
    onChanged(handler: OnChangeHandler) {
        this.changeHandlers.push(handler);
    }

    public abstract execute(issueOrPR: IssueOrPR, info: ActionExecuteInfo): boolean;
}

/**
 * Adds a label to an issue or PR.
 */
export function addLabel(label: string) {
    return addAction(new AddLabels([label]));
}
/**
 * Adds labels to an issue or PR.
 */
export function addLabels(labels: string[]) {
    return addAction(new AddLabels(labels));
}
/**
 * Deletes a label from an issue.
 */
export function removeLabel(label: string) {
    return addAction(new RemoveLabels([label]));
}
/**
 * Deletes labels from an issue.
 */
export function removeLabels(labels: string[]) {
    return addAction(new RemoveLabels(labels));
}
/**
 * Sets, exactly, which labels are on an issue
 */
export function setLabels(labels: string[]) {
    return addAction(new SetLabels(labels));
}


class AddLabels extends BaseAction {
    constructor(public labels: string[]) {
        super();
    }

    execute(issueOrPR: IssueOrPR, info: ActionExecuteInfo) {
        const labelsToAdd = this.labels.filter(lab => !issueOrPR.hasLabel(lab));
        if (labelsToAdd.length > 0) {
            info.client.addLabels(issueOrPR, labelsToAdd);
            return true;
        } else {
            return false;
        }
    }
}

class RemoveLabels extends BaseAction {
    constructor(public labels: string[]) {
        super();
    }

    execute(issueOrPR: IssueOrPR, info: ActionExecuteInfo) {
        const labelsToRemove = this.labels.filter(lab => issueOrPR.hasLabel(lab));
        if (labelsToRemove.length > 0) {
            info.client.removeLabels(issueOrPR, labelsToRemove);
            return true;
        } else {
            return false;
        }
    }
}

class SetLabels extends BaseAction {
    constructor(public labels: string[]) {
        super();
    }

    execute(issueOrPR: IssueOrPR, info: ActionExecuteInfo) {
        const desired = this.labels.slice().sort();
        const actual = issueOrPR.labels.map(l => l.name).sort();
        if (JSON.stringify(desired) === JSON.stringify(actual)) {
            return false;
        }
        info.client.setLabels(issueOrPR, this.labels);
    }
}

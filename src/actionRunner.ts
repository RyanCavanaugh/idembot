import {IAction} from './action';

export function addAction(action: IAction) {
    currentActionList.push(action);
    return action;
}

const currentActionList: IAction[] = [];


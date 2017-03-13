import { IAction, IActionImplementation, ActionExecuteInfo } from './action';
import { SetupOptions, CommandLineOptions } from './options';

export function addAction(action: IAction) {
    currentActionList.push(action);
    return action;
}

const currentActionList: IAction[] = [];

export async function runActions(info: ActionExecuteInfo, opts: SetupOptions & CommandLineOptions) {
    while (currentActionList.length> 0) {
        const next = currentActionList.shift()! as IActionImplementation;
        console.log(`Execute action: ${next.summary} ${opts.dry ? "(dry)" : ""}`);
        if (opts.dry) {
            // Dry run, do nothing
            continue;
        }
        await next.execute(info);
    }
}

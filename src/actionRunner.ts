import { IAction, IActionImplementation, ActionExecuteInfo } from './action';
import { SetupOptions, ParsedCommandLineOptions } from './options';

export function addAction(action: IAction) {
    currentActionList.push(action);
    return action;
}

const currentActionList: IAction[] = [];

export async function runActions(info: ActionExecuteInfo, opts: ParsedCommandLineOptions) {
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

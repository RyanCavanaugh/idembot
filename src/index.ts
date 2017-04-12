/// <reference path="github-api.ts" />

import * as Actions from './action';
import * as client from './client';
import { createCache } from './cache';
import { runActions } from  './actionRunner';
import { SetupOptions, CommandLineOptions } from './options';
export { User, Issue, Milestone, Label } from './github';
export { Users, Issues } from './pools';

export default function bot(repoOwner: string, repoName: string, opts: SetupOptions & CommandLineOptions, oauthToken: string) {
    const cache = createCache(opts.cacheRoot);
    client.initialize(oauthToken, cache);
    
    async function updateCache() {
        // TODO: Figure something out
    }

    async function runRules() {
        const ruleNames = Object.keys(opts.rules);
        const info: Actions.ActionExecuteInfo = {
            log: {}
        };

        for (const repo of opts.repos) {
            console.log(`Running ${Object.keys(opts.rules).length} rules on ${repo.owner}/${repo.name}`);

            console.log('Fetching repo activity');
            let page = 0;
            const issueResults = await client.fetchChangedIssues(repo, { page });
            for (const issue of issueResults.issues) {
                for (const ruleName of ruleNames) {
                    const rule = opts.rules[ruleName];
                    console.log(`Inovking rule ${ruleName} on ${issue.number}`);
                    const result = rule(issue);
                    if (result !== undefined) {
                        await result;
                    }
                    console.log('... done');
                }

                await runActions(info, opts);
            }
        }
    }

    return ({
        runRules,
        updateCache
    });
}

export { 
    Actions,
    SetupOptions
};

/// <reference path="github-api.ts" />

import * as Actions from './action';
import * as client from './client';
import * as logging from './logging';
import syncRepoCache from './cache-manager';
import { createCache } from './cache';
import { runActions } from './actionRunner';
import { SetupOptions, ParsedCommandLineOptions } from './options';
import { Query, PRQuery, IssueQuery } from './options';
import * as GitHubWrapper from './github';
import { User, Issue, PullRequest, Milestone, Label, IssueOrPullRequest } from './github';
export { User, Issue, PullRequest, Milestone, Label, IssueOrPullRequest } from './github';

const log = logging.get('idembot').log;

process.on('unhandledRejection', (err: any) => {
    console.error(err);
});

async function runRulesOn(item: PullRequest | Issue, setup: SetupOptions) {
    if (setup.rules.issues && !item.isPullRequest) {
        for (const ruleName of Object.keys(setup.rules.issues)) {
            await runRule(item, setup.rules.issues[ruleName], ruleName);
        }
    }
    if (setup.rules.pullRequests && item.isPullRequest) {
        for (const ruleName of Object.keys(setup.rules.pullRequests)) {
            await runRule(item, setup.rules.pullRequests[ruleName], ruleName);
        }
    }
    if (setup.rules.issuesAndPullRequests) {
        for (const ruleName of Object.keys(setup.rules.issuesAndPullRequests)) {
            await runRule(item, setup.rules.issuesAndPullRequests[ruleName], ruleName);
        }
    }
}

async function runRule(issue: IssueOrPullRequest, rule: (issue: any) => void, name: string) {
    try {
        const result = rule(issue);
        if (result !== undefined) {
            await result;
        }
    } catch (e) {
        log(`Rule ${name} encountered exception running on ${issue.html_url}`);
        log(e);
    }
}

export default function bot(setup: SetupOptions, opts: ParsedCommandLineOptions, oauthToken: string) {
    client.initialize(oauthToken);
    const cache = createCache(opts.cacheRoot);
    GitHubWrapper.useCache(cache);

    async function runRules() {
        const info: Actions.ActionExecuteInfo = {
            log: {}
        };

        if (opts.kind === 'single') {
            const issueOrPR_raw = await client.fetchIssue(opts.single, opts.single.id);
            const issue = Issue.fromIssueData(issueOrPR_raw);
            let pr: PullRequest | undefined = undefined;
            if (issueOrPR_raw.pull_request) {
                pr = await PullRequest.fromReference(opts.single, opts.single.id);
            }

            console.log(`Processing ${opts.single.owner}/${opts.single.name}#${opts.single.id}: ${issue.title}`);
            if (setup.rules.issues && !pr) {
                for (const ruleName of Object.keys(setup.rules.issues)) {
                    await runRule(issue, setup.rules.issues[ruleName], ruleName);
                }
            }
            if (setup.rules.pullRequests && pr) {
                for (const ruleName of Object.keys(setup.rules.pullRequests)) {
                    await runRule(pr, setup.rules.pullRequests[ruleName], ruleName);
                }
            }
            if (setup.rules.issuesAndPullRequests) {
                for (const ruleName of Object.keys(setup.rules.issuesAndPullRequests)) {
                    await runRule(issue, setup.rules.issuesAndPullRequests[ruleName], ruleName);
                }
            }

            await runActions(info, opts);
        } else if (opts.kind === 'queries') {
            for (const query of opts.queries) {
                await client.runQuery(query, async item => {
                    await runRulesOn(item, setup);
                });
            }

            await runActions(info, opts);
        } else {
            throw new Error('Unreachable?');
        }
    }

    return ({
        runRules
    });
}

export {
    Actions,
    SetupOptions
};

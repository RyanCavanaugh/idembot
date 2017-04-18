/// <reference path="github-api.ts" />

import * as Actions from './action';
import * as client from './client';
import * as logger from 'winston';
import syncRepoCache from './cache-manager';
import { createCache } from './cache';
import { runActions } from './actionRunner';
import { SetupOptions, CommandLineOptions, IssueFilter } from './options';
import { User, Issue, PullRequest, Milestone, Label, IssueOrPullRequest } from './github';
import * as GitHubWrapper from './github';

export { User, Issue, PullRequest, Milestone, Label, IssueOrPullRequest } from './github';

process.on('unhandledRejection', (err: any) => {
    console.error(err);
});

const defaultFilter: IssueFilter = { };

export default function bot(repoOwner: string, repoName: string, opts: SetupOptions & CommandLineOptions, oauthToken: string) {
    const cache = createCache(opts.cacheRoot);
    client.initialize(oauthToken);
    GitHubWrapper.useCache(cache);    

    async function updateCache() {
        for (const repo of opts.repos) {
            await syncRepoCache(cache, repo);
        }
    }

    async function runRules() {
        const info: Actions.ActionExecuteInfo = {
            log: {}
        };

        for (const repo of opts.repos) {
            logger.info(`Syncing PR/issue cache for ${repo.owner}/${repo.name}`);
            await updateCache();

            let issues: Issue[] = [];
            let prs: PullRequest[] = [];
            if (opts.rules.issues || opts.rules.issuesAndPullRequests) {
                issues = (await client.fetchChangedIssuesRaw(repo)).map(i => Issue.fromData(i));
            }

            if (opts.rules.pullRequests || opts.rules.issuesAndPullRequests) {
                let rawPRs = await client.fetchChangedPRsRaw(repo, repo.prFilter);
                for(const raw of rawPRs) {
                    prs.push(await PullRequest.fromReference(repo, raw.number));
                }
            }

            const issuesAndPRs: Array<Issue | PullRequest> = [...issues, ...prs];

            console.log(`Running rules on ${repo.owner}/${repo.name}...`);
            if (opts.rules.issues) {
                for (const issue of issuesAndPRs.filter(i => !i.isPullRequest)) {
                    console.log(`Inovking issue rules on ${issue.repository.owner}/${issue.repository.name}#${issue.number}: ${issue.title}`);
                    for (const ruleName of Object.keys(opts.rules.issues)) {
                        await runRule(issue, opts.rules.issues[ruleName], ruleName);
                    }
                }
            } else {
                console.log('No issue rules specified');
            }

            if (opts.rules.pullRequests) {
                for (const pr of issuesAndPRs.filter(i => i.isPullRequest)) {
                    console.log(`Inovking PR rules on ${pr.repository.owner}/${pr.repository.name}#${pr.number}: ${pr.title}`);
                    for (const ruleName of Object.keys(opts.rules.pullRequests)) {
                        await runRule(pr, opts.rules.pullRequests[ruleName], ruleName);
                    }
                }
            } else {
                console.log('PR rules specified');
            }

            if (opts.rules.issuesAndPullRequests) {
                for (const issueOrPR of issuesAndPRs) {
                    console.log(`Inovking Issue/PR rules on ${issueOrPR.repository.owner}/${issueOrPR.repository.name}#${issueOrPR.number}: ${issueOrPR.title}`);
                    for (const ruleName of Object.keys(opts.rules.issuesAndPullRequests)) {
                        await runRule(issueOrPR, opts.rules.issuesAndPullRequests[ruleName], ruleName);
                    }
                }
            } else {
                console.log('No issue/PR rules specified');
            }

            await runActions(info, opts);
        }

        async function runRule(issue: IssueOrPullRequest, rule: (issue: any) => void, name: string) {
            try {
                const result = rule(issue);
                if (result !== undefined) {
                    await result;
                }
            } catch (e) {
                logger.error(`Rule ${name} encountered exception running on ${issue.html_url}`);
                logger.error(e);
            }
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

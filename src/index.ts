import * as Actions from "./action";
import { runActions } from "./actionRunner";
import { createCache } from "./cache";
import * as client from "./client";
import { Issue, IssueOrPullRequest, PullRequest, useCache } from "./github";
import { ParsedCommandLineOptions, SetupOptions } from "./options";
export {
    User, Issue, IssueComment, PullRequest, Milestone, Label, IssueOrPullRequest, Project, ProjectCard, ProjectColumn,
} from "./github";
export { PullRequestCommit, PullRequestReview, RepoReference } from "./github-api";

process.on("unhandledRejection", (err: any) => {
    console.error(err);
});

async function runRulesOn(item: PullRequest | Issue, setup: SetupOptions): Promise<void> {
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

async function runRule(issue: IssueOrPullRequest, rule: (issue: any) => void, name: string): Promise<void> {
    try {
        const result = rule(issue);
        if (result !== undefined) {
            await result;
        }
    } catch (e) {
        console.error(`Rule ${name} encountered exception running on ${issue.html_url}`);
        console.error(e.stack);
    }
}

export default function bot(setup: SetupOptions, opts: ParsedCommandLineOptions, oauthToken: string,
    ): { runRules(): Promise<void> } {
    client.initialize(oauthToken);
    const cache = createCache(opts.cacheRoot);
    useCache(cache);

    async function runRules(): Promise<void> {
        const info: Actions.ActionExecuteInfo = {};

        if (opts.kind === "single") {
            const issueOrPrRaw = await client.fetchIssue(opts.single, opts.single.id);
            const issue = Issue.fromIssueData(issueOrPrRaw);
            let pr: PullRequest | undefined;
            if (issueOrPrRaw.pull_request) {
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
        } else if (opts.kind === "queries") {
            for (const query of opts.queries) {
                await client.runQuery(query, async (item) => {
                    await runRulesOn(item, setup);
                });
            }

            await runActions(info, opts);
        } else {
            throw new Error("Unreachable?");
        }
    }

    return ({
        runRules,
    });
}

export {
    Actions,
    SetupOptions,
};

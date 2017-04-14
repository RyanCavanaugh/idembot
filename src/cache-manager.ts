import * as client from './client';
import { Cache } from './cache';
import { Repository, IssueOrPullRequest } from './github';
import { IssueFilter } from './options';
import * as logger from 'winston';

export default async function syncRepoCache(cache: Cache, repo: GitHubAPI.RepoReference, filter: IssueFilter): Promise<void> {
    // Cache updating algorithm:
    //  1. Get the first 100 recently changed issues
    //  2. Run through this list, newest first, checking timestamps against the local cache
    //  3. If we hit a matching timestamp, we are up-to-date and can stop
    //  4. If we exhaust the list, we are too out-of-date and need to do a full fetch

    if (!updateCache()) {
        logger.info(`Cache is too far out of date; running a full issue fetch`);
        await fullFetch();
        logger.info(`Full issue fetch complete`);
    } else {
        logger.info(`Sync completed`);
    }

    /**
     * Returns true if the cache is OK, false if we need to full-fetch
     */
    async function updateCache(): Promise<boolean> {
        const now = new Date();
        let page1 = await client.fetchChangedIssuesAndPRsRaw(repo, filter);
        let lastWasUpToDate = false;
        for (const issue of page1) {
            const key = IssueOrPullRequest.getCacheKey(repo, issue.number, !!issue.pull_request);
            const cached = await cache.load(key);
            if (cached.exists && Date.parse(cached.timestamp) >= Date.parse(issue.updated_at)) {
                // Already up to date, we can stop
                return true;
            } else {
                await saveIssueOrPR(issue, now);
            }
        }
        // Got here, which means we ran off the page without hitting an up-to-date entry
        return false;
    }

    async function saveIssueOrPR(issue: GitHubAPI.Issue, now: Date) {
        // Save
        const key = IssueOrPullRequest.getCacheKey(repo, issue.number, !!issue.pull_request);
        if (!!issue.pull_request) {
            // PRs need a separate fetch to get proper information
            const pr = await client.fetchPR(repo, issue.number);
            await cache.save(pr, key, now);
        } else {
            await cache.save(issue, key, now);
        }
    }


    async function fullFetch() {
        let now = new Date();
        let result = await client.fetchAllIssuesAndPRsRaw(repo, filter);
        while (true) {
            for (const issue of result.page) {
                await saveIssueOrPR(issue, now);
            }

            if (result.next) {
                now = new Date();
                result = await result.next();
            } else {
                return;
            }
        }
    }
}

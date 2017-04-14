import { Actions, SetupOptions } from 'idembot';
import * as Bot from 'idembot';
import moment = require('moment');

function addBugLabel(issue: Bot.Issue) {
    if (issue.user.login === 'RyanCavanaugh') {
        issue.removeLabel('enhancment');
        issue.addLabel('bug');
    }
    issue.addComment('first', 'Let us modify with some labels now');
    issue.reopen();
}

async function examine(issue: Bot.Issue) {
    const comments = await issue.getComments();
    console.log(`Issue ${issue.number} has ${comments.length} comments`);
}

function closeDuplicates(issue: Bot.Issue) {
    // Close issues marked as 'Duplicate' with no activity in the last week
    const cutoff = moment().subtract(1, "week");
    if (issue.hasLabel('Duplicate')) {
        if (issue.state === 'open') {
            issue.close();
        }
    }
}

function lockOldIssue(issue: Bot.Issue) {
    // Lock any closed issues untouched after 6 months
    const cutoff = moment().subtract(6, "months");
    if (issue.locked ||
        (issue.state === 'open') ||
        issue.hasLabel('Discussion') ||
        issue.hasLabel('Revisit') ||
        issue.updated_at.isAfter(cutoff)) {
        return;
    }

    issue.addComment('lock-inactivity', "Locking issue after 6 months of inactivity.")
    issue.lock();
}

const setup: SetupOptions = {
    repos: [
        {
            owner: 'Microsoft',
            name: 'types-publisher',
            filter: {
                openOnly: true
            }
        }
    ],
    rules: {
        issues: {
            examine
        }
        // addBugLabel,
        // lockOldIssue
    }
};

export = setup;

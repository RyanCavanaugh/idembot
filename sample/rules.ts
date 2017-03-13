import { Actions, SetupOptions } from 'idembot';
import * as Bot from 'idembot';

function addBugLabel(issue: Bot.Issue) {
    if (issue.user.login === 'RyanCavanaugh') {
        issue.removeLabel('bug');
    }
    issue.addComment('first', 'Thank you for this comment! It is so nice');
}

const setup: SetupOptions = {
    repos: [
        { owner: 'RyanCavanaugh', name: 'idembot' }
    ],
    rules: {
        addBugLabel
    }
}

export = setup;

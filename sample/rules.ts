import { Actions, SetupOptions } from 'idembot';
import * as Bot from 'idembot';

function addBugLabel(issue: Bot.Issue) {
    if (issue.user.login === 'RyanCavanaugh') {
        issue.removeLabel('enhancment');
        issue.addLabel('bug');
    }
    issue.addComment('first', 'Let us modify with some labels now');
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

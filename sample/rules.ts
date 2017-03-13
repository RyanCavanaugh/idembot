import { Actions, SetupOptions } from 'idembot';
import * as Bot from 'idembot';

function addBugLabel(issue: Bot.Issue) {
    if (issue.user.login === 'RyanCavanaugh') {
        issue.removeLabel('bug');
    }
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

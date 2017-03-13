import { Actions, SetupOptions } from 'idembot';

function addBugLabel(issue: GitHubAPI.Issue) {
    issue.addComment();
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

import { Actions } from '../src/';


function assignToSteve(issue: GitHubAPI.Issue) {
    Actions.addLabel('test').onChanged(() => {

    });
}



export = [
    assignToSteve
];



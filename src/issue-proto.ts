declare global {
    namespace GitHubAPI {
        interface Issue extends IssueHelper {}
    }
}

export function apply<T extends GitHubAPI.Issue>(item: T): T {
    return Object.setPrototypeOf(item, HelperImpl);
}

interface IssueHelper {
    hasLabel(this: GitHubAPI.Issue, s: string): boolean;
    authorIs(this: GitHubAPI.Issue, name: string): boolean;
}

const HelperImpl: IssueHelper = {
    hasLabel(label: string) {
        return this.labels.some(l => l.name === label);
    },
    authorIs(name: string) {
        return this.user.login === name;
    }
};





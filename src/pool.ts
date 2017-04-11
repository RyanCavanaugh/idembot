import Client from './client';
import WeakStringMap from './weak-string-map';

/*
    private issuePool = new WeakStringMap<Wrapped.Issue>();
    private issueKey(owner: string, repo: string, issueNumber: string) {
        return owner + '/' + repo + '#' + issueNumber;
    }
    public async getIssue(owner: string, repo: string, issueNumber: string) {
        return this.fetchFromPool(this.issuePool, this.issueKey(owner, repo, issueNumber), this.fetchIssue(owner, repo, issueNumber));
    }
    private async fetchIssue(owner: string, repo: string, issueNumber: string) {
        const timestamp = new Date();
        const result = await this.exec('GET', path('repos', owner, repo, 'issues', issueNumber));
        const data: GitHubAPI.Issue = JSON.parse(result);
        await this.cache.save(data, timestamp, data.number, 'issues');
        return new Wrapped.Issue(this, data);
    }
    private getIssueSync(owner: string, repo: string, data: GitHubAPI.Issue) {
        return this.updateFromPool(this.issuePool, this.issueKey(owner, repo, data.number.toString()), data, Wrapped.Issue);
    }
*/

export interface Settings<KeyType, DataType, InstanceType> {
    constructor: new(client: Client, data: DataType) => InstanceType;
    keyOf(data: DataType): KeyType;
    fetchData(key: KeyType): Promise<DataType>;
    keyToString(key: KeyType): string;
}

export interface IUpdateable<DataType> {
    update(data: DataType): void;
}

export class Pool<KeyType, DataType, InstanceType extends IUpdateable<DataType>> {
    private pool = new WeakStringMap<InstanceType>();
    constructor(private client: Client, private settings: Settings<KeyType, DataType, InstanceType>) {
    }

    public async get(key: KeyType): Promise<InstanceType> {
        const keyString = this.settings.keyToString(key);
        const extant = this.pool.get(keyString);
        if (extant) {
            return extant;
        }
        const data = await this.settings.fetchData(key);
        return this.getSync(data);
    }

    public getSync(data: DataType): InstanceType {
        const key = this.settings.keyToString(this.settings.keyOf(data));
        const extant = this.pool.get(key);
        if (extant !== undefined) {
            return extant;
        }
        const newObj = new (this.settings.constructor)(this.client, data);
        this.pool.set(key, newObj);
        return newObj;
    }
}
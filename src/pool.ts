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

/**
 * KeyType: a reference or value type that uniquely identifies an InstanceType
 * DataType: the type of the JSON data that comes from GitHub
 * InstanceType: the instance type of the constructed class
 * ExtraType: the type of extra data needed to instantiate the class
 */
export interface Settings<KeyType, DataType, InstanceType, ExtraType> {
    /** Class constructor for creating a new InstanceType */
    constructor: new (data: DataType, extra: ExtraType) => InstanceType;
    /** Fetch a key from the data type */
    keyOf(data: DataType): KeyType;
    /** Fetch the data for this based on the key */
    fetchData(key: KeyType): Promise<DataType>;
    /** Construct a string representation of a key */
    keyToString(key: KeyType): string;
}

export interface IUpdateable<DataType> {
    update(data: DataType): void;
}

export class Pool<KeyType, DataType, InstanceType extends IUpdateable<DataType>, ExtraType> {
    private pool = new WeakStringMap<InstanceType>();
    constructor(private settings: Settings<KeyType, DataType, InstanceType, ExtraType>) {
    }

    public async get(key: KeyType): Promise<InstanceType> {
        const keyString = this.settings.keyToString(key);
        const extant = this.pool.get(keyString);
        if (extant) {
            return extant;
        }
        const data = await this.settings.fetchData(key);
        return this.instantiate(data);
    }

    public instantiate(data: DataType, extra?: ExtraType): InstanceType {
        const key = this.settings.keyToString(this.settings.keyOf(data));
        const extant = this.pool.get(key);
        if (extant !== undefined) {
            return extant;
        }
        const newObj = new (this.settings.constructor)(data, extra!);
        this.pool.set(key, newObj);
        return newObj;
    }
}

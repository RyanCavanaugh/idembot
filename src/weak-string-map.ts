export default class WeakStringMap<T> {
    private keys: { [s: string]: {} } = {};
    private map = new WeakMap<{}, T>();
    public get(s: string): T | undefined {
        // No key by that name
        if (!this.keys[s]) return undefined;
        const result = this.map.get(this.keys[s]);
        if (result === undefined) {
            // Object went missing from the map so delete its corresponding key
            delete this.keys[s];
        }
        return result;
    }
    public delete(s: string) {
        if (!this.keys[s]) return;
        this.map.delete(this.keys[s]);
        delete this.keys[s];
    }
    public set(s: string, value: T): this {
        this.keys[s] = this.keys[s] || {};
        this.map.set(this.keys[s], value);
        return this;
    }
}

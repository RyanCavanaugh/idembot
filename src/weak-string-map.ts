export default class WeakStringMap<T> {
    private keys: { [s: string]: {} } = {};
    private map = new WeakMap<{}, T>();
    public get(s: string): T | undefined {
        if (!this.keys[s]) return undefined;
        return this.map.get(this.keys[s]);
    }
    public has(s: string): boolean {
        if (!this.keys[s]) return false;
        const result = this.map.has(s);
        if (result) {
            return true;
        }
        // Object went missing from the map so delete its corresponding key
        delete this.keys[s];
        return false;
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

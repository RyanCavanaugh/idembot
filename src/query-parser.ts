import { PRQuery } from './options';

export function parseQuery(json: any) {
    if ('kind' in json) {
        const kind = json['kind'];
        switch (kind) {
            case 'prs':
                return parsePrsQuery(json);
            case 'issues':
                throw new Error("Issue queries NYI");
            default:
                throw new Error(`Query kind '${kind}' must be "prs" or "issues"`);
        }
    } else {
        throw new Error('Must specify "kind" property');
    }
}

declare var pr: PRQuery;
function parsePrsQuery(json: any): PRQuery {
    const repo = getProperty<typeof pr.repo>(json, 'repo', null, r => /\w+\/\w+/.test(r));
    const state = getProperty<typeof pr.state>(json, 'state', 'open', x => ['open', 'closed', 'all'].indexOf(x) >= 0);
    const count = getProperty<typeof pr.count>(json, 'count', 'all', n => n === 'all' || typeof n === 'number');
    const sort = getProperty<typeof pr.sort>(json, 'sort', 'created', x => ['created', 'updated', 'popularity', 'long-running'].indexOf(x) >= 0);
    const direction = getProperty<typeof pr.direction>(json, 'direction', 'desc', x => ['asc', 'desc'].indexOf(x) >= 0);

    return ({
        repo,
        kind: 'prs',
        state,
        count,
        sort,
        direction
    });
}

function getProperty<T>(json: any, key: string, defaultValue: T | null, validate: (x: T) => boolean): T {
    if (key in json) {
        const value = json[key];
        if (!validate(value)) {
            throw new Error(`Invalid value for '${key}'`);
        }
        return value;
    } else {
        if (defaultValue === null) {
            throw new Error(`Must specify value for '${key}'`);
        } else {
            return defaultValue;
        }
    }
}
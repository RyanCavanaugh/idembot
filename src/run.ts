import commander = require("commander");
import fs = require("fs-extra");
import path = require("path");
import createBot from "./index";
import { ParsedCommandLineOptions, Query, SetupOptions } from "./options";
import { parseQuery } from "./query-parser";

const oauth = process.env.AUTH_TOKEN;

async function parseQueryFile(filename: string): Promise<Query> {
    return parseQuery(JSON.parse(await fs.readFile(filename, "utf-8")));
}

async function main(argv: string[]): Promise<number> {
    commander
        .option("-f, --file [filename]", "specify rules filename (default: rules.js)", "rules.js")
        .option("-d, --dry", "don't actually change anything", false)
        .option("-r, --rules [rules]", "specify a comma-delimited list of specific rules to run")
        .option("--ls", "displays a list of rule names and exits")
        .option("-q, --query [query]", "specify query filenames (comma-delimited, default: query.json)")
        .option("--single [ref]", "run on the specified issue or PR. Ref: owner/repo#id")
        .parse(process.argv);

    commander.usage("idembot --query open-issues.json");

    if (argv.length < 2) {
        commander.outputHelp();
        return 0;
    }

    const filename = commander.file;
    const queries = (commander.query && commander.query.split(",")) || [];
    console.log(queries);
    const dry = !!commander.dry;
    const single = commander.single || "";

    const cacheRoot = path.join(path.dirname(path.resolve(filename)), "cache");

    // Load the rules module
    let rulesMod: SetupOptions;
    try {
        rulesMod = require(path.resolve(filename));
    } catch (e) {
        console.log(`Failed to load rules module ${filename}: ${e}`);
        return -1;
    }

    // Handle --ls mode and exit
    if (commander.ls) {
        console.log(`Rules in module ${filename}:`);
        for (const rule of Object.keys(rulesMod.rules)) {
            console.log(` * ${rule}`);
        }
        return 0;
    }

    const ruleNames = commander.rules || Object.keys(rulesMod.rules);

    // Parse queries
    let parsedOptions: ParsedCommandLineOptions;
    if (single.length > 0) {
        if (queries.length > 0) {
            console.log('Specify only one of "queries" and "single"');
            return -1;
        }
        const match = /(\w+)\/(\w+)#(\w+)/.exec(single);
        if (!match) {
            console.log("Specify single in format: owner/name#id");
            return -1;
        }
        const [owner, name, id] = match.slice(1);
        parsedOptions = {
            cacheRoot, dry, ruleNames,
            kind: "single",
            single: { owner, name, id },
        };
    } else {
        const parsedQueries: Query[] = [];
        if (queries.length === 0) queries.push("query.json");

        for (const q of queries || ["query.json"]) {
            try {
                parsedQueries.push(await parseQueryFile(q));
            } catch (e) {
                console.log(`Error parsing query file ${q}: ${e}`);
                return -1;
            }
        }

        parsedOptions = {
            cacheRoot, dry, ruleNames,
            kind: "queries",
            queries: parsedQueries,
        };
    }

    // Check for oauth token
    if (oauth === undefined) {
        console.log("You must set the AUTH_TOKEN environment variable to a suitable OAuth token");
        return -1;
    }

    const bot = createBot(rulesMod, parsedOptions, oauth);
    await bot.runRules();

    return 0;
}

main(process.argv).then((r) => process.exit(r));

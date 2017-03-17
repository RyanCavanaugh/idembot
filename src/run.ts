import path = require('path');
import commander = require('commander');
import main from './index';
import { SetupOptions, CommandLineOptions } from './options';

import { Issue } from './github';

const oauth = process.env['AUTH_TOKEN'];

commander
    .option('-f, --file [filename]', "specify rules filename (default: rules.js)")
    .option('-b, --backport', "backport rules to all existing issues (default: only run on changed issues)", false)
    .option('-d, --dry', "don't actually change anything", false)
    .option('-r, --rules [rules]', "specify a comma-delimited list of specific rules to run")
    .option('--ls', "displays a list of rule names and exits")
    .parse(process.argv);

const dry = !!commander['dry'];
const backport = !!commander['backport']
const filename = commander['file'] || 'rules.js';
const cacheRoot = path.join(path.dirname(path.resolve(filename)), 'cache');

const rulesMod: SetupOptions = require(path.resolve(filename));

if (commander['ls']) {
    console.log(`Rules in module ${filename}:`);
    for(const rule of Object.keys(rulesMod.rules)) {
        console.log(` * ${rule}`);
    }
    process.exit(0);
}

if (oauth === undefined) {
    console.log('You must set the AUTH_TOKEN environment variable to a suitable OAuth token');
    process.exit(-1);
}

const ruleNames = commander['rules'] || Object.keys(rulesMod.rules);
const setup = { ...rulesMod,
    dry, backport, ruleNames, cacheRoot };

async function run() {
    for (const repo of setup.repos) {
        console.log(`Updating cache for ${repo.owner}/${repo.name}...`);
        const bot = main(repo.owner, repo.name, setup, oauth);
        await bot.updateCache();
    }
    for (const repo of setup.repos) {
        console.log(`Running ${ruleNames.length} rules on ${repo.owner}/${repo.name}...`);
        const bot = main(repo.owner, repo.name, setup, oauth);
        await bot.runRules();
    }
}

run().then(() => {
    console.log('Done!');
});

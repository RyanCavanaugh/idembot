import path = require('path');
import commander = require('commander');
import { run } from './index';
import { SetupOptions, CommandLineOptions } from './options';

import { Issue } from './github';

const oauth = process.env['AUTH_TOKEN'];

commander
    .option('-d, --dry', "Don't actually change anything")
    .option('-f, --file [filename]', "Change rules filename (default: rules.js)")
    .parse(process.argv);

const dry = !!commander['dry'];
const filename = commander['file'] || 'rules.js';

if (oauth === undefined) {
    console.log('You must set the AUTH_TOKEN environment variable to a suitable OAuth token');
    process.exit(-1);
}

const rulesMod: SetupOptions = require(path.resolve(filename));
console.log(`Loaded rules module from ${filename}`);

const setup = { ...rulesMod, dry };

run(setup, oauth).then(() => {
    console.log('Done!');
});

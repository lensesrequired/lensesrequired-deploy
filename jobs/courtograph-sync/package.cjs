// Include the same CSV parser as the reference converter, with its runtime dependency.
const {cpSync, mkdirSync} = require('node:fs');
const {dirname, join} = require('node:path');
const target = join(__dirname, 'dist/node_modules');
mkdirSync(target, {recursive: true});
for (const name of ['csvtojson', 'lodash']) {
  cpSync(dirname(require.resolve(`${name}/package.json`)), join(target, name), {recursive: true});
}

import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = {};
const addFile = async path => {
  files['branch/' + relative(root, path).split('\\').join('/')] = new Uint8Array(await readFile(path));
};
const addDirectory = async path => {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) await addDirectory(child);
    else if (entry.isFile()) await addFile(child);
  }
};
// Explicit source list: never package credentials, local documents or hosting identity.
for (const name of ['index.html', 'package.json', 'package-lock.json', 'README.md', '.gitignore', 'vite.config.js']) {
  await addFile(resolve(root, name));
}
for (const name of ['src', 'tests', 'scripts']) await addDirectory(resolve(root, name));
const directory = resolve(root, 'public/downloads');
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'branch-source.zip'), zipSync(files, { level: 9 }));
console.log(`Source archive: ${Object.keys(files).length} files → public/downloads/branch-source.zip`);
execFileSync(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root,
  stdio: 'inherit',
});

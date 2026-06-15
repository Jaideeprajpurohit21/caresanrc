import { Generator, getConfig } from '@tanstack/router-generator';
const config = await getConfig({}, process.cwd());
console.log('cfg routesDirectory:', config.routesDirectory);
const gen = new Generator({ config, root: process.cwd() });
await gen.run();
console.log('done');

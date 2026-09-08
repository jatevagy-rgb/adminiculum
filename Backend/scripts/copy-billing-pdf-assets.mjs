import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve('src/modules/billing-preparations/assets/NotoSans-Variable.ttf');
const target = resolve('dist/modules/billing-preparations/assets/NotoSans-Variable.ttf');
mkdirSync(dirname(target), { recursive: true });
cpSync(source, target);

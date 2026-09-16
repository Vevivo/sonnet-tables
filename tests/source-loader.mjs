import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const cache=new Map();
export function sourceUrl(path){
 path=resolve(path);if(cache.has(path))return cache.get(path);
 const output=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const rewritten=output.replace(/from\s+["'](\.\.?\/[^"']+)["']/g,(_,relative)=>`from ${JSON.stringify(sourceUrl(resolve(dirname(path),relative.endsWith('.ts')?relative:relative+'.ts')))}`);
 const url='data:text/javascript;base64,'+Buffer.from(rewritten).toString('base64');cache.set(path,url);return url;
}

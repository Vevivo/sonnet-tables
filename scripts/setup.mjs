import {copyFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
for(const [example,target] of [['wrangler.example.jsonc','wrangler.jsonc'],['.dev.vars.example','.dev.vars']]){
 try{await access(target);console.log(`Keeping existing ${target}`);}
 catch{await copyFile(example,target,constants.COPYFILE_EXCL);console.log(`Created ${target}`);}
}

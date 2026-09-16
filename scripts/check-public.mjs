import {execFileSync} from 'node:child_process';
import {readFileSync,lstatSync} from 'node:fs';

const paths=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean))];
const findings=[];
const forbidden=/(?:^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?|wrangler\.jsonc|credentials\.json|secrets\.json|id\.json|[^/]*vault[^/]*\.json|[^/]*keypair[^/]*\.json|[^/]+\.(?:pem|key|p12|pfx|sqlite3?|db|log))$/i;
const examples=new Set(['.env.example','.dev.vars.example']);
const checks=[
 ['private-key-block',/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
 ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
 ['provider-secret',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
 ['cloud-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['private-jwk',/"d"\s*:\s*"[A-Za-z0-9_-]{42,}"/],
 ['embedded-url-password',/https?:\/\/[^\s/@:]+:[^\s/@]+@/],
 ['deployment-resource-id',/\bappg(?:prj|ver|dep)_[a-f0-9]{20,}\b/],
];
for(const path of paths){
 if(forbidden.test(path)&&!examples.has(path))findings.push(`${path}: private file type`);
 const stat=lstatSync(path);
 if(stat.isSymbolicLink()){findings.push(`${path}: unexpected symlink`);continue;}
 const bytes=readFileSync(path);if(bytes.includes(0))continue;
 const lines=bytes.toString('utf8').split('\n');
 for(let i=0;i<lines.length;i++)for(const [rule,pattern] of checks){
  // CORS tests intentionally contain a rejected URL with example credentials.
  if(path==='tests/arns.test.mjs'&&rule==='embedded-url-password')continue;
  if(pattern.test(lines[i]))findings.push(`${path}:${i+1}: ${rule}`);
 }
}
if(findings.length){console.error(findings.join('\n'));process.exit(1);}
console.log(`Public-source checks passed for ${paths.length} files. Pattern checks do not replace review.`);

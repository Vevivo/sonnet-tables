import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {sourceUrl} from './source-loader.mjs';
const {importSigner,signAction,VaultPasswordRequired}=await import(sourceUrl('lib/local-signer.ts'));
// Run PACT's actual creation helpers with ephemeral keys, not a real user's vault.
const fixture=readFileSync(new URL('./fixtures/pact-v1-source.txt',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(fixture,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {generateIdentity,createVault}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'));
const identity=await generateIdentity(),other=await generateIdentity();
const password='  deneme-şifre 🪶  ';
const vault=await createVault(identity,password);
const fileFor=v=>new File([JSON.stringify(v,null,2)],'pact-vault-test.json',{type:'application/json'});

test('PACT-created vault prompts for password and unlocks the same DID without altering its file',async()=>{
 const file=fileFor(vault),before=await file.text();
 await assert.rejects(importSigner(file,identity.did),VaultPasswordRequired);
 const signer=await importSigner(file,identity.did,password);
 assert.equal(signer.did,identity.did);
 assert.equal(signer.key.extractable,false);
 const signed=await signAction(signer.key,signer.did,'local-test-room','compatibility test');
 const pub=await crypto.subtle.importKey('jwk',identity.publicJwk,'Ed25519',false,['verify']);
 assert.equal(await crypto.subtle.verify('Ed25519',pub,Buffer.from(signed.sig,'base64url'),new TextEncoder().encode(`local-test-room|${signed.nonce}|${signed.text}`)),true);
 assert.equal(await file.text(),before);
});
test('password bytes are preserved and incorrect passwords cannot unlock',async()=>{
 await assert.rejects(importSigner(fileFor(vault),identity.did,password.trim()),/could not be unlocked/);
 await assert.rejects(importSigner(fileFor(vault),identity.did,'wrong password'),/could not be unlocked/);
 const emptyPasswordVault=await createVault(identity,'');
 assert.equal((await importSigner(fileFor(emptyPasswordVault),identity.did,'')).did,identity.did);
});
test('tampered ciphertext is rejected by authentication',async()=>{
 const bytes=Buffer.from(vault.ciphertext,'base64url');bytes[0]^=1;
 await assert.rejects(importSigner(fileFor({...vault,ciphertext:bytes.toString('base64url')}),identity.did,password),/could not be unlocked/);
});
test('declared DID, public key and private key must all match',async()=>{
 await assert.rejects(importSigner(fileFor(vault),other.did,password),/different DID/);
 await assert.rejects(importSigner(fileFor({...vault,did:other.did}),other.did,password),/public key does not match/);
 const differentPrivate=await createVault({...identity,privateJwk:other.privateJwk},password);
 await assert.rejects(importSigner(fileFor(differentPrivate),identity.did,password),/does not match/);
 // Even if the supplied public x lies about a private seed, signing proof must fail.
 const forged=await createVault({...identity,privateJwk:{...other.privateJwk,x:identity.publicJwk.x}},password);
 await assert.rejects(importSigner(fileFor(forged),identity.did,password));
});
test('unsupported and malformed vaults fail before password derivation',async()=>{
 for(const change of [{format:'pact-vault-v2'},{iterations:2000001},{iterations:1.5},{salt:'bad'},{iv:'bad'},{ciphertext:'!'},{publicJwk:{...vault.publicJwk,x:'bad'}}]){
  await assert.rejects(importSigner(fileFor({...vault,...change}),identity.did),e=>!(e instanceof VaultPasswordRequired));
 }
 await assert.rejects(importSigner(fileFor(null),identity.did),/Choose a JSON/);
 await assert.rejects(importSigner(new File(['not JSON'],'invalid.json'),identity.did),/not a valid JSON/);
});

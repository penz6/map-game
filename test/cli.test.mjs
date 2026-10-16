import{test}from'node:test';import assert from'node:assert/strict';import{spawn}from'node:child_process';import fs from'node:fs';import os from'node:os';import path from'node:path';import{fileURLToPath}from'node:url';import{createIdentityStore,verifyPassword}from'../security.mjs';
test('production console password recovery works without MFA secrets',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'historia-cli-')),old='Original test-only passphrase 984',replacement='Replacement test-only passphrase 723';t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let store=createIdentityStore(dir,{production:true});const admin=await store.createAdmin('owner','Owner',old);store.close();
 const cli=fileURLToPath(new URL('../manage.mjs',import.meta.url));let output='',error='',sent=0;
 const child=spawn(process.execPath,[cli,'reset-password','owner'],{env:{...process.env,DATA_DIR:dir,PUBLIC_ORIGIN:'https://game.example.com'},stdio:['pipe','pipe','pipe']});
 child.stdout.on('data',chunk=>{output+=chunk;if(!sent&&output.includes('hidden): ')){sent=1;child.stdin.write(replacement+'\n');}if(sent===1&&output.includes('Confirm password')){sent=2;child.stdin.write(replacement+'\n');}});child.stderr.on('data',chunk=>error+=chunk);
 const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);const timeout=setTimeout(()=>{child.kill();reject(new Error('Console recovery timeout'));},10000);child.on('close',()=>clearTimeout(timeout));});assert.equal(code,0,error);assert(!output.includes(replacement));
 store=createIdentityStore(dir,{production:true});try{assert(await verifyPassword(replacement,store.findUser(admin.user.id).password_hash));assert(!('mfa' in store.publicUser(store.findUser(admin.user.id))));}finally{store.close();}
});

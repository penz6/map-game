import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createIdentityStore, securityConfig } from './security.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),dir=process.env.DATA_DIR||path.join(root,'data');
let muted=false;const out=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk,encoding);done();}});
const input=createInterface({input:process.stdin,output:out,terminal:!!process.stdin.isTTY});
const question=async(label,secret=false)=>{process.stdout.write(label);muted=secret;try{return await input.question('');}finally{muted=false;if(secret)process.stdout.write('\n');}};
const newPassword=async()=>{const a=await question('New password/passphrase (15–128 characters; hidden): ',true),b=await question('Confirm password (hidden): ',true);if(a!==b)throw new Error('Passwords do not match.');return a;};
function enrollment(name,secret){console.log(`Enroll this secret in an authenticator app for Historia Local / ${name}:\n${secret}\nKeep it private. It is shown only here. Password recovery never bypasses MFA; use reset-mfa from the server console if you lose the authenticator.`);}
let store;
try{
 const command=process.argv[2];if(!['create-admin','reset-password','reset-mfa'].includes(command))throw new Error('Usage: node manage.mjs create-admin | reset-password USERNAME | reset-mfa USERNAME');
 const config=securityConfig();store=createIdentityStore(dir,{production:config.production,keyHex:config.mfaKey});
 if(command==='create-admin'){
  const name=await question('Administrator username: '),display=await question('Display name: '),password=await newPassword();
  const result=await store.createAdmin(name,display,password);enrollment(result.user.username,result.secret);console.log('Administrator created. Sign in using the password and a current six-digit authenticator code.');
 }else if(command==='reset-password'){await store.resetPassword(process.argv[3],await newPassword());console.log('Password changed. All account sessions were revoked.');}
 else if(command==='reset-mfa'){const name=process.argv[3];if(!name)throw new Error('Specify the username.');const answer=await question(`Replace the authenticator for ${name}? Type RESET: `);if(answer!=='RESET')throw new Error('Cancelled.');enrollment(name,store.resetMFA(name));}
}catch(e){console.error(e.message);process.exitCode=1;}finally{input.close();store?.close();}

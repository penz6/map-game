import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createIdentityStore, securityConfig } from './security.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),dir=process.env.DATA_DIR||path.join(root,'data');
let muted=false;const out=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk,encoding);done();}});
out.isTTY=!!process.stdout.isTTY;out.columns=process.stdout.columns;
const input=createInterface({input:process.stdin,output:out,terminal:!!process.stdin.isTTY});
const resize=()=>{out.columns=process.stdout.columns;out.emit('resize');};
process.stdout.on('resize',resize);
const question=async(label,secret=false)=>{
 const controller=new AbortController(),closed=()=>controller.abort();
 input.once('close',closed);
 try{
  // Let readline own the real prompt so editing/redraw cannot erase a label
  // written outside it. Render the prompt before suppressing password echo.
  const answer=input.question(label,{signal:controller.signal});muted=secret;
  return await answer;
 }catch(e){if(e.name==='AbortError')throw new Error('Input closed. Run this command in an interactive container terminal.');throw e;}
 finally{input.removeListener('close',closed);muted=false;if(secret)process.stdout.write('\n');}
};
const newPassword=async()=>{const a=await question('New password/passphrase (15–128 characters; hidden): ',true),b=await question('Confirm password (hidden): ',true);if(a!==b)throw new Error('Passwords do not match.');return a;};
let store;
try{
 const command=process.argv[2];if(!['create-admin','reset-password'].includes(command))throw new Error('Usage: node manage.mjs create-admin | reset-password USERNAME');
 const config=securityConfig();store=createIdentityStore(dir,{});
 if(command==='create-admin'){
  const name=await question('Administrator username: '),display=await question('Display name: '),password=await newPassword();
  await store.createAdmin(name,display,password);console.log('Administrator created. Sign in using your username and password.');
 }else if(command==='reset-password'){await store.resetPassword(process.argv[3],await newPassword());console.log('Password changed. All account sessions were revoked.');}

}catch(e){console.error(e.message);process.exitCode=1;}finally{process.stdout.removeListener('resize',resize);input.close();store?.close();}

import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
const dir=new URL('../secrets/',import.meta.url),file=new URL('mfa_key',dir);
fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);
try{
 // Compose bind-mounted secrets retain host ownership. The enclosing directory
 // is owner-only; the read-only file stays readable by the non-root image user.
 fs.writeFileSync(file,randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o444});
 console.log('Created secrets/mfa_key. Keep its parent directory private and back up the key separately.');
}catch(e){if(e.code==='EEXIST')console.log('Existing secrets/mfa_key preserved; no key was rotated.');else throw e;}

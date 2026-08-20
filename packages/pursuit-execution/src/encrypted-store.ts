import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface EncryptedRecord { iv:string; tag:string; ciphertext:string }
export class EncryptedStore {
  private readonly values=new Map<string,EncryptedRecord>();
  constructor(private readonly key:Buffer){ if(key.length!==32) throw new Error('PURSUIT_SECRET_KEY_BASE64 must decode to 32 bytes'); }
  put(ref:string,value:string){ const iv=randomBytes(12); const c=createCipheriv('aes-256-gcm',this.key,iv); const ciphertext=Buffer.concat([c.update(value,'utf8'),c.final()]); this.values.set(ref,{iv:iv.toString('base64'),tag:c.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}); }
  get(ref:string){ const r=this.values.get(ref); if(!r) return undefined; const d=createDecipheriv('aes-256-gcm',this.key,Buffer.from(r.iv,'base64')); d.setAuthTag(Buffer.from(r.tag,'base64')); return Buffer.concat([d.update(Buffer.from(r.ciphertext,'base64')),d.final()]).toString('utf8'); }
  delete(ref:string){this.values.delete(ref)}
}
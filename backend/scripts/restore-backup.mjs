import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const args=process.argv.slice(2)
const sourceArg=args.find((value)=>!value.startsWith('--'))
if(!sourceArg||!args.includes('--confirm')){
  console.error('Usage: npm run restore -- <backup.sqlite> --confirm')
  process.exit(2)
}
const source=path.resolve(sourceArg)
const target=path.resolve(process.env.DATABASE_PATH||'./data/aezakmi.sqlite')
if(!fs.existsSync(source))throw new Error(`Backup not found: ${source}`)
const check=new Database(source,{readonly:true,fileMustExist:true})
try{const result=check.pragma('integrity_check',{simple:true});if(String(result).toLowerCase()!=='ok')throw new Error(`Backup integrity check failed: ${result}`)}finally{check.close()}
fs.mkdirSync(path.dirname(target),{recursive:true})
const stamp=new Date().toISOString().replace(/[:.]/g,'-')
if(fs.existsSync(target))fs.copyFileSync(target,`${target}.pre-restore-${stamp}.bak`)
const temp=`${target}.restore.tmp`
fs.copyFileSync(source,temp)
for(const suffix of ['-wal','-shm']){try{fs.unlinkSync(`${target}${suffix}`)}catch{}}
fs.renameSync(temp,target)
const verify=new Database(target,{readonly:true,fileMustExist:true})
try{const result=verify.pragma('integrity_check',{simple:true});if(String(result).toLowerCase()!=='ok')throw new Error(`Restored database integrity check failed: ${result}`)}finally{verify.close()}
console.log(`Database restored and verified: ${target}`)
console.log('Restart Café Edge now.')

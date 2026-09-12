const DB_NAME='aezakmi-local-cache'
const STORE='snapshots'

function database(){return new Promise((resolve,reject)=>{if(!window.indexedDB)return reject(new Error('IndexedDB unavailable'));const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export async function readSnapshot(key){try{const db=await database();return await new Promise((resolve,reject)=>{const request=db.transaction(STORE,'readonly').objectStore(STORE).get(key);request.onsuccess=()=>resolve(request.result?.value??null);request.onerror=()=>reject(request.error)})}catch{return null}}
export async function writeSnapshot(key,value){try{const db=await database();await new Promise((resolve,reject)=>{const request=db.transaction(STORE,'readwrite').objectStore(STORE).put({value,savedAt:Date.now()},key);request.onsuccess=()=>resolve();request.onerror=()=>reject(request.error)})}catch{/* Cache is opportunistic. */}}

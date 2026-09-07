const requestResult=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const committed=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('The data transaction was cancelled.'));tx.onerror=()=>{};});

export class ExperimentStore {
  constructor(factory=globalThis.indexedDB){
    this.memory=new Map();this.memoryReplays=new Map();this.queue=Promise.resolve();this.warning='';
    this.ready=new Promise((resolve,reject)=>{
      if(!factory){reject(Error('Browser storage is unavailable.'));return;}
      const request=factory.open('canopy-experiments',1);
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('experiments',{keyPath:'id'});db.createObjectStore('replays');};
      request.onsuccess=()=>{this.db=request.result;this.db.onversionchange=()=>this.db.close();resolve(this.db);};
      request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Close other Canopy tabs to open saved results.'));
    }).catch(error=>{this.warning=error.message+' Results are held in this tab; export a backup.';return null;});
  }
  enqueue(fn){const operation=this.queue.then(fn);this.queue=operation.catch(()=>{});return operation;}
  put(record,replay){
    const snapshot=structuredClone(record);
    return this.enqueue(async()=>{
      const db=await this.ready;
      try{if(!db)throw Error(this.warning);const tx=db.transaction(['experiments','replays'],'readwrite'),done=committed(tx);tx.objectStore('experiments').put(snapshot);if(replay)tx.objectStore('replays').put(replay,snapshot.id);await done;this.memory.delete(snapshot.id);this.memoryReplays.delete(snapshot.id);return {persistent:true};}
      catch(error){this.memory.set(snapshot.id,snapshot);if(replay)this.memoryReplays.set(snapshot.id,replay);this.warning='Could not save to browser storage. Current results remain in this tab; export a backup. '+(error.message||'');return {persistent:false};}
    });
  }
  async all(){await this.queue;const db=await this.ready;let records=[];if(db)records=await requestResult(db.transaction('experiments').objectStore('experiments').getAll());const map=new Map(records.map(r=>[r.id,r]));for(const [id,r] of this.memory)map.set(id,structuredClone(r));return [...map.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
  async get(id){await this.queue;if(this.memory.has(id))return structuredClone(this.memory.get(id));const db=await this.ready;return db?requestResult(db.transaction('experiments').objectStore('experiments').get(id)):undefined;}
  async replay(id){await this.queue;if(this.memoryReplays.has(id))return this.memoryReplays.get(id);const db=await this.ready;return db?requestResult(db.transaction('replays').objectStore('replays').get(id)):undefined;}
  import(records,replays=new Map()){
    const snapshots=structuredClone(records);
    return this.enqueue(async()=>{
      const db=await this.ready;
      if(!db){for(const r of snapshots){this.memory.set(r.id,r);if(replays.has(r.id))this.memoryReplays.set(r.id,replays.get(r.id));}return {persistent:false};}
      // add (not put) refuses duplicate IDs, and the transaction is all-or-nothing.
      const tx=db.transaction(['experiments','replays'],'readwrite'),done=committed(tx);
      for(const r of snapshots){tx.objectStore('experiments').add(r);if(replays.has(r.id))tx.objectStore('replays').add(replays.get(r.id),r.id);}
      await done;return {persistent:true};
    });
  }
  clear(){return this.enqueue(async()=>{const db=await this.ready;if(db){const tx=db.transaction(['experiments','replays'],'readwrite'),done=committed(tx);tx.objectStore('experiments').clear();tx.objectStore('replays').clear();await done;}this.memory.clear();this.memoryReplays.clear();});}
}

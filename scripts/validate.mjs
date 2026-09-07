import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve('dist'),all=[];function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else all.push(p);}}walk(root);
const errors=[];let modules=0,links=0;
for(const p of all){
  const ext=path.extname(p);if(!['.js','.html','.css'].includes(ext))continue;const text=fs.readFileSync(p,'utf8');
  if(ext==='.js'){
    try{execFileSync(process.execPath,['--check',p],{stdio:'pipe'});modules++;}catch(e){errors.push(`Syntax: ${p}: ${e.stderr}`);}
    for(const m of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const target=path.resolve(path.dirname(p),m[1]);if(!fs.existsSync(target))errors.push(`Missing module ${m[1]} in ${p}`);links++;}
    for(const m of text.matchAll(/importScripts\(['"](\.[^'"]+)['"]/g)){const target=path.resolve(path.dirname(p),m[1]);if(!fs.existsSync(target))errors.push(`Missing classic worker asset ${m[1]} in ${p}`);links++;}
    for(const m of text.matchAll(/new URL\(['"](\.[^'"]+)['"]/g)){const target=path.resolve(path.dirname(p),m[1]);if(!fs.existsSync(target))errors.push(`Missing worker ${m[1]} in ${p}`);links++;}
  }
  if(ext==='.html')for(const m of text.matchAll(/(?:src|href)=["'](\.\/[^"']+)["']/g)){const target=path.resolve(path.dirname(p),m[1]);if(!fs.existsSync(target))errors.push(`Missing asset ${m[1]}`);links++;}
}
const html=fs.readFileSync('dist/index.html','utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]),set=new Set(ids);if(set.size!==ids.length)errors.push('Duplicate static HTML IDs');
const app=fs.readFileSync('dist/src/app.js','utf8');for(const m of app.matchAll(/\$\(['"]#([\w-]+)['"]\)/g)){if(!set.has(m[1])&&!app.includes(`id=\\"${m[1]}\\"`)&&!app.includes(`id="${m[1]}"`)&&!m[1].startsWith('c-'))errors.push(`Unresolved control ID ${m[1]}`);}
const sources=all.filter(p=>p.includes(path.sep+'src'+path.sep)&&p.endsWith('.js')).map(p=>fs.readFileSync(p,'utf8')),combined=sources.join('\n');for(const source of sources)for(const m of source.matchAll(/this\.\$\(['"]([\w-]+)['"]\)/g))if(!set.has(m[1])&&!combined.includes(`id="${m[1]}"`))errors.push(`Unresolved component control ID ${m[1]}`);
// Hosted-project metadata is optional in the standalone source distribution.
if(fs.existsSync('.openai/hosting.json')){const h=JSON.parse(fs.readFileSync('.openai/hosting.json','utf8'));if(h.static?.directory!=='dist')errors.push('Wrong public output directory');}
const forbidden=all.filter(p=>/\.(env|map|py|mjs)$/.test(p));if(forbidden.length)errors.push('Unexpected nonpublic assets in dist');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log(`Validated ${modules} JavaScript modules, ${links} local module/asset paths, ${ids.length} unique static controls, and static entrypoint. No runtime CDN dependencies.`);

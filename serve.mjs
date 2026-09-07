import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const port=Number(process.env.CANOPY_PORT)||8080;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.stl':'model/stl','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}
  const filename=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  fs.stat(filename,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(filename).pipe(res);});
}).listen(port,'127.0.0.1',()=>console.log(`Canopy studio: http://localhost:${port}\nLeave this terminal open; press Ctrl+C to stop. No installation or network access is required.`));

import {CURVES,SUMMARY_FIELDS} from './experiment-data.js';
export const PALETTE=['#356c59','#b77843','#627daa','#946695','#9c913e','#4d9393','#b56664','#597346','#786caa','#ba874e'];
export const SCATTER_FIELDS={...SUMMARY_FIELDS,'design.disorder':['Disorder','fraction'],'design.hierarchy':['Hierarchy depth','level'],'design.radius':['Primary strut radius','mm'],'design.gradient':['Thickness gradient','fraction'],'design.anisotropy':['Horizontal stretch','ratio'],'material.E':['Constituent modulus','MPa']};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function metricValue(record,key){const fields=key.split('.');return fields.length===2?record.parameters?.[fields[0]]?.[fields[1]]:record.summary?.[key];}
export function curvePoints(record,type){const c=CURVES[type];if(!c)return [];return record.steps.filter(s=>s.kind==='equilibrium'&&s.converged&&Number.isFinite(s[c[0]])&&Number.isFinite(s[c[1]])).map(s=>({x:s[c[0]]*c[4],y:s[c[1]]*c[5],sequence:s.sequence}));}
export function resultPlotSVG(records,{type='stress',xMetric='firstRuptureStrain',yMetric='maxForceN',legend=false}={}){
  const scatter=type==='scatter',spec=CURVES[type]||CURVES.stress,xf=SCATTER_FIELDS[xMetric]||SCATTER_FIELDS.firstRuptureStrain,yf=SCATTER_FIELDS[yMetric]||SCATTER_FIELDS.maxForceN;
  const xlabel=scatter?`${xf[0]} (${xf[1]})`:spec[2],ylabel=scatter?`${yf[0]} (${yf[1]})`:spec[3];
  const series=records.map((r,i)=>({record:r,color:PALETTE[i%PALETTE.length],points:scatter?(()=>{const x=metricValue(r,xMetric),y=metricValue(r,yMetric);return Number.isFinite(x)&&Number.isFinite(y)?[{x:x*(xf[1]==='%'?100:1),y:y*(yf[1]==='%'?100:1)}]:[];})():curvePoints(r,type)}));
  let xmin=0,xmax=0,ymin=0,ymax=0,total=0;for(const s of series)for(const p of s.points){xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);total++;}
  if(xmax===xmin)xmax=xmin+1;if(ymax===ymin)ymax=ymin+1;const yrange=ymax-ymin;ymax+=.08*yrange;ymin-=ymin<0?.08*yrange:0;
  const w=1040,plotH=450,left=88,right=1007,top=42,bottom=383,h=plotH+(legend?Math.ceil(series.length/3)*24+18:0),X=x=>left+(x-xmin)/(xmax-xmin)*(right-left),Y=y=>bottom-(y-ymin)/(ymax-ymin)*(bottom-top),n=v=>Math.abs(v)>=10000||Math.abs(v)>0&&Math.abs(v)<.001?v.toExponential(2):+v.toPrecision(4);
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(ylabel+' versus '+xlabel)}"><rect width="100%" height="100%" fill="#fbfcf9"/><style>text{font-family:Arial,Helvetica,sans-serif;fill:#576e5d;font-size:13px}.title{font-size:16px;fill:#234e40;font-weight:600}</style><text x="${left}" y="23" class="title">${esc(ylabel)} / ${esc(xlabel)}</text>`];
  for(let i=0;i<=5;i++){const x=xmin+(xmax-xmin)*i/5,y=ymin+(ymax-ymin)*i/5;out.push(`<path d="M${X(x)},${top}V${bottom}M${left},${Y(y)}H${right}" stroke="#e0e7db" fill="none"/><text x="${X(x)}" y="${bottom+22}" text-anchor="middle">${n(x)}</text><text x="${left-12}" y="${Y(y)+4}" text-anchor="end">${n(y)}</text>`);}
  out.push(`<text x="${(left+right)/2}" y="${plotH-13}" text-anchor="middle">${esc(xlabel)}</text><text transform="translate(20 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle">${esc(ylabel)}</text>`);
  for(const s of series){
    if(!scatter&&s.points.length)out.push(`<path d="${s.points.map((p,i)=>(i?'L':'M')+X(p.x).toFixed(2)+','+Y(p.y).toFixed(2)).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2"><title>${esc(s.record.name)} · ${s.points.length} converged states</title></path>`);
    for(const p of scatter?s.points:s.points.length===1?s.points:[])out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="5" fill="${s.color}"><title>${esc(s.record.name)}: ${n(p.x)}, ${n(p.y)}</title></circle>`);
  }
  if(!total)out.push(`<text x="${(left+right)/2}" y="210" text-anchor="middle">${records.length?'No observed values for these axes. Unreached rupture metrics stay blank.':'Select experiments to compare their results.'}</text>`);
  if(legend)series.forEach((s,i)=>{const x=35+(i%3)*335,y=plotH+20+Math.floor(i/3)*24;out.push(`<path d="M${x},${y-4}h18" stroke="${s.color}" stroke-width="3"/><text x="${x+25}" y="${y}">${esc(s.record.name.slice(0,40))}</text>`);});
  out.push('</svg>');return out.join('');
}

// View coordinates only. Solver states, replay arrays, and fabrication inputs
// always retain their physical coordinates and measured fields.
export function normalizeDisplacementScale(value){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(1,Math.min(100,Math.round(n*10)/10)):1;
}

export function displayPoint(nodes,positions,id,scale=1){
  const node=nodes[id],rest=[node.x,node.y,node.z||0];
  if(!positions)return rest;
  if(scale===1)return [positions[3*id],positions[3*id+1],positions[3*id+2]];
  return rest.map((x,k)=>x+scale*(positions[3*id+k]-x));
}

export function deformationBounds(nodes,positions,scale,graph,frames=[]){
  const min=[0,0,0],max=[graph.width,graph.height,graph.depth||0];
  // Avoid allocating a point for every node of every replay frame. Including
  // the whole recording keeps the camera still as an exaggerated replay moves.
  const include=q=>{if(!q)return;for(let i=0;i<nodes.length;i++){const n=nodes[i];for(let k=0;k<3;k++){const ref=k===0?n.x:k===1?n.y:n.z||0,p=ref+scale*(q[3*i+k]-ref);min[k]=Math.min(min[k],p);max[k]=Math.max(max[k],p);}}};
  include(positions);for(const frame of frames)if(frame.positions!==positions)include(frame.positions);
  return {min,max};
}

export function displacementLabel(scale){return `Displacements ×${Number(normalizeDisplacementScale(scale).toFixed(1))} · view only`;}

// Use the same compact annotation for PNGs and movies with full labels off.
export function drawDisplacementLabel(ctx,width,height,scale){
  if(scale<=1)return;
  const unit=Math.max(.75,width/1280),pad=16*unit,text=displacementLabel(scale);
  ctx.save();ctx.font=`${16*unit}px Arial`;ctx.textAlign='left';ctx.textBaseline='middle';
  const boxWidth=ctx.measureText(text).width+2*pad,boxHeight=38*unit;
  ctx.fillStyle='#f2f5eef0';ctx.fillRect(pad,height-pad-boxHeight,boxWidth,boxHeight);
  ctx.fillStyle='#234e40';ctx.fillText(text,2*pad,height-pad-boxHeight/2);ctx.restore();
}

export function captureWithDisplacementLabel(canvas,scale){
  if(scale<=1)return canvas.toDataURL('image/png');
  const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;
  const ctx=output.getContext('2d');ctx.drawImage(canvas,0,0);drawDisplacementLabel(ctx,output.width,output.height,scale);
  return output.toDataURL('image/png');
}

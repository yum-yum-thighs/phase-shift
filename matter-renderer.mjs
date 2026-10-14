const RGB = {solid:[214,244,134],liquid:[130,217,223],gas:[197,181,237]};
const rgba=(c,a=1)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
export function matterColor(game){
  const t=game.transition.progress, a=RGB[game.transition.from], b=RGB[game.transition.to];
  return a.map((v,i)=>Math.round(v+(b[i]-v)*t));
}

// A density isosurface is rebuilt from the actual simulation positions every frame.
// Marching triangles interpolate the surface between samples; detached droplets
// become separate surfaces without inventing a predefined player outline.
function surface(ctx,points,radius,threshold,color,solid=false){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
  x0=Math.floor(x0-radius-2);y0=Math.floor(y0-radius-2);x1+=radius+2;y1+=radius+2;
  const cell=Math.max(3.5,Math.sqrt((x1-x0)*(y1-y0)/7000));
  const cols=Math.ceil((x1-x0)/cell)+1,rows=Math.ceil((y1-y0)/cell)+1;
  const field=new Float32Array(cols*rows),r2=radius*radius;
  for(const p of points){
    const minX=Math.max(0,Math.floor((p.x-radius-x0)/cell)),maxX=Math.min(cols-1,Math.ceil((p.x+radius-x0)/cell));
    const minY=Math.max(0,Math.floor((p.y-radius-y0)/cell)),maxY=Math.min(rows-1,Math.ceil((p.y+radius-y0)/cell));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      const d2=(x0+x*cell-p.x)**2+(y0+y*cell-p.y)**2;
      if(d2<r2){const q=1-d2/r2;field[y*cols+x]+=q*q;}
    }
  }
  const edges=[];ctx.beginPath();
  function triangle(a,b,c){
    const nodes=[a,b,c],poly=[],crossings=[];
    for(let i=0;i<3;i++){
      const u=nodes[i],v=nodes[(i+1)%3],inside=u[2]>=threshold;
      if(inside)poly.push(u);
      if(inside!==(v[2]>=threshold)){
        const t=(threshold-u[2])/(v[2]-u[2]),p=[u[0]+(v[0]-u[0])*t,u[1]+(v[1]-u[1])*t];
        poly.push(p);crossings.push(p);
      }
    }
    if(poly.length){ctx.moveTo(poly[0][0],poly[0][1]);for(let i=1;i<poly.length;i++)ctx.lineTo(poly[i][0],poly[i][1]);ctx.closePath();}
    if(crossings.length===2)edges.push(crossings);
  }
  for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
    const i=y*cols+x,a=[x0+x*cell,y0+y*cell,field[i]],b=[a[0]+cell,a[1],field[i+1]],c=[a[0]+cell,a[1]+cell,field[i+cols+1]],d=[a[0],a[1]+cell,field[i+cols]];
    if(Math.max(a[2],b[2],c[2],d[2])<threshold)continue;
    triangle(a,b,c);triangle(a,c,d);
  }
  const gradient=ctx.createLinearGradient(x0,y0,x0,y1);
  gradient.addColorStop(0,rgba(color,.96));gradient.addColorStop(1,rgba(color,solid?.8:.6));
  ctx.fillStyle=gradient;ctx.fill();
  ctx.beginPath();for(const [a,b] of edges){ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}
  ctx.strokeStyle=solid?'#f0ffcbbb':'#d8ffffbb';ctx.lineWidth=solid?1:.9;ctx.stroke();
}

function vapor(ctx,points,color,time,t){
  for(const p of points){
    const r=7+6*t+Math.sin(time*1.3+p.id)*2;
    const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
    g.addColorStop(0,rgba(color,.16));g.addColorStop(.4,rgba(color,.08));g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g;ctx.fillRect(p.x-r,p.y-r,r*2,r*2);
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.quadraticCurveTo(p.x-p.vx*.025+Math.sin(p.id+time)*4,p.y-p.vy*.025,p.x-p.vx*.065,p.y-p.vy*.065);
    ctx.strokeStyle=rgba(color,.09);ctx.lineWidth=3;ctx.stroke();
  }
}

export function renderMatter(ctx,game,time,{molecules=false}={}){
  const points=game.particles,phase=game.player.phase,color=matterColor(game),t=game.transition.progress;
  const cx=game.center.x,cy=game.center.y;
  const glow=ctx.createRadialGradient(cx,cy,5,cx,cy,130);glow.addColorStop(0,rgba(color,.12));glow.addColorStop(1,rgba(color,0));ctx.fillStyle=glow;ctx.fillRect(cx-130,cy-130,260,260);
  if(phase==='gas'){
    // Overlapping low-opacity density kernels and velocity-oriented wisps. Each
    // molecule moves independently: this isn't a single cloud image being moved.
    if(t<1&&game.transition.from!=='gas'){ctx.save();ctx.globalAlpha=1-t;surface(ctx,points,7.2,.7,color);ctx.restore();}
    ctx.save();ctx.globalAlpha=.15+.85*t;vapor(ctx,points,color,time,t);ctx.restore();
  }else{
    if(t<1&&game.transition.from==='gas'){ctx.save();ctx.globalAlpha=1-t;vapor(ctx,points,color,time,1);ctx.restore();}
    ctx.save();ctx.globalAlpha=game.transition.from==='gas'?.2+.8*t:1;
    const radius=phase==='solid'?7.2-1.8*t:game.transition.from==='solid'?5.4+1.8*t:7.2;
    surface(ctx,points,radius,phase==='solid'?.4:.7,color,phase==='solid');ctx.restore();
    if(phase==='solid'){
      // Bonds connect the captured material. Their positions rotate with the body.
      ctx.beginPath();for(const [i,j] of game.bonds){const a=points[i],b=points[j];ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}
      ctx.strokeStyle=rgba([245,255,220],molecules?.65:.19);ctx.lineWidth=.6;ctx.stroke();
    }else{
      ctx.beginPath();for(const p of points){if(p.id%4===0){ctx.moveTo(p.x-1.2,p.y-1);ctx.lineTo(p.x+1.2+Math.min(4,Math.abs(p.vx)*.02),p.y-1);}}
      ctx.strokeStyle='#edffff55';ctx.lineWidth=.8;ctx.stroke();
    }
  }
  if(molecules){
    ctx.fillStyle=rgba([245,255,250],.85);ctx.beginPath();for(const p of points){ctx.moveTo(p.x+1.25,p.y);ctx.arc(p.x,p.y,1.25,0,Math.PI*2);}ctx.fill();
  }
  // Crystallization advances through the captured body instead of appearing at once.
  if(phase==='solid'&&t<1){
    const order=[...points].sort((a,b)=>a.y-b.y);const count=Math.floor(t*points.length);
    ctx.fillStyle='#f5ffd9';ctx.beginPath();for(let i=Math.max(0,count-12);i<count;i++){const p=order[i];ctx.moveTo(p.x+2,p.y);ctx.arc(p.x,p.y,2,0,Math.PI*2);}ctx.fill();
  }
  ctx.lineWidth=1;
}

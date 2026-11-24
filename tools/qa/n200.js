const L=require('./lib.js');const d=L.loadAll();const l=d.levels[199];
let fatal=0,unk=0,ok=0;const t0=Date.now();
L.legalMoves(l.tubes,l.caps).forEach(([a,b])=>{const t=l.tubes.map(x=>x.slice());t[b].push(t[a].pop());const r=L.solve(t,l.caps,{maxNodes:1500000,weight:2});if(r.status==='unsolvable')fatal++;else if(r.status==='unknown')unk++;else ok++;});
console.log({fatal,unk,ok,sec:(Date.now()-t0)/1000});

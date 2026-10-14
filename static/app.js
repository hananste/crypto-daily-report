const $=id=>document.getElementById(id);
const usd=(n,d=0)=>n==null?'—':'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const big=n=>n==null?'—':n>=1e12?'$'+(n/1e12).toFixed(2)+'T':n>=1e9?'$'+(n/1e9).toFixed(1)+'B':'$'+(n/1e6).toFixed(1)+'M';
const pct=(n,d=2)=>n==null?'<span class=flat>—</span>':`<span class=${n>=0?'up':'dn'}>${n>=0?'+':''}${n.toFixed(d)}%</span>`;
const px=n=>n>=100?usd(n,0):n>=1?usd(n,2):usd(n,4);
const na=s=>`<div class=na>Unavailable<small>${s.source||''} · tried ${s.fetched_ts?dtFmt(s.fetched_ts):s.fetched||'?'}${s.error?' · '+s.error.replace(/</g,'&lt;'):''}${s.reason?' · '+s.reason:''}</small></div>`;
let CUR=null,LIVE=false;
const etFmt=ts=>new Date(ts*1000).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const dtFmt=ts=>new Date(ts*1000).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
const MAXAGE={live:300,snapshot:2700,daily:93600};
function fresh(sec,kind){ // returns sec, or an 'unavailable' stand-in if failed/stale
  if(!sec)return{status:'unavailable',error:'missing'};
  if(sec.status!='ok')return sec;
  if(!LIVE)return sec; // viewing a past report: show as archived
  const age=Date.now()/1000-(sec.fetched_ts||0),lim=sec.live?MAXAGE.live:MAXAGE[kind]||MAXAGE.snapshot;
  return age>lim?{...sec,status:'unavailable',error:`stale (last good ${dtFmt(sec.fetched_ts)}, ${Math.round(age/60)} min old)`}:sec;}
const upd=s=>s&&s.status=='ok'?`<div class=upd>Updated ${s.fetched_ts?etFmt(s.fetched_ts):s.fetched} · ${s.live?'live from browser':LIVE?'GitHub Action':'archived report'}</div>`:'';
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('on',x==b));$('pub').style.display=b.dataset.v=='pub'?'':'none';$('priv').style.display=b.dataset.v=='priv'?'':'none';});
async function init(){
  let idx=[];try{idx=await (await fetch('data/index.json')).json()}catch(e){}
  $('pick').innerHTML=idx.slice().reverse().map(d=>`<option>${d}</option>`).join('');
  $('pick').innerHTML='<option value=live>Live</option>'+$('pick').innerHTML;
  $('pick').onchange=()=>{LIVE=$('pick').value=='live';LIVE?load('data/latest.json'):load('data/report_'+$('pick').value+'.json')};
  LIVE=true;await load('data/latest.json');setInterval(()=>{if(LIVE)tick()},60000);
}
async function load(u){try{CUR=await (await fetch(u+'?t='+Date.now())).json();}catch(e){CUR={date:new Date().toISOString().slice(0,10),generated:'—',changes:[{dir:'flat',text:'Report JSON unavailable'}],btc:{},market:{},derivatives:{},flows:{},fng:{},calendar:{status:'unavailable'}}}render(CUR);if(LIVE)tick();}
const STABLE=new Set(['USDT','USDC','DAI','USDE','FDUSD','TUSD','PYUSD','USDS','USD1','BUSD','FRAX','USDD','USDP','GUSD','LUSD','USDG','RLUSD','USDTB','USD0','CRVUSD','GHO','EURC','XAUT','PAXG','FIGR_HELOC']);
let STABLE_IDS=null;
const pegged=c=>{const p=(c.sparkline_in_7d||{}).price||[];return p.length>0&&p.every(x=>x>=0.95&&x<=1.05)};
const isStable=c=>pegged(c)||STABLE.has(c.symbol.toUpperCase())||(STABLE_IDS&&STABLE_IDS.has(c.id))||/^usd|usd$/i.test(c.symbol)&&Math.abs(c.current_price-1)<0.03;
const J=async u=>{const x=await fetch(u);if(!x.ok)throw new Error('HTTP '+x.status);return x.json()};
const nowS=()=>Math.floor(Date.now()/1000),nowET=()=>dtFmt(Date.now()/1000);
const sma=(a,n)=>a.length>=n?a.slice(-n).reduce((x,y)=>x+y)/n:null;
async function tick(){
  const base=CUR,live={live:true,status:'ok',fetched:nowET(),fetched_ts:nowS()};
  const jobs={
   btc:async()=>{const CB='https://api.exchange.coinbase.com/products/BTC-USD/';const[c,t,s]=await Promise.all([J(CB+'candles?granularity=86400'),J(CB+'ticker'),J(CB+'stats')]);
     const candles=c.sort((a,b)=>a[0]-b[0]).map(r=>({time:r[0],open:r[3],high:r[2],low:r[1],close:r[4]}));const cl=candles.map(x=>x.close),price=+t.price;
     const s20=sma(cl,20),s50=sma(cl,50);const p=base.btc&&base.btc.status=='ok'?base.btc:{};
     return{...p,...live,source:'Coinbase Exchange public API',price,change_24h:(price/ +s.open-1)*100,change_7d:cl.length>7?(price/cl[cl.length-8]-1)*100:null,high_24h:+s.high,low_24h:+s.low,sma20:s20,sma50:s50,sma200:sma(cl,200),
       trend:price>s20&&s20>s50?'Uptrend':price<s20&&s20<s50?'Downtrend':'Mixed / range',supports:p.supports||[],resistances:p.resistances||[],levels:p.levels||[{price:83000,label:'Support 83k'},{price:92000,label:'Resistance 92k'},{price:95000,label:'Resistance 95k'}],candles:candles.slice(-180)}},
   derivatives:async()=>{const O='https://www.okx.com/api/v5/public/';const[f,oi,lq]=await Promise.all([J(O+'funding-rate?instId=BTC-USDT-SWAP'),J(O+'open-interest?instType=SWAP&instId=BTC-USDT-SWAP'),J(O+'liquidation-orders?instType=SWAP&uly=BTC-USDT&state=filled').catch(()=>null)]);
     let liq={status:'unavailable',error:'liquidation fetch failed'};if(lq&&lq.data&&lq.data[0]){let l=0,sh=0,n=0,old=Infinity;const cut=Date.now()-864e5;for(const d of lq.data[0].details){if(+d.ts<cut)continue;n++;old=Math.min(old,+d.ts);const u=+d.sz*0.01*+d.bkPx;d.posSide=='long'?l+=u:sh+=u}
       liq={long_usd:l,short_usd:sh,count:n,since:n?dtFmt(old/1000):null,scope:'OKX BTC-USDT perp only, most recent liquidation orders the free API returns (partial sample, not market-wide)'}}
     return{...live,source:'OKX public API (browser)',funding_rate_pct:+f.data[0].fundingRate*100,funding_interval:'8h (OKX BTC-USDT perp)',oi_usd:+oi.data[0].oiUsd,oi_change_pct:null,oi_scope:'OKX BTC-USDT perp, live',liq}},
   fng:async()=>{const d=(await J('https://api.alternative.me/fng/?limit=8')).data;return{...live,source:'alternative.me',value:+d[0].value,label:d[0].value_classification,yesterday:+d[1].value,week_ago:d[7]?+d[7].value:null}},
   market:async()=>{const G='https://api.coingecko.com/api/v3/';const[g,top]=await Promise.all([J(G+'global'),J(G+'coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=true&price_change_percentage=24h,7d')]);
     if(!STABLE_IDS){try{STABLE_IDS=new Set((await J(G+'coins/markets?vs_currency=usd&category=stablecoins&per_page=100&page=1')).map(c=>c.id))}catch(e){}}
     const top10=top.filter(c=>!isStable(c)).slice(0,10);const p=base.market&&base.market.status=='ok'?base.market:{};
     return{...p,...live,source:'CoinGecko free API',total_mcap:g.data.total_market_cap.usd,mcap_change_24h:g.data.market_cap_change_percentage_24h_usd,btc_dominance:g.data.market_cap_percentage.btc,
       top10:top10.map((c,i)=>({rank:i+1,mcap_rank:c.market_cap_rank,symbol:c.symbol.toUpperCase(),name:c.name,price:c.current_price,change_24h:c.price_change_percentage_24h_in_currency,change_7d:c.price_change_percentage_7d_in_currency,mcap:c.market_cap})),sectors_ts:p.sectors_ts||p.fetched_ts,sectors_fetched:p.sectors_fetched||p.fetched,sector_leaders:p.sector_leaders||[],sector_laggards:p.sector_laggards||[]}}};
  await Promise.all(Object.entries(jobs).map(async([k,fn])=>{try{base[k]=await fn()}catch(e){console.warn(k,e);/* keep Action data; staleness check decides */}}));
  if(LIVE&&CUR===base)render(base);}
function render(r0){const r={...r0};for(const k of['btc','market','derivatives','flows','fng'])r[k]=fresh(r0[k],r0.kind);
  $('dt').textContent=new Date(r.date+'T12:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  $('gen').textContent=(LIVE?'Live · refreshes every 60s · ':'Archived · ')+'report built '+(r.generated_ts?dtFmt(r.generated_ts):r.generated)+(r.kind?' ('+r.kind+')':'');$('pick').value=LIVE?'live':r.date;$('cmp').textContent=r.compared_to||'yesterday';
  const ic={up:['▲','#4ade80','74,222,128'],dn:['▼','#fb7185','251,113,133'],flat:['●','#a5b4fc','165,180,252']};
  $('chg').innerHTML=(r.changes||[]).map(c=>{const i=ic[c.dir]||ic.flat;return `<div class=li><span class=ic style="color:${i[1]};background:rgba(${i[2]},.18)">${i[0]}</span><span>${c.text}</span></div>`}).join('');
  // F&G
  const f=r.fng;if(f.status!='ok')$('fng').innerHTML=na(f);else{const a=Math.PI*(1-f.value/100),x=125+80*Math.cos(a),y=125-80*Math.sin(a);
   const cols=['#f43f5e','#fb923c','#facc15','#a3e635','#34d399'];let arcs='';for(let i=0;i<5;i++){const a0=Math.PI*(1-i/5),a1=Math.PI*(1-(i+1)/5);arcs+=`<path d="M${125+100*Math.cos(a0)},${125-100*Math.sin(a0)} A100,100 0 0 1 ${125+100*Math.cos(a1)},${125-100*Math.sin(a1)}" stroke="${cols[i]}" stroke-width=18 fill=none />`}
   const c=cols[Math.min(4,Math.floor(f.value/20))];
   $('fng').innerHTML=`<svg width=250 height=155 style="display:block;margin:auto">${arcs}<line x1=125 y1=125 x2=${x} y2=${y} stroke=#fff stroke-width=3 stroke-linecap=round /><circle cx=125 cy=125 r=5 fill=#fff /><text x=125 y=95 text-anchor=middle fill=#eef0ff font-size=34 font-weight=700>${f.value}</text><text x=125 y=148 text-anchor=middle fill="${c}" font-size=13 font-weight=700>${f.label.toUpperCase()}</text></svg><div class=k style="text-align:center">Yesterday ${f.yesterday} · Week ago ${f.week_ago??'—'}</div>`+upd(f);}
  // BTC
  const b=r.btc;
  if(b.status!='ok'){$('px').textContent='—';$('pch').innerHTML='';$('hl').textContent='';$('lvls').innerHTML=na(b);$('struct').innerHTML='';}
  else{$('px').textContent=usd(b.price);$('pch').innerHTML=`<b>${pct(b.change_24h)}</b> <span class=k>24h</span> &nbsp; <b>${pct(b.change_7d)}</b> <span class=k>7d</span>`;
   $('hl').textContent=`24h High ${usd(b.high_24h)} · Low ${usd(b.low_24h)} · Coinbase`;
   $('lvls').innerHTML='<span class=k>Key levels</span>'+(b.levels||[]).map(L=>{const d=(L.price/b.price-1)*100;return `<span class="chip ${b.price>=L.price?'above':'below'}">${L.label} <b>${usd(L.price)}</b> <span class=k>${d>=0?'+':''}${d.toFixed(1)}%</span></span>`}).join('');
   $('struct').innerHTML=`<b>Trend:</b> ${b.trend} <span class=k>(Coinbase daily: price vs SMA20 ${usd(b.sma20)} / SMA50 ${usd(b.sma50)}; SMA200 ${usd(b.sma200)})</span><br><b>Support:</b> ${b.supports.map(x=>usd(x)).join(' · ')||'—'} &nbsp; <b>Resistance:</b> ${b.resistances.map(x=>usd(x)).join(' · ')||'—'} <span class=k>(daily swing pivots, 120d · Action)</span>`+upd(b);}
  // derivatives
  const d=r.derivatives;if(d.status!='ok')$('der').innerHTML=na(d);else{let lq;const L=d.liq||{};
   if(L.status=='unavailable'||L.long_usd==null)lq=`<div class=k>Liquidations</div>${na(L)}`;else{const t=L.long_usd+L.short_usd||1;
    lq=`<div class=k>Liquidations sample · ${big(L.long_usd+L.short_usd)} (${L.count} orders since ${L.since||'?'})</div><div class=lbar><div style="width:${L.long_usd/t*100}%;background:#fb7185"></div><div style="flex:1;background:#4ade80"></div></div><div style="display:flex;justify-content:space-between" class=k><span>Long ${big(L.long_usd)}</span><span>Short ${big(L.short_usd)}</span></div><div class=k style="font-size:10.5px;margin-top:4px">${L.scope}</div>`}
   $('der').innerHTML=`<div class=blk><div class=k>Funding rate · ${d.funding_interval||''}</div><div class=v>${d.funding_rate_pct>=0?'+':''}${d.funding_rate_pct.toFixed(4)}%</div></div><div class=blk><div class=k>Open interest (${d.oi_scope||''})</div><div class=v>${big(d.oi_usd)} <span style="font-size:13px">${pct(d.oi_change_pct,1)}</span></div></div>${lq}`+upd(d);}
  // flows
  const fl=r.flows;if(fl.status!='ok')$('flo').innerHTML=na(fl);else{const ser=fl.stablecoin_series,mn=Math.min(...ser.map(p=>p.value)),mx=Math.max(...ser.map(p=>p.value));
   const pts=ser.map((p,i)=>`${i/(ser.length-1)*260},${70-(p.value-mn)/(mx-mn||1)*60}`).join(' ');
   $('flo').innerHTML=`<div class=k>Stablecoin supply (DefiLlama)</div><div class=v>${big(fl.stablecoin_supply)} <span style="font-size:13px" class=${fl.stablecoin_change_7d>=0?'up':'dn'}>${fl.stablecoin_change_7d>=0?'+':'-'}${big(Math.abs(fl.stablecoin_change_7d))} 7d</span></div><svg viewBox="0 0 260 75" style="width:100%;height:80px;margin:6px 0 14px"><polyline points="${pts}" fill=none stroke=#67e8f9 stroke-width=2 /></svg><div class=k>Spot BTC ETF flows</div>${na({...fl.etf,source:'',fetched:r.generated})}`+upd(fl);}
  // calendar
  const ca=r.calendar;$('cal').innerHTML=ca.status!='ok'?na(ca):(ca.events.length?ca.events.map(e=>`<div class=li style="justify-content:space-between"><span><span class=k>${e.utc?dtFmt(Date.parse(e.utc)/1000):e.date+' '+e.time+' ET'}</span><br>${e.name}</span><span class="imp ${e.impact}" style="align-self:center">${e.impact=='high'?'High':'Med'}</span></div>`).join(''):'<div class=k>No events listed</div>')+`<div class=k style="font-size:10.5px;margin-top:8px">Hand-maintained list (macro_calendar.json)</div>`;
  // market
  const m=r.market;if(m.status!='ok'){$('mkt').innerHTML=na(m);$('sec').innerHTML=na(m);}else{
   $('mkt').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px"><div><div class=k>Total market cap</div><div class=v>${big(m.total_mcap)} <span style="font-size:13px">${pct(m.mcap_change_24h,1)}</span></div></div><div><div class=k>BTC dominance</div><div class=v>${m.btc_dominance.toFixed(1)}%</div></div></div>
   <div class=tscroll><table><tr><th class=l>#</th><th class=l>Coin</th><th>Price</th><th>24h</th><th>7d</th><th>Cap</th></tr>${m.top10.map(c=>`<tr><td class=l>${c.rank}</td><td class=l>${c.symbol} <span class=sym>${c.name}</span></td><td>${px(c.price)}</td><td>${pct(c.change_24h)}</td><td>${pct(c.change_7d)}</td><td>${big(c.mcap)}</td></tr>`).join('')}</table></div>`+upd(m);
   const n=Math.max(m.sector_leaders.length,m.sector_laggards.length);let h='';for(let i=0;i<n;i++){const a=m.sector_leaders[i],z=m.sector_laggards[i];h+=`<span>${a?a.name:''}</span><b>${a?pct(a.change_24h,1):''}</b><span>${z?z.name:''}</span><b>${z?pct(z.change_24h,1):''}</b>`}
   $('sec').innerHTML=`<div class=sg>${h}</div><div class=k style="font-size:10.5px;margin-top:8px">CoinGecko categories &gt;$2B cap, 24h market-cap change</div>`+upd({status:'ok',fetched_ts:m.sectors_ts||m.fetched_ts,fetched:m.sectors_fetched||m.fetched});}
  $('foot').innerHTML='Sources: '+['btc','market','derivatives','flows','fng','calendar'].map(k=>`${k}: ${r[k].source} (${r[k].status}, ${r[k].fetched_ts?dtFmt(r[k].fetched_ts):r[k].fetched})`).join(' · ')+'. Not financial advice.';
}
init();

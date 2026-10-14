#!/usr/bin/env python3
"""Daily crypto + BTC report gatherer. Stdlib only, free public APIs, no keys."""
import json, os, sys, time, urllib.request, glob
from datetime import datetime, timezone, timedelta
try:
    from zoneinfo import ZoneInfo; ET = ZoneInfo("America/Chicago")
except Exception:
    ET = timezone(timedelta(hours=-5))
HERE = os.path.dirname(os.path.abspath(__file__)); DATA = os.path.join(HERE, "data")
LEVELS = [{"price":83000,"label":"Support 83k"},{"price":92000,"label":"Resistance 92k"},{"price":95000,"label":"Resistance 95k"}]
STABLE = {"USDT","USDC","DAI","USDE","FDUSD","TUSD","PYUSD","USDS","USD1","BUSD","FRAX","USDD","USDP","GUSD","LUSD","USDG","RLUSD","USDTB","USD0","CRVUSD","GHO","EURC","XAUT","PAXG","FIGR_HELOC"}
def now_et(): return datetime.now(ET).strftime("%Y-%m-%d %H:%M CT")
def get(url):
    req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0 crypto-report","Accept":"application/json"})
    with urllib.request.urlopen(req, timeout=25) as r: return json.loads(r.read().decode())
def section(name, fn, sources):
    try:
        d = fn(); d.update(status="ok", fetched=now_et(), fetched_ts=int(time.time()), source=sources); return d
    except Exception as e:
        print(f"[{name}] FAILED: {e}", file=sys.stderr)
        return {"status":"unavailable","fetched":now_et(),"fetched_ts":int(time.time()),"source":sources,"error":str(e)[:200]}
def sma(xs, n): return sum(xs[-n:])/n if len(xs)>=n else None

def btc():
    c = get("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=86400")
    c = sorted(c)  # [t, low, high, open, close, vol]
    candles = [{"time":r[0],"open":r[3],"high":r[2],"low":r[1],"close":r[4]} for r in c]
    t = get("https://api.exchange.coinbase.com/products/BTC-USD/ticker")
    price = float(t["price"]); closes = [x["close"] for x in candles]
    s = get("https://api.exchange.coinbase.com/products/BTC-USD/stats")
    def ch(n): return (price/closes[-1-n]-1)*100 if len(closes)>n else None
    s20, s50, s200 = sma(closes,20), sma(closes,50), sma(closes,200)
    if s20 and s50:
        trend = "Uptrend" if price>s20>s50 else "Downtrend" if price<s20<s50 else "Mixed / range"
    else: trend = "unknown"
    # swing pivots (5-bar fractals) over last 120 days
    rec = candles[-120:]; sup, res = [], []
    for i in range(2, len(rec)-2):
        w = rec[i-2:i+3]
        if rec[i]["high"] == max(x["high"] for x in w) and rec[i]["high"] > price: res.append(rec[i]["high"])
        if rec[i]["low"] == min(x["low"] for x in w) and rec[i]["low"] < price: sup.append(rec[i]["low"])
    return {"price":price,"change_24h":(price/float(s["open"])-1)*100,"change_7d":ch(7),
            "high_24h":float(s["high"]),"low_24h":float(s["low"]),"sma20":s20,"sma50":s50,"sma200":s200,
            "trend":trend,"supports":sorted(sup,reverse=True)[:3],"resistances":sorted(res)[:3],
            "levels":LEVELS,"candles":candles[-180:]}
def market():
    g = get("https://api.coingecko.com/api/v3/global")["data"]
    top = get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1&sparkline=true&price_change_percentage=24h,7d")
    try: sids = {c["id"] for c in get("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=stablecoins&per_page=100&page=1")}
    except Exception: sids = set()
    def stable(c):
        s = c["symbol"].upper()
        sp = (c.get("sparkline_in_7d") or {}).get("price") or []
        if sp and all(0.95 <= x <= 1.05 for x in sp): return True
        return s in STABLE or c["id"] in sids or ((s.startswith("USD") or s.endswith("USD")) and abs((c["current_price"] or 0)-1) < 0.03)
    top = [c for c in top if not stable(c)][:10]
    cats = get("https://api.coingecko.com/api/v3/coins/categories")
    cats = [c for c in cats if (c.get("market_cap") or 0) > 2e9 and c.get("market_cap_change_24h") is not None
            and not any(w in c["name"] for w in ("Stablecoin","Dollar","USD","Wrapped","Bridged","Ecosystem"))]
    cats.sort(key=lambda c: c["market_cap_change_24h"])
    sec = lambda c: {"name":c["name"],"change_24h":c["market_cap_change_24h"]}
    return {"total_mcap":g["total_market_cap"]["usd"],"mcap_change_24h":g.get("market_cap_change_percentage_24h_usd"),
            "btc_dominance":g["market_cap_percentage"]["btc"],"eth_dominance":g["market_cap_percentage"].get("eth"),
            "top10":[{"rank":i+1,"mcap_rank":c["market_cap_rank"],"symbol":c["symbol"].upper(),"name":c["name"],"price":c["current_price"],
                      "change_24h":c.get("price_change_percentage_24h_in_currency"),"change_7d":c.get("price_change_percentage_7d_in_currency"),
                      "mcap":c["market_cap"]} for i,c in enumerate(top)],
            "sector_leaders":[sec(c) for c in cats[::-1][:4]],"sector_laggards":[sec(c) for c in cats[:4]]}
def derivs():
    out = {}
    # Try Binance, then Bybit; OKX is the fallback (Binance/Bybit geo-block some regions).
    try:
        f = get("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT")
        oi = get("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT")
        out.update(venue="Binance", funding_rate_pct=float(f["lastFundingRate"])*100,
                   funding_interval="8h (Binance BTCUSDT perp)", oi_usd=float(oi["openInterest"])*float(f["markPrice"]),
                   oi_change_pct=None, oi_scope="Binance BTCUSDT perp")
    except Exception as e1:
        try:
            t = get("https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT")["result"]["list"][0]
            out.update(venue="Bybit", funding_rate_pct=float(t["fundingRate"])*100, funding_interval="8h (Bybit BTCUSDT perp)",
                       oi_usd=float(t["openInterestValue"]), oi_change_pct=None, oi_scope="Bybit BTCUSDT perp")
        except Exception as e2:
            out["fallback_reason"] = f"Binance: {str(e1)[:80]}; Bybit: {str(e2)[:80]}"
            f = get("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP")["data"][0]
            out.update(venue="OKX", funding_rate_pct=float(f["fundingRate"])*100, funding_interval="8h (OKX BTC-USDT perp)")
            oi = get("https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=BTC&period=1D")["data"]
            out.update(oi_usd=float(oi[0][1]), oi_change_pct=(float(oi[0][1])/float(oi[1][1])-1)*100, oi_scope="OKX all BTC contracts, daily")
    try:
        L = get("https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=BTC-USDT&state=filled")["data"][0]["details"]
        cut = (time.time()-86400)*1000; lng = sht = 0.0; n = 0; oldest = None
        for d in L:
            if int(d["ts"]) < cut: continue
            oldest = min(oldest or 1e20, int(d["ts"])); usd = float(d["sz"])*0.01*float(d["bkPx"]); n += 1  # ctVal 0.01 BTC
            if d["posSide"]=="long": lng += usd
            else: sht += usd
        out["liq"] = {"long_usd":lng,"short_usd":sht,"count":n,"since":datetime.fromtimestamp((oldest or 0)/1000,ET).strftime("%b %d %H:%M CT") if oldest else None,
                      "scope":"OKX BTC-USDT perp only, most recent liquidation orders the free API returns (partial sample, not market-wide)"}
    except Exception as e:
        out["liq"] = {"status":"unavailable","error":str(e)[:200]}
    return out
def flows():
    s = get("https://stablecoins.llama.fi/stablecoincharts/all")
    v = lambda r: r["totalCirculatingUSD"].get("peggedUSD", 0)
    last = s[-1]; wk = s[-8]
    return {"stablecoin_supply":v(last),"stablecoin_change_7d":v(last)-v(wk),
            "stablecoin_series":[{"time":int(r["date"]),"value":v(r)} for r in s[-30:]],
            "etf":{"status":"unavailable","reason":"No free, key-less, reliable source for daily spot BTC ETF flows (Farside blocks scraping; others need keys)."}}
def fng():
    d = get("https://api.alternative.me/fng/?limit=8")["data"]
    return {"value":int(d[0]["value"]),"label":d[0]["value_classification"],
            "yesterday":int(d[1]["value"]),"week_ago":int(d[7]["value"]) if len(d)>7 else None}
def calendar():
    cal = json.load(open(os.path.join(HERE,"macro_calendar.json")))
    today = datetime.now(ET).date().isoformat()
    return {"events":[e for e in cal["events"] if e["date"]>=today][:8],"note":cal.get("_note")}

def fmt(n): return f"${n:,.0f}"
def diff(cur, prev):
    out = []
    if not prev: return [{"dir":"flat","text":"First report — no previous day to compare yet."}]
    b, pb = cur["btc"], prev.get("btc", {})
    if b.get("status")=="ok" and pb.get("status")=="ok":
        d = (b["price"]/pb["price"]-1)*100
        out.append({"dir":"up" if d>0 else "dn","text":f"BTC {fmt(b['price'])}, {d:+.2f}% vs last report ({fmt(pb['price'])})"})
        for L in LEVELS:
            if (pb["price"]-L["price"])*(b["price"]-L["price"])<0:
                out.append({"dir":"up" if b["price"]>L["price"] else "dn","text":f"BTC crossed {L['label']}"})
        if b["trend"]!=pb.get("trend"): out.append({"dir":"flat","text":f"Trend changed: {pb.get('trend')} → {b['trend']}"})
    m, pm = cur["market"], prev.get("market", {})
    if m.get("status")=="ok" and pm.get("status")=="ok":
        dd = m["btc_dominance"]-pm["btc_dominance"]; dm=(m["total_mcap"]/pm["total_mcap"]-1)*100
        out.append({"dir":"up" if dm>0 else "dn","text":f"Total market cap {dm:+.2f}%; BTC dominance {dd:+.2f} pts to {m['btc_dominance']:.1f}%"})
    f, pf = cur["fng"], prev.get("fng", {})
    if f.get("status")=="ok" and pf.get("status")=="ok" and f["value"]!=pf["value"]:
        out.append({"dir":"up" if f["value"]>pf["value"] else "dn","text":f"Fear & Greed {pf['value']} → {f['value']} ({f['label']})"})
    dv, pdv = cur["derivatives"], prev.get("derivatives", {})
    if dv.get("status")=="ok" and pdv.get("status")=="ok":
        out.append({"dir":"flat","text":f"Funding {pdv['funding_rate_pct']:+.4f}% → {dv['funding_rate_pct']:+.4f}%"})
    fl, pfl = cur["flows"], prev.get("flows", {})
    if fl.get("status")=="ok" and pfl.get("status")=="ok":
        d = fl["stablecoin_supply"]-pfl["stablecoin_supply"]
        out.append({"dir":"up" if d>0 else "dn","text":f"Stablecoin supply {'+' if d>=0 else '-'}${abs(d)/1e6:,.0f}M since last report"})
    for k in ("btc","market","derivatives","flows","fng"):
        if cur[k].get("status")!="ok": out.append({"dir":"flat","text":f"{k} source unavailable this run"})
    return out

def main():
    daily = "--daily" in sys.argv
    os.makedirs(DATA, exist_ok=True)
    today = datetime.now(ET).date().isoformat()
    rep = {"date":today,"generated":now_et(),"generated_ts":int(time.time()),"kind":"daily" if daily else "snapshot",
           "btc":section("btc",btc,"Coinbase Exchange public API"),
           "market":section("market",market,"CoinGecko free API"),
           "derivatives":section("derivatives",derivs,"Binance → Bybit → OKX public APIs"),
           "flows":section("flows",flows,"DefiLlama stablecoins API"),
           "fng":section("fng",fng,"alternative.me"),
           "calendar":section("calendar",calendar,"hand-maintained macro_calendar.json")}
    if rep["derivatives"].get("venue"): rep["derivatives"]["source"] = rep["derivatives"]["venue"] + " public API"
    prevs = sorted(p for p in glob.glob(os.path.join(DATA,"report_*.json")) if not p.endswith(f"report_{today}.json"))
    prev = json.load(open(prevs[-1])) if prevs else None
    rep["changes"] = diff(rep, prev); rep["compared_to"] = prev["date"] if prev else None
    names = ["latest.json"] + ([f"report_{today}.json"] if daily else [])
    for name in names:
        json.dump(rep, open(os.path.join(DATA,name),"w"), indent=1)
    idx = sorted(os.path.basename(p)[7:17] for p in glob.glob(os.path.join(DATA,"report_*.json")))
    json.dump(idx, open(os.path.join(DATA,"index.json"),"w"))
    print("wrote", names, {k:rep[k]["status"] for k in ("btc","market","derivatives","flows","fng","calendar")})
if __name__ == "__main__": main()

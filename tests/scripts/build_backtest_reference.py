#!/usr/bin/env python3
"""Build backtest reference values (verifier-owned, read-only for the build agent).

Reads the official ZIPs (2021-2025) and the 2026Q1-Q2 CSV from data/seoul/,
filters 서비스_업종 CS100010 (커피-음료), and writes per-quarter aggregates for
(a) the 8 Seongsu trade areas and (b) all Seoul. Rates are recomputed from counts
(closures / total stores x 100) with the source's own total-store column as the
denominator; the published integer rates are kept alongside for comparison.
"""
import csv, io, json, os, sys, zipfile, glob, collections
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW=os.path.join(ROOT,"data/seoul/raw"); Y26=os.path.join(ROOT,"data/seoul/2026/OA-15577_2026Q1-Q2_utf8.csv")
CAFE="CS100010"
def decode(b):
    for e in ("utf-8-sig","cp949"):
        try: return b.decode(e)
        except UnicodeDecodeError: pass
    raise SystemExit("undecodable")
def norm(hdr):
    h=[c.strip().lstrip("﻿") for c in hdr]
    m={}
    for i,c in enumerate(h):
        c2=c.lower()
        if c2 in ("기준_년분기_코드","stdr_yyqu_cd"): m["q"]=i
        elif c2 in ("상권_코드","trdar_cd"): m["code"]=i
        elif c2 in ("상권_코드_명","trdar_cd_nm"): m["name"]=i
        elif c2 in ("상권_구분_코드_명","trdar_se_cd_nm"): m["kind"]=i
        elif c2 in ("서비스_업종_코드","svc_induty_cd"): m["svc"]=i
        elif c2 in ("유사_업종_점포_수","similr_induty_stor_co","전체_점포_수"): m["total"]=i
        elif c2 in ("점포_수","stor_co","일반_점포_수"): m["general"]=i
        elif c2 in ("프랜차이즈_점포_수","frc_stor_co"): m["franchise"]=i
        elif c2 in ("개업_율","opbiz_rt"): m["open_rt"]=i
        elif c2 in ("개업_점포_수","opbiz_stor_co"): m["opens"]=i
        elif c2 in ("폐업_률","clsbiz_rt"): m["close_rt"]=i
        elif c2 in ("폐업_점포_수","clsbiz_stor_co"): m["closes"]=i
    need={"q","code","name","svc","total","opens","closes","open_rt","close_rt"}
    missing=need-set(m)
    if missing: raise SystemExit(f"missing columns {missing} in header {h}")
    return m
rows=[]
for z in sorted(glob.glob(os.path.join(RAW,"*점포-상권*.zip"))):
    with zipfile.ZipFile(z) as zf:
        for info in zf.infolist():
            if not info.filename.lower().endswith(".csv"): continue
            r=list(csv.reader(decode(zf.read(info)).splitlines()))
            m=norm(r[0]); rows+= [(x,m,os.path.basename(z)) for x in r[1:] if x[m["svc"]]==CAFE]
r=list(csv.reader(open(Y26,encoding="utf-8-sig")))
m=norm(r[0]); rows+=[(x,m,os.path.basename(Y26)) for x in r[1:] if x[m["svc"]]==CAFE]
def agg(filter_fn,label):
    per=collections.OrderedDict()
    for x,m,src in rows:
        if not filter_fn(x,m): continue
        q=x[m["q"]]; a=per.setdefault(q,{"quarter":q,"trade_areas":0,"total_stores":0,"opens":0,"closes":0,"pub_open_rt_sum":0.0,"pub_close_rt_sum":0.0,"sources":set()})
        tot=int(x[m["total"]] or 0); a["trade_areas"]+=1; a["total_stores"]+=tot
        a["opens"]+=int(x[m["opens"]] or 0); a["closes"]+=int(x[m["closes"]] or 0)
        a["pub_open_rt_sum"]+=float(x[m["open_rt"]] or 0); a["pub_close_rt_sum"]+=float(x[m["close_rt"]] or 0); a["sources"].add(src)
    out=[]
    for q in sorted(per):
        a=per[q]; t=a["total_stores"]
        out.append({"quarter":q,"trade_areas":a["trade_areas"],"total_stores":t,"opens":a["opens"],"closes":a["closes"],
            "open_rate_pct":round(100*a["opens"]/t,3) if t else None,"close_rate_pct":round(100*a["closes"]/t,3) if t else None,
            "published_mean_open_rt":round(a["pub_open_rt_sum"]/a["trade_areas"],2),"published_mean_close_rt":round(a["pub_close_rt_sum"]/a["trade_areas"],2),
            "source_files":sorted(a["sources"])})
    return out
seongsu=agg(lambda x,m: "성수" in x[m["name"]],"seongsu")
seoul=agg(lambda x,m: True,"seoul")
areas=sorted({(x[m["code"]],x[m["name"]],x[m["kind"]]) for x,m,_ in rows if "성수" in x[m["name"]]})
def split(series):
    cal=[s for s in series if s["quarter"]<"20251"]; hold=[s for s in series if s["quarter"]>="20251"]
    def mean(k,arr): v=[s[k] for s in arr if s[k] is not None]; return round(sum(v)/len(v),3) if v else None
    return {"calibration_quarters":[s["quarter"] for s in cal],"holdout_quarters":[s["quarter"] for s in hold],
            "calibration_mean_close_rate_pct":mean("close_rate_pct",cal),"calibration_mean_open_rate_pct":mean("open_rate_pct",cal),
            "holdout_mean_close_rate_pct":mean("close_rate_pct",hold),"holdout_mean_open_rate_pct":mean("open_rate_pct",hold),
            "annualised_close_rate_pct_calibration":round(4*mean("close_rate_pct",cal),3) if mean("close_rate_pct",cal) else None}
ref={"built_from":"data/seoul/raw/*점포-상권*.zip + data/seoul/2026/OA-15577_2026Q1-Q2_utf8.csv","service_industry":{"code":CAFE,"name":"커피-음료"},
     "tolerance_pp":5.0,"seongsu_trade_areas":[{"code":c,"name":n,"kind":k} for c,n,k in areas],
     "seongsu_cafe":{"quarters":seongsu,"summary":split(seongsu)},"seoul_cafe":{"quarters":seoul,"summary":split(seoul)},
     "notes":["rates recomputed as closes/total_stores*100 using the source total-store column (유사_업종_점포_수 / similr_induty_stor_co / 전체_점포_수)",
              "published_* are means of the source integer percentages per trade area, for comparison only",
              "quarterly rates; a 36-month horizon spans 12 quarters",
              "area-level closure rates are not individual-store survival probabilities (see data/seoul/README.md)"]}
os.makedirs(os.path.join(ROOT,"tests/fixtures"),exist_ok=True)
json.dump(ref,open(os.path.join(ROOT,"tests/fixtures/backtest_reference.json"),"w",encoding="utf-8"),ensure_ascii=False,indent=1)
with open(os.path.join(ROOT,"tests/fixtures/backtest_reference_seongsu_cafe.csv"),"w",newline="",encoding="utf-8") as fh:
    w=csv.DictWriter(fh,fieldnames=[k for k in seongsu[0] if k!="source_files"],extrasaction="ignore"); w.writeheader(); w.writerows(seongsu)
print("seongsu areas:",len(areas)); print("quarters:",len(seongsu),seongsu[0]["quarter"],"..",seongsu[-1]["quarter"])
for s in seongsu: print(f' {s["quarter"]} areas={s["trade_areas"]} stores={s["total_stores"]} open={s["opens"]} close={s["closes"]} open%={s["open_rate_pct"]} close%={s["close_rate_pct"]}')
print("summary seongsu:",json.dumps(ref["seongsu_cafe"]["summary"])); print("summary seoul:",json.dumps(ref["seoul_cafe"]["summary"]))

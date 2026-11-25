"""한국은행 ECOS Open API에서 시계열을 받는다. 공개 'sample' 키는 한 번에 10행이라 페이지를 넘겨 모은다.

사용: python ecos.py <통계표코드> <주기 A|M|Q> <시작> <끝> <항목코드>
"""
import json, sys, urllib.request

BASE = "https://ecos.bok.or.kr/api"


def _get(path):
    with urllib.request.urlopen(f"{BASE}/{path}", timeout=30) as r:
        return json.load(r)


def series(code, cycle, start, end, item):
    out, s = {}, 1
    while True:
        d = _get(f"StatisticSearch/sample/json/kr/{s}/{s+9}/{code}/{cycle}/{start}/{end}/{item}")
        body = d.get("StatisticSearch", {})
        rows = body.get("row", [])
        for r in rows:
            out[r["TIME"]] = float(r["DATA_VALUE"])
        s += 10
        if s > body.get("list_total_count", 0) or not rows:
            return out


def items(code, max_rows=400):
    out, s = [], 1
    while s <= max_rows:
        d = _get(f"StatisticItemList/sample/json/kr/{s}/{s+9}/{code}")
        rows = d.get("StatisticItemList", {}).get("row", [])
        out += rows
        if len(rows) < 10:
            break
        s += 10
    return out


def tables(max_rows=1200):
    out, s = [], 1
    while s <= max_rows:
        rows = _get(f"StatisticTableList/sample/json/kr/{s}/{s+9}").get("StatisticTableList", {}).get("row", [])
        out += rows
        if len(rows) < 10:
            break
        s += 10
    return out


if __name__ == "__main__":
    print(json.dumps(series(*sys.argv[1:6]), ensure_ascii=False))

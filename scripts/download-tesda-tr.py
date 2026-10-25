"""Download TESDA TR index entries through the public form for local source review."""
import argparse
import hashlib
import http.cookiejar
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

PAGE = "https://tesda.gov.ph/Download/Training_Regulations?Searchcat=Training%20Regulations"
FORM = "https://tesda.gov.ph/Download/DownloadTR"
MAX_BYTES = 100_000_000


def form_context(opener):
    with opener.open(PAGE, timeout=30) as response:
        html = response.read().decode("utf-8", "replace")
    token = re.search(r'name="__RequestVerificationToken" type="hidden" value="([^"]+)"', html)
    country = re.search(r'<option value="([0-9]+)">Philippines</option>', html)
    if not token or not country:
        raise RuntimeError("TESDA download form or Philippines option changed")
    return token.group(1), country.group(1)


def valid_pdf(path):
    if not path.is_file() or path.stat().st_size <= 1000:
        return False
    with path.open("rb") as stream:
        if stream.read(5) != b"%PDF-":
            return False
        stream.seek(max(0, path.stat().st_size - 2048))
        return b"%%EOF" in stream.read()


def digest(path):
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def download(opener, token, country, email, item, folder):
    ident = str(item["download_id"])
    if not ident.isdigit():
        raise ValueError("Non-numeric TESDA download ID")
    path = folder / f"tesda-id-{ident}.pdf"
    if not valid_pdf(path):
        body = urllib.parse.urlencode({
            "__RequestVerificationToken": token,
            "Purpose": "Dev",
            "CountryId": country,
            "Email": email,
            "D_id": ident,
        }).encode()
        request = urllib.request.Request(FORM, data=body, headers={"User-Agent": "EMPLOYCagayan DEV source inventory"})
        part = path.with_suffix(".part")
        try:
            with opener.open(request, timeout=120) as response, part.open("wb") as output:
                if urllib.parse.urlparse(response.geturl()).hostname not in {"tesda.gov.ph", "www.tesda.gov.ph"}:
                    raise RuntimeError("Unexpected download host")
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise RuntimeError("PDF exceeds local safety limit")
                    output.write(chunk)
            if not valid_pdf(part):
                raise RuntimeError("Response is not a PDF")
            part.replace(path)
        finally:
            part.unlink(missing_ok=True)
    return {"download_id": ident, "title": item["title"], "status": item["status"],
            "file": path.name, "bytes": path.stat().st_size, "sha256": digest(path)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--delay", type=float, default=1.5)
    args = parser.parse_args()
    data = json.loads(args.index.read_text(encoding="utf-8"))
    items = data["items"]
    ids = [str(item["download_id"]) for item in items]
    if len(set(ids)) != len(ids) or len(items) != data["record_count"]:
        raise ValueError("TESDA index is incomplete or contains duplicate IDs")
    args.out.mkdir(parents=True, exist_ok=True)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    token, country = form_context(opener)
    results = []
    failures = []
    for index, item in enumerate(items[:args.limit] if args.limit else items, 1):
        existed = valid_pdf(args.out / f"tesda-id-{item['download_id']}.pdf")
        try:
            results.append(download(opener, token, country, args.email, item, args.out))
        except urllib.error.HTTPError as error:
            failures.append({"download_id": item["download_id"], "error": f"HTTP {error.code}"})
            if error.code in (403, 429):
                print(f"Stopped at item {index}: HTTP {error.code}", flush=True)
                break
        except (OSError, ValueError, RuntimeError, urllib.error.URLError) as error:
            failures.append({"download_id": item["download_id"], "error": str(error)[:160]})
        if index % 10 == 0 or index == len(items) or failures:
            (args.out / "download-manifest.json").write_text(
                json.dumps({"index_count": len(items), "downloaded": results, "failures": failures},
                           ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"{index}/{len(items)} checked, {len(results)} valid PDFs, {len(failures)} failures", flush=True)
        if not existed:
            time.sleep(args.delay)
    (args.out / "download-manifest.json").write_text(
        json.dumps({"index_count": len(items), "downloaded": results, "failures": failures},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"checked": len(results) + len(failures),
                      "valid": len(results), "failed": len(failures)}))


if __name__ == "__main__":
    main()


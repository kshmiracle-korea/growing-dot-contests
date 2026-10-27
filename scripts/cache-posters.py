"""Cache actual posters; isolate unavailable images without dropping contest data."""
import hashlib
import base64
import io
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse
from PIL import Image, ImageOps

ROOT = Path('growing-dot-upload')
Image.MAX_IMAGE_PIXELS = 50_000_000
MAX_ATTEMPTS = 3

def public_url(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('HTTPS public image required')
    for address in socket.getaddrinfo(parsed.hostname, parsed.port or 443):
        if not ipaddress.ip_address(address[4][0]).is_global:
            raise ValueError('Non-public image address')
    return url

class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return super().redirect_request(req, fp, code, msg, headers, public_url(newurl))

def local_image(value):
    if not re.fullmatch(r'\./(?:contest-\d+\.(?:png|jpg|webp)|posters/[a-f0-9]{24}\.jpg)', value):
        return False
    path = ROOT / value[2:]
    if not path.is_file():
        return False
    try:
        with Image.open(path) as image:
            image.verify()
    except (OSError, ValueError):
        return False
    return True

def cache(value):
    if local_image(value):
        return value
    target = './posters/' + hashlib.sha256(value.encode()).hexdigest()[:24] + '.jpg'
    if local_image(target):
        return target
    # Verified local copies bootstrap sources that reject hosted runners.
    seeds = Path('poster-seeds.json')
    saved = json.loads(seeds.read_text(encoding='utf-8')) if seeds.exists() else {}
    if value in saved:
        raw = base64.b64decode(saved[value], validate=True)
        with Image.open(io.BytesIO(raw)) as check:
            check.verify()
        path = ROOT / target[2:]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return target
    request = urllib.request.Request(public_url(value), headers={'User-Agent': 'GrowingDotPosterCache/1.0'})
    with urllib.request.build_opener(PublicRedirect()).open(request, timeout=30) as response:
        raw = response.read(25_000_001)
    if len(raw) > 25_000_000:
        raise ValueError('Poster exceeds size limit')
    if raw.startswith(b'%PDF-'):
        import pypdfium2
        with pypdfium2.PdfDocument(raw) as document:
            image = document[0].render(scale=1.5).to_pil().copy()
    else:
        image = Image.open(io.BytesIO(raw))
        image.load()
    image = ImageOps.exif_transpose(image).convert('RGB')
    if min(image.size) < 100:
        raise ValueError('Image too small for a poster')
    image.thumbnail((1000, 1600))
    path = ROOT / target[2:]
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'JPEG', quality=86, optimize=True)
    return target

def cache_with_retry(value):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return cache(value)
        except (OSError, urllib.error.URLError) as error:
            transient = not isinstance(error, urllib.error.HTTPError) or error.code in (408, 429) or error.code >= 500
            if not transient or attempt == MAX_ATTEMPTS:
                raise
            print(f'Poster temporary failure ({type(error).__name__}); attempt {attempt + 1}/{MAX_ATTEMPTS}', file=sys.stderr)
            time.sleep(attempt)


def prepare(items, previous, verified, report=None):
    old = {item['url']: item.get('image', '') for item in previous}
    results = []
    for item in items:
        candidates = list(dict.fromkeys(filter(None, [item.get('image'), verified.get(item['url'], {}).get('image'), old.get(item['url'])])))
        errors = []
        for index, candidate in enumerate(candidates):
            try:
                item['image'] = cache_with_retry(candidate)
                results.append({'title': item['title'], 'url': item['url'], 'status': 'fallback' if index else 'ready', 'errors': errors})
                break
            except Exception as error:
                errors.append(type(error).__name__)
                print('Poster source unavailable (' + type(error).__name__ + '); trying saved alternative: ' + item['title'].replace('\n', ' ').replace('\r', ' '), file=sys.stderr)
        else:
            # Keep every source field and row; never fabricate a replacement image.
            # The source sheet/mapping is read again on the next daily run.
            item['image'] = ''
            results.append({'title': item['title'], 'url': item['url'], 'status': 'pending', 'errors': errors or ['NoSource']})
            print('Poster verification pending; contest retained: ' + item['title'].replace('\n', ' ').replace('\r', ' '), file=sys.stderr)
    if report is not None:
        report.update(total=len(items), ready=sum(r['status'] == 'ready' for r in results), fallback=sum(r['status'] == 'fallback' for r in results), pending=sum(r['status'] == 'pending' for r in results), results=results)
    return items

if __name__ == '__main__':
    try:
        payload = json.load(sys.stdin)
        verified = json.loads(Path('poster-sources.json').read_text(encoding='utf-8'))
        report = {}
        items = prepare(payload['items'], payload['previous'], verified, report)
        if os.environ.get('POSTER_REPORT'):
            path = Path(os.environ['POSTER_REPORT'])
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
                summary.write(f"## 실제 포스터 확인\n전체 {report['total']}건 · 정상 {report['ready']}건 · 기존/확인된 대안 {report['fallback']}건 · 확인 필요 {report['pending']}건\n\n")
                for result in report['results']:
                    if result['status'] != 'ready':
                        summary.write('- ' + result['title'].replace('\n', ' ').replace('\r', ' ') + ': ' + result['status'] + '\n')
                summary.write('\n확인 필요 항목도 목록에 유지합니다. 기본/생성 이미지는 사용하지 않습니다. 일시적 다운로드 오류는 최대 3회 시도합니다.\n')
        print(json.dumps(items, ensure_ascii=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

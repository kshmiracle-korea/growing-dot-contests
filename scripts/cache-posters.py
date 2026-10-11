"""Cache verified public posters; never publish a row without a usable image."""
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import re
import socket
import sys
import urllib.request
from urllib.parse import urlparse
from PIL import Image, ImageOps

ROOT = Path('growing-dot-upload')
Image.MAX_IMAGE_PIXELS = 50_000_000

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
    with Image.open(path) as image:
        image.verify()
    return True

def cache(value):
    if local_image(value):
        return value
    target = './posters/' + hashlib.sha256(value.encode()).hexdigest()[:24] + '.jpg'
    if local_image(target):
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

def prepare(items, previous, verified):
    old = {item['url']: item.get('image', '') for item in previous}
    failures = []
    for item in items:
        candidates = list(dict.fromkeys(filter(None, [item.get('image'), verified.get(item['url'], {}).get('image'), old.get(item['url'])])))
        for candidate in candidates:
            try:
                item['image'] = cache(candidate)
                break
            except Exception:
                print('Poster source unavailable; trying saved alternative: ' + item['title'], file=sys.stderr)
        else:
            failures.append(item['title'])
    if failures:
        raise ValueError('Poster verification required (not "no image"); publication preserved: ' + '; '.join(failures))
    return items

if __name__ == '__main__':
    try:
        payload = json.load(sys.stdin)
        verified = json.loads(Path('poster-sources.json').read_text(encoding='utf-8'))
        print(json.dumps(prepare(payload['items'], payload['previous'], verified), ensure_ascii=False))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

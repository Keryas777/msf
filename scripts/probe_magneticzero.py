#!/usr/bin/env python3
"""Read-only MagneticZero probe. Never updates files or Codex artifacts."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from time import sleep

HOST = 'msf-datamines.magneticzero.dev'
ORIGIN = f'https://{HOST}'
FILES = (
    'ai_filter.json', 'ai_selector.json', 'battlefield_effects.json',
    'characters.json', 'combat_mods.json', 'constants.json',
    'iso8skills.json', 'missiontraits.json', 'overpower_bonuses.json',
    'places.json', 'procs.json',
)
HEX64 = re.compile(r'[0-9a-f]{64}\Z')
MAX_SIZE = 35 * 1024 * 1024

class ProbeError(ValueError):
    pass

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.blocks, self.parts, self.depth = [], [], [], 0

    def handle_starttag(self, tag, attrs):
        if tag == 'a' and dict(attrs).get('href'):
            self.links.append(dict(attrs)['href'])
        elif tag == 'pre':
            if not self.depth:
                self.parts = []
            self.depth += 1

    def handle_endtag(self, tag):
        if tag == 'pre' and self.depth:
            self.depth -= 1
            if not self.depth:
                self.blocks.append(''.join(self.parts))

    def handle_data(self, data):
        if self.depth:
            self.parts.append(data)


def latest(html, filename):
    p = PageParser()
    p.feed(html)
    prefix = f'/view/combat_data/{filename}/'
    for link in p.links:
        uri = urlsplit(urljoin(ORIGIN, link))
        if uri.scheme != 'https' or uri.netloc != HOST or uri.query or uri.fragment:
            continue
        if uri.path.startswith(prefix) and HEX64.fullmatch(uri.path[len(prefix):]):
            return uri.path[len(prefix):], ORIGIN + uri.path
    raise ProbeError(f'No valid view revision for {filename}')


def extract(html, expected_name, revision):
    p = PageParser()
    p.feed(html)
    for block in p.blocks:
        try:
            doc = json.loads(block)
        except ValueError:
            continue
        if not isinstance(doc, dict) or doc.get('Name') != expected_name:
            continue
        if not isinstance(doc.get('Data'), (dict, list)) or type(doc.get('ForceImportVersion')) is not int:
            continue
        canonical = (json.dumps(doc, ensure_ascii=False, indent=2) + '\n').encode()
        if hashlib.sha256(canonical).hexdigest() != revision:
            raise ProbeError('Page JSON SHA-256 differs from listed revision')
        return doc
    raise ProbeError('No complete official-format JSON in HTML <pre>')


def fetch_page(url):
    uri = urlsplit(url)
    if uri.scheme != 'https' or uri.netloc != HOST:
        raise ProbeError('Unexpected source host')
    request = Request(url, headers={'Accept':'text/html','User-Agent':'LoSP-MSF-readonly-probe/1.0'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=40) as res:
                final = urlsplit(res.geturl())
                if res.status != 200 or final.scheme != 'https' or final.netloc != HOST:
                    raise ProbeError('Unexpected HTTP status / redirect')
                buf = res.read(MAX_SIZE + 1)
                if len(buf) > MAX_SIZE:
                    raise ProbeError('HTML exceeds 35 MiB')
                return buf.decode('utf-8')
        except HTTPError as error:
            # Transient CDN/origin responses may recover on the next attempt.
            if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                raise
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        sleep(2 ** attempt)
    raise ProbeError('Retry limit exceeded')


def compare(local, remote):
    a, b = local.get('Data'), remote.get('Data')
    result = {'semanticallyIdentical': local == remote,
              'entriesLocal': len(a) if isinstance(a,(dict,list)) else None,
              'entriesMagneticZero': len(b) if isinstance(b,(dict,list)) else None,
              'importVersionLocal': local.get('ForceImportVersion'),
              'importVersionMagneticZero': remote.get('ForceImportVersion')}
    if isinstance(a, dict) and isinstance(b,dict):
        local_ids, remote_ids = set(a), set(b)
        changed = sorted(key for key in local_ids & remote_ids if a[key] != b[key])
        result.update({'addedCount': len(remote_ids - local_ids),
                       'removedCount': len(local_ids - remote_ids),
                       'changedCount': len(changed),
                       'sampleAddedIds': sorted(remote_ids - local_ids)[:12],
                       'sampleRemovedIds': sorted(local_ids - remote_ids)[:12],
                       'sampleChangedIds': changed[:12]})
    return result


def probe(filename, raw_dir, manifest_resources=None):
    revision, url = latest(fetch_page(f'{ORIGIN}/file/combat_data/{filename}'),filename)
    remote = extract(fetch_page(url),filename[:-5],revision)
    payload = (raw_dir / filename).read_bytes()
    local_sha256 = hashlib.sha256(payload).hexdigest()
    local_md5 = hashlib.md5(payload).hexdigest()  # Official catalogue uses MD5
    if manifest_resources is not None:
        expected = manifest_resources.get(f'combat_data/{filename}')
        if expected is None:
            raise ProbeError(f'{filename} missing from LoSP source manifest')
        if expected.get('sha256') != local_sha256 or expected.get('md5') != local_md5:
            raise ProbeError(f'{filename} local bytes disagree with LoSP source manifest')
    local = json.loads(payload)
    if local.get('Name') != filename[:-5]:
        raise ProbeError('Invalid local source Name')
    return {'file':filename, 'revision':revision, 'revisionUrl':url,
            'localSha256':local_sha256, 'localMd5':local_md5,
            'comparison':compare(local,remote)}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--file',action='append',choices=FILES)
    cli.add_argument('--raw-dir',type=Path,default=Path('data/msf-capabilities/raw'))
    cli.add_argument('--manifest',type=Path,default=Path('data/msf-capabilities/source-manifest.json'))
    a = cli.parse_args()
    manifest = json.loads(a.manifest.read_text(encoding='utf-8'))
    resources = {item['id']: item for item in manifest['resources']}
    if set(resources) != {f'combat_data/{name}' for name in FILES}:
        raise ProbeError('LoSP source manifest does not contain exactly the expected 11 files')
    results={'readOnly':True,'game':manifest.get('game'),'files':[],'errors':[]}
    for filename in a.file or FILES:
        try:
            results['files'].append(probe(filename,a.raw_dir,resources))
        except Exception as exc:
            results['errors'].append({'file':filename,'error':f'{type(exc).__name__}: {exc}'})
    results['summary'] = {
        'requested':len(a.file or FILES),
        'downloaded':len(results['files']),
        'identical':sum(item['comparison']['semanticallyIdentical'] for item in results['files']),
        'different':sum(not item['comparison']['semanticallyIdentical'] for item in results['files']),
        'errors':len(results['errors']),
    }
    print(json.dumps(results,ensure_ascii=False,indent=2))
    return bool(results['errors'])

if __name__=='__main__':
    sys.exit(main())

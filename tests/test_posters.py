import importlib.util
import unittest
import urllib.error
import tempfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('posters', 'scripts/cache-posters.py')
posters = importlib.util.module_from_spec(spec)
spec.loader.exec_module(posters)

class PosterTests(unittest.TestCase):
    def test_missing_image_preserves_all_rows_and_other_fields(self):
        rows = [{'title': 'New contest', 'url': 'https://example.org', 'image': '', 'deadline': '2026-11-30'},
                {'title': 'Good contest', 'url': 'https://example.net', 'image': './contest-01.png'}]
        report = {}
        with patch.object(posters, 'cache', return_value='./contest-01.png'):
            result = posters.prepare(rows, [], {}, report)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], rows[0])
        self.assertEqual(result[0]['image'], '')
        self.assertEqual(report['pending'], 1)
        self.assertEqual(report['ready'], 1)

    def test_broken_sources_are_cleared_without_dropping_contest(self):
        row = {'title': 'Broken', 'url': 'https://example.org', 'image': 'javascript:bad'}
        report = {}
        with patch.object(posters, 'cache', side_effect=ValueError('invalid')):
            result = posters.prepare([row], [], {}, report)
        self.assertEqual(result[0]['image'], '')
        self.assertEqual(report['results'][0]['errors'], ['ValueError'])

    def test_transient_failure_recovers_on_third_attempt(self):
        with patch.object(posters, 'cache', side_effect=[TimeoutError(), TimeoutError(), './contest-01.png']) as cache, patch.object(posters.time, 'sleep'):
            self.assertEqual(posters.cache_with_retry('https://example.org/poster.jpg'), './contest-01.png')
            self.assertEqual(cache.call_count, 3)

    def test_retry_limit_and_permanent_errors(self):
        for error, attempts in [(TimeoutError(), 3), (urllib.error.HTTPError('https://example.org', 404, 'Not found', {}, None), 1)]:
            with self.subTest(error=error), patch.object(posters, 'cache', side_effect=error) as cache, patch.object(posters.time, 'sleep'):
                result = posters.prepare([{'title': 'Broken', 'url': 'https://example.org', 'image': 'https://example.org/poster.jpg'}], [], {})
                self.assertEqual(result[0]['image'], '')
                self.assertEqual(cache.call_count, attempts)

    def test_corrupt_cache_does_not_count_as_a_real_poster(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(posters, 'ROOT', Path(directory)):
            Path(directory, 'contest-01.png').write_bytes(b'not an image')
            self.assertFalse(posters.local_image('./contest-01.png'))

    def test_broken_new_image_keeps_saved_image(self):
        def cache(value):
            if value == 'https://example.org/broken.jpg':
                raise ValueError('broken')
            return value
        row = {'title': 'Contest', 'url': 'https://example.org', 'image': 'https://example.org/broken.jpg'}
        old = [{'url': row['url'], 'image': './contest-01.png'}]
        with patch.object(posters, 'cache', side_effect=cache):
            self.assertEqual(posters.prepare([row], old, {})[0]['image'], './contest-01.png')

    def test_blank_sheet_image_uses_verified_source(self):
        row = {'title': 'Contest', 'url': 'https://example.org', 'image': ''}
        with patch.object(posters, 'cache', return_value='./contest-01.png'):
            self.assertEqual(posters.prepare([row], [], {row['url']: {'image': 'https://example.org/poster.jpg'}})[0]['image'], './contest-01.png')

    def test_private_network_image_rejected(self):
        with patch.object(posters.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaises(ValueError):
                posters.public_url('https://example.org/poster.jpg')

if __name__ == '__main__':
    unittest.main()

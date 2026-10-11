import importlib.util
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('posters', 'scripts/cache-posters.py')
posters = importlib.util.module_from_spec(spec)
spec.loader.exec_module(posters)

class PosterTests(unittest.TestCase):
    def test_missing_image_blocks_publication(self):
        with self.assertRaisesRegex(ValueError, 'verification required'):
            posters.prepare([{'title': 'New contest', 'url': 'https://example.org', 'image': ''}], [], {})

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

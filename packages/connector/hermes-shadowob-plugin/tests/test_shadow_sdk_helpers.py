from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from shadow_sdk import normalize_base_url, parse_bool, split_csv


def test_normalize_base_url_strips_api_suffix():
    assert normalize_base_url('https://example.com/api') == 'https://example.com'
    assert normalize_base_url('https://example.com/api/') == 'https://example.com'


def test_parse_bool():
    assert parse_bool('true') is True
    assert parse_bool('1') is True
    assert parse_bool('off', True) is False
    assert parse_bool(None, True) is True


def test_split_csv():
    assert split_csv('a,b, c') == ['a', 'b', 'c']
    assert split_csv(['a', '', 'b']) == ['a', 'b']

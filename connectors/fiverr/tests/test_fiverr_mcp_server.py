import asyncio
import json
from pathlib import Path
from unittest.mock import Mock

import pytest

import fiverr_mcp_server as server


def _response(status_code=200, text=""):
    return Mock(status_code=status_code, text=text)


def _listing_html():
    return '''
    <html><body>
      <div class="gig-card-layout" data-gig-id="98765">
        <a class="gig-title" href="/seller/build-a-python-automation">Build a Python automation</a>
        <span class="price">From USD $120</span>
      </div>
    </body></html>
    '''


def test_blank_query_is_rejected():
    payload = json.loads(server.search_fiverr_listings("   "))
    assert payload["status"] == "error"
    assert payload["verified"] is False
    assert payload["listings"] == []


@pytest.mark.parametrize("limit", [0, 51, -1])
def test_limit_outside_1_to_50_is_rejected(limit):
    payload = json.loads(server.search_fiverr_listings("python", limit))
    assert payload["status"] == "error"
    assert payload["listings"] == []


def test_source_backed_listing_is_normalized(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text=_listing_html()))
    payload = json.loads(server.search_fiverr_listings("python"))
    assert payload["status"] == "success"
    assert payload["verified"] is True
    assert payload["count"] == 1
    item = payload["listings"][0]
    assert item["platform"] == "fiverr"
    assert item["platform_id"] == "98765"
    assert item["record_kind"] == "service_listing"
    assert item["title"] == "Build a Python automation"
    assert item["budget_min"] == 120
    assert item["budget_max"] is None
    assert item["currency"] == "USD"
    assert item["source_url"] == "https://www.fiverr.com/seller/build-a-python-automation"
    assert item["retrieval_method"] == "fiverr_public_web"
    assert item["verified"] is True


def test_missing_price_is_not_fabricated(monkeypatch):
    html = '<div class="gig-card-layout"><a class="gig-title" href="/seller/no-price">No price listing</a></div>'
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text=html))
    item = json.loads(server.search_fiverr_listings("python"))["listings"][0]
    assert item["budget_min"] is None
    assert item["currency"] is None


def test_symbol_only_price_does_not_infer_currency(monkeypatch):
    html = '''
    <div class="gig-card-layout">
      <a class="gig-title" href="/seller/symbol-only">Symbol only</a>
      <span class="price">From $120</span>
    </div>
    '''
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text=html))
    item = json.loads(server.search_fiverr_listings("python"))["listings"][0]
    assert item["budget_min"] == 120
    assert item["currency"] is None


def test_url_fallback_identity_is_namespaced_deterministic_sha256(monkeypatch):
    html = '<div class="gig-card-layout"><a class="gig-title" href="/seller/no-id">No source id</a></div>'
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text=html))
    first = json.loads(server.search_fiverr_listings("python"))["listings"][0]
    second = json.loads(server.search_fiverr_listings("python"))["listings"][0]
    assert first["platform_id"] == second["platform_id"]
    assert first["platform_id"].startswith("url_sha256:")
    assert len(first["platform_id"].removeprefix("url_sha256:")) == 64


def test_non_200_fails_closed(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(status_code=403, text="forbidden"))
    payload = json.loads(server.search_fiverr_listings("python"))
    assert payload["status"] == "unavailable"
    assert payload["verified"] is False
    assert payload["listings"] == []


def test_network_failure_fails_closed(monkeypatch):
    def boom(*args, **kwargs):
        raise server.requests.RequestException("offline")
    monkeypatch.setattr(server.requests, "get", boom)
    payload = json.loads(server.search_fiverr_listings("python"))
    assert payload["status"] == "unavailable"
    assert payload["verified"] is False
    assert payload["listings"] == []
    assert "offline" not in payload["message"]


def test_cloudflare_block_page_fails_closed(monkeypatch):
    html = '<html><title>Just a moment...</title><body>cf-chl Cloudflare verification</body></html>'
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text=html))
    payload = json.loads(server.search_fiverr_listings("python"))
    assert payload["status"] == "unavailable"
    assert payload["verified"] is False
    assert payload["listings"] == []


def test_no_verifiable_cards_is_invalid_response(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text="<html><body>ordinary page</body></html>"))
    payload = json.loads(server.search_fiverr_listings("python"))
    assert payload["status"] == "invalid_response"
    assert payload["listings"] == []


def test_status_reports_lower_trust_read_only_capabilities():
    payload = json.loads(server.fiverr_connector_status())
    assert payload["mode"] == "read_only_service_listing_adapter"
    assert payload["capabilities"]["listing_search"] is True
    assert payload["capabilities"]["buyer_opportunity_discovery"] is False
    assert payload["capabilities"]["messaging"] is False
    assert payload["capabilities"]["purchasing"] is False
    assert payload["capabilities"]["financial_actions"] is False


def test_listing_details_never_claim_success_without_retrieved_facts(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(status_code=403, text="blocked"))
    payload = json.loads(server.get_fiverr_listing_details("https://www.fiverr.com/seller/gig"))
    assert payload["status"] != "success"
    assert payload["verified"] is False


def test_listing_details_require_matching_canonical_source_marker(monkeypatch):
    html = '<html><head></head><body><h1>Generic Fiverr page</h1></body></html>'
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text=html))
    payload = json.loads(server.get_fiverr_listing_details("https://www.fiverr.com/seller/gig"))
    assert payload["status"] == "unsupported"
    assert payload["verified"] is False


def test_listing_details_accept_matching_canonical_source_marker(monkeypatch):
    html = '''
    <html><head><link rel="canonical" href="https://www.fiverr.com/seller/gig"></head>
    <body><h1>Verified source title</h1></body></html>
    '''
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _response(text=html))
    payload = json.loads(server.get_fiverr_listing_details("https://www.fiverr.com/seller/gig"))
    assert payload["status"] == "success"
    assert payload["verified"] is True
    assert payload["title"] == "Verified source title"


def test_affiliate_link_is_explicitly_unverified():
    payload = json.loads(server.generate_fiverr_affiliate_link("https://www.fiverr.com/seller/gig", "abc123"))
    assert payload["status"] == "success"
    assert payload["verified"] is False
    assert payload["affects_ranking"] is False


def test_non_fiverr_urls_are_rejected():
    payload = json.loads(server.generate_fiverr_affiliate_link("https://example.com/gig", "abc123"))
    assert payload["status"] == "error"
    assert payload["verified"] is False


def test_non_listing_fiverr_paths_are_rejected():
    for url in (
        "https://www.fiverr.com/search/gigs",
        "https://www.fiverr.com/categories/programming-tech",
        "https://www.fiverr.com/login",
    ):
        payload = json.loads(server.generate_fiverr_affiliate_link(url, "abc123"))
        assert payload["status"] == "error"
        assert payload["verified"] is False


def test_no_write_tools_are_defined():
    prohibited = {"send_message", "purchase_gig", "create_order", "checkout", "financial_action"}
    assert prohibited.isdisjoint(set(dir(server)))


def test_required_tools_are_registered_with_mcp():
    tools = asyncio.run(server.mcp.list_tools())
    assert {tool.name for tool in tools} == {
        "search_fiverr_listings",
        "get_fiverr_listing_details",
        "generate_fiverr_affiliate_link",
        "fiverr_connector_status",
    }


def test_source_contains_no_simulated_fallback():
    source = Path(server.__file__).read_text(encoding="utf-8")
    assert "simulated_results" not in source
    assert "Professional {query}" not in source

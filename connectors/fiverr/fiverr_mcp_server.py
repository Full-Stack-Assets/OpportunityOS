import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from mcp.server import MCPServer

mcp = MCPServer("Fiverr Connector")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fiverr-mcp")

CONNECTOR_VERSION = "1.0.0"
FIVERR_SEARCH_URL = "https://www.fiverr.com/search/gigs"
_ALLOWED_FIVERR_HOSTS = {"fiverr.com", "www.fiverr.com"}
_BLOCK_MARKERS = (
    "just a moment",
    "cloudflare",
    "cf-chl",
    "challenge-platform",
    "verify you are human",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _error(message: str, *, listings: bool = False) -> str:
    payload = {
        "status": "error",
        "source": "fiverr",
        "verified": False,
        "message": message,
    }
    if listings:
        payload["listings"] = []
    return json.dumps(payload, indent=2)


def _failure(status: str, message: str, *, query: str | None = None, status_code: int | None = None) -> str:
    payload = {
        "status": status,
        "source": "fiverr",
        "verified": False,
        "listings": [],
        "message": message,
    }
    if query is not None:
        payload["query"] = query
    if status_code is not None:
        payload["status_code"] = status_code
    return json.dumps(payload, indent=2)


def _validate_query(query: str) -> str:
    if not isinstance(query, str) or not query.strip():
        raise ValueError("query must be a non-blank string")
    return query.strip()


def _validate_limit(limit: int) -> int:
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 50:
        raise ValueError("limit must be an integer between 1 and 50")
    return limit


def _canonical_fiverr_url(value: str) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_FIVERR_HOSTS:
        return None
    if not parsed.path or parsed.path == "/":
        return None
    host = "www.fiverr.com"
    return urlunparse(("https", host, parsed.path.rstrip("/"), "", "", ""))


def _is_block_page(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _BLOCK_MARKERS)


def _source_id(card, canonical_url: str) -> str:
    for attr in ("data-gig-id", "data-id", "data-gig_id"):
        value = card.get(attr)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()


def _parse_price(card) -> tuple[int | float | None, str | None]:
    price_node = card.select_one(".price, [class*='price'], [data-testid*='price']")
    if price_node is None:
        return None, None
    text = price_node.get_text(" ", strip=True)
    match = re.search(r"([$€£])\s*([0-9]+(?:\.[0-9]{1,2})?)", text)
    if match is None:
        return None, None
    symbol, number = match.groups()
    currency = {"$": "USD", "€": "EUR", "£": "GBP"}.get(symbol)
    if currency is None:
        return None, None
    value = float(number)
    if value.is_integer():
        value = int(value)
    return value, currency


def _listing_cards(soup: BeautifulSoup):
    selectors = (
        "div.gig-card-layout",
        "article[data-gig-id]",
        "div[data-gig-id]",
    )
    seen = set()
    cards = []
    for selector in selectors:
        for card in soup.select(selector):
            marker = id(card)
            if marker not in seen:
                seen.add(marker)
                cards.append(card)
    return cards


def _normalize_card(card, retrieved_at: str) -> dict | None:
    link = card.select_one("a.gig-title[href], a[href*='/'][href]")
    if link is None:
        return None
    title = link.get_text(" ", strip=True)
    href = link.get("href")
    if not title or not isinstance(href, str):
        return None
    absolute = urljoin("https://www.fiverr.com", href)
    canonical_url = _canonical_fiverr_url(absolute)
    if canonical_url is None:
        return None
    budget_min, currency = _parse_price(card)
    return {
        "platform": "fiverr",
        "platform_id": _source_id(card, canonical_url),
        "record_kind": "service_listing",
        "title": title,
        "description": None,
        "budget_min": budget_min,
        "budget_max": None,
        "currency": currency,
        "bid_count": None,
        "skills": [],
        "employer_id": None,
        "deadline": None,
        "source_url": canonical_url,
        "retrieved_at": retrieved_at,
        "retrieval_method": "fiverr_public_web",
        "verified": True,
        "raw_source": "fiverr",
    }


@mcp.tool()
def search_fiverr_listings(query: str, limit: int = 5) -> str:
    """Search public Fiverr seller service listings without treating them as buyer opportunities."""
    try:
        query = _validate_query(query)
        limit = _validate_limit(limit)
    except ValueError as exc:
        return _error(str(exc), listings=True)

    try:
        response = requests.get(
            FIVERR_SEARCH_URL,
            params={"query": query},
            headers={"User-Agent": "OpportunityOS-Fiverr-Connector/1.0"},
            timeout=10,
        )
    except requests.RequestException:
        logger.warning("Fiverr search unavailable due to request failure")
        return _failure("unavailable", "Fiverr public search request could not be completed.", query=query)
    except Exception:
        logger.exception("Unexpected local error during Fiverr search")
        return _failure("error", "Unexpected local error while searching Fiverr.", query=query)

    if response.status_code != 200:
        return _failure(
            "unavailable",
            "Fiverr public search did not return a successful response.",
            query=query,
            status_code=response.status_code,
        )

    text = response.text if isinstance(response.text, str) else ""
    if _is_block_page(text):
        return _failure(
            "unavailable",
            "Fiverr public search is currently blocked by an anti-bot verification page.",
            query=query,
        )

    soup = BeautifulSoup(text, "html.parser")
    cards = _listing_cards(soup)
    if not cards:
        return _failure(
            "invalid_response",
            "Fiverr response contained no verifiable service-listing cards.",
            query=query,
        )

    retrieved_at = _utc_now()
    listings = []
    for card in cards:
        normalized = _normalize_card(card, retrieved_at)
        if normalized is not None:
            listings.append(normalized)
        if len(listings) >= limit:
            break

    if not listings:
        return _failure(
            "invalid_response",
            "Fiverr response contained no structurally valid service listings.",
            query=query,
        )

    return json.dumps({
        "status": "success",
        "source": "fiverr",
        "verified": True,
        "query": query,
        "count": len(listings),
        "listings": listings,
    }, indent=2)


def _validate_listing_url(url: str) -> str | None:
    return _canonical_fiverr_url(url)


@mcp.tool()
def get_fiverr_listing_details(url: str) -> str:
    """Retrieve a public Fiverr listing only when real source facts can be verified."""
    canonical_url = _validate_listing_url(url)
    if canonical_url is None:
        return _error("url must be an https://www.fiverr.com listing URL")

    try:
        response = requests.get(
            canonical_url,
            headers={"User-Agent": "OpportunityOS-Fiverr-Connector/1.0"},
            timeout=10,
        )
    except requests.RequestException:
        return json.dumps({
            "status": "unavailable",
            "source": "fiverr",
            "verified": False,
            "source_url": canonical_url,
            "message": "Fiverr listing request could not be completed.",
        }, indent=2)

    if response.status_code != 200:
        return json.dumps({
            "status": "unavailable",
            "source": "fiverr",
            "verified": False,
            "source_url": canonical_url,
            "status_code": response.status_code,
            "message": "Fiverr listing did not return a successful response.",
        }, indent=2)

    text = response.text if isinstance(response.text, str) else ""
    if _is_block_page(text):
        return json.dumps({
            "status": "unavailable",
            "source": "fiverr",
            "verified": False,
            "source_url": canonical_url,
            "message": "Fiverr listing is currently blocked by an anti-bot verification page.",
        }, indent=2)

    soup = BeautifulSoup(text, "html.parser")
    title_node = soup.select_one("h1")
    title = title_node.get_text(" ", strip=True) if title_node else ""
    if not title:
        return json.dumps({
            "status": "unsupported",
            "source": "fiverr",
            "verified": False,
            "source_url": canonical_url,
            "message": "No source-backed listing details could be verified from the public response.",
        }, indent=2)

    return json.dumps({
        "status": "success",
        "source": "fiverr",
        "verified": True,
        "record_kind": "service_listing",
        "title": title,
        "source_url": canonical_url,
        "retrieved_at": _utc_now(),
        "retrieval_method": "fiverr_public_web",
    }, indent=2)


@mcp.tool()
def generate_fiverr_affiliate_link(url: str, affiliate_id: str) -> str:
    """Construct an explicitly unverified affiliate candidate URL isolated from ranking."""
    canonical_url = _validate_listing_url(url)
    if canonical_url is None:
        return _error("url must be an https://www.fiverr.com listing URL")
    if not isinstance(affiliate_id, str) or not affiliate_id.strip():
        return _error("affiliate_id must be a non-blank string")

    parsed = urlparse(canonical_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["afp"] = affiliate_id.strip()
    candidate = urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", urlencode(query), ""))
    return json.dumps({
        "status": "success",
        "source": "fiverr",
        "verified": False,
        "candidate_url": candidate,
        "affiliate_format_status": "unverified",
        "affects_ranking": False,
        "message": "Affiliate parameter semantics are not treated as verified marketplace evidence.",
    }, indent=2)


@mcp.tool()
def fiverr_connector_status() -> str:
    """Report explicit read-only Fiverr connector capabilities."""
    return json.dumps({
        "status": "ok",
        "connector": "fiverr",
        "version": CONNECTOR_VERSION,
        "mode": "read_only_service_listing_adapter",
        "health": "degraded",
        "health_reason": "Public-web retrieval may be blocked or change without notice.",
        "capabilities": {
            "listing_search": True,
            "listing_details": True,
            "affiliate_url_generation": True,
            "buyer_opportunity_discovery": False,
            "messaging": False,
            "purchasing": False,
            "financial_actions": False,
        },
    }, indent=2)


if __name__ == "__main__":
    mcp.run()

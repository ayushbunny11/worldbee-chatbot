"""Fetch a web page so it can be indexed like an uploaded file.

The address comes from the user, but the request is made by the backend, so it is
checked first: only http(s), and never an address on a private network (your own
machine, your router, cloud metadata services...). Redirects are followed by hand so
every hop gets the same check. Set WORLDBEE_ALLOW_PRIVATE_URLS=1 to switch the
check off, for example to index pages on your own network.
"""

import ipaddress
import os
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx

ALLOW_PRIVATE = os.getenv("WORLDBEE_ALLOW_PRIVATE_URLS") == "1"
TIMEOUT_SECONDS = 15
MAX_REDIRECTS = 5
# Some sites refuse the default Python user agent.
USER_AGENT = "Mozilla/5.0 (compatible; WorldBee/1.0; +https://github.com/ayushbunny11/WorldBee)"
# Less text than this on a page means we got a shell that needs JavaScript, a login wall, etc.
MIN_PAGE_CHARS = 100


class FetchError(ValueError):
    """A problem with a link that the user can understand (bad address, site down...)."""


@dataclass
class Fetched:
    url: str  # The final address, after redirects.
    content_type: str  # Lower case, without parameters, e.g. "text/html".
    data: bytes


def _check_public(host: str) -> None:
    """Refuse hosts that point at this machine or a private network."""
    if ALLOW_PRIVATE:
        return
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, None)}
    except socket.gaierror:
        raise FetchError("Couldn't find that site. Check the address.") from None
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if getattr(ip, "ipv4_mapped", None):
            ip = ip.ipv4_mapped
        if not ip.is_global:
            raise FetchError("That address is on a private network, so it can't be fetched.")


def normalise_url(raw: str) -> str:
    url = raw.strip()
    if "://" not in url:
        url = "https://" + url
    parts = urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise FetchError("Enter a web address that starts with http:// or https://.")
    return url


def fetch(raw_url: str, max_bytes: int) -> Fetched:
    """Download a page (or file), following up to MAX_REDIRECTS redirects."""
    url = normalise_url(raw_url)
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,application/pdf,text/plain,*/*;q=0.5"}
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS, headers=headers, follow_redirects=False) as client:
            for _ in range(MAX_REDIRECTS + 1):
                parts = urlparse(url)
                if parts.scheme not in ("http", "https") or not parts.hostname:
                    raise FetchError("The page redirected somewhere that can't be fetched.")
                _check_public(parts.hostname)
                with client.stream("GET", url) as response:
                    if response.is_redirect and response.headers.get("location"):
                        url = urljoin(url, response.headers["location"])
                        continue
                    if response.status_code >= 400:
                        raise FetchError(f"The site answered with an error ({response.status_code}).")
                    data = bytearray()
                    for chunk in response.iter_bytes():
                        data += chunk
                        if len(data) > max_bytes:
                            raise FetchError(f"The page is larger than {max_bytes // (1024 * 1024)} MB.")
                    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
                    return Fetched(url=url, content_type=content_type, data=bytes(data))
            raise FetchError("The page redirected too many times.")
    except httpx.TimeoutException:
        raise FetchError("The site took too long to answer.") from None
    except httpx.HTTPError:
        raise FetchError("Couldn't connect to that site.") from None


def extract_page(html: bytes, url: str) -> tuple[str, str]:
    """The readable text of an HTML page and its title, without menus, ads and footers."""
    import trafilatura

    text = trafilatura.extract(html, url=url, include_tables=True, include_comments=False, favor_recall=True) or ""
    if len(text.strip()) < MIN_PAGE_CHARS:
        raise FetchError("Couldn't find readable text on that page. It may load its content with JavaScript.")
    meta = trafilatura.extract_metadata(html, default_url=url)
    title = (meta.title if meta and meta.title else "").strip()
    return title, text.strip()

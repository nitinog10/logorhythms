"""Unit tests for Vercel deploy URL normalization."""

from app.services.vercel_service import _best_public_url, _https_url


def test_https_url_adds_scheme():
    assert _https_url("a.vercel.app") == "https://a.vercel.app"
    assert _https_url("https://a.vercel.app") == "https://a.vercel.app"


def test_best_public_url_prefers_alias():
    u = _best_public_url(
        {
            "url": "my-app-git-hash.vercel.app",
            "alias": ["my-interior-design-website.vercel.app"],
        }
    )
    assert u == "https://my-interior-design-website.vercel.app"


def test_best_public_url_falls_back_to_deployment_url():
    u = _best_public_url({"url": "my-app-unique.vercel.app", "alias": []})
    assert u == "https://my-app-unique.vercel.app"

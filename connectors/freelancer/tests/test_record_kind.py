import json
from unittest.mock import Mock

import freelancer_mcp_server as server


def test_freelancer_projects_are_buyer_opportunities(monkeypatch):
    response = Mock(status_code=200)
    response.json.return_value = {
        "result": {
            "projects": [
                {
                    "id": 42,
                    "title": "Build a Python data pipeline",
                    "seo_url": "python/build-python-data-pipeline",
                }
            ]
        }
    }
    monkeypatch.setattr(server.requests, "get", lambda *args, **kwargs: response)

    payload = json.loads(server.search_freelancer_projects("python"))

    assert payload["status"] == "success"
    assert payload["projects"][0]["record_kind"] == "buyer_opportunity"

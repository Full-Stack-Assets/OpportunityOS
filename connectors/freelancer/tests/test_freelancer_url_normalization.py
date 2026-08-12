import json

import freelancer_mcp_server as server


class _Response:
    status_code = 200

    def json(self):
        return {
            "result": {
                "projects": [{"id": " 42 ", "title": "Normalized id"}],
            }
        }


def test_project_url_fallback_uses_normalized_source_identifier(monkeypatch):
    monkeypatch.setattr(server.requests, "get", lambda *a, **k: _Response())

    item = json.loads(server.search_freelancer_projects("normalized"))["projects"][0]
    assert item["platform_id"] == "42"
    assert item["source_url"] == "https://www.freelancer.com/projects/42"

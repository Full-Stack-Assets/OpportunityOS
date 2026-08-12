from pathlib import Path

import freelancer_mcp_server as server


def test_connector_uses_mcp_v2_server_api():
    source = Path(server.__file__).read_text(encoding="utf-8")
    assert "from mcp.server import MCPServer" in source
    assert "mcp.server.fastmcp" not in source
    assert "FastMCP" not in source

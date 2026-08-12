"""Test-only MCPServer shim used only when the external mcp package is unavailable."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import types
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


if importlib.util.find_spec("mcp") is None:
    class FakeMCPServer:
        def __init__(self, name: str):
            self.name = name
            self._registered_tools: list[str] = []

        def tool(self):
            def decorator(func):
                self._registered_tools.append(func.__name__)
                return func
            return decorator

        async def list_tools(self):
            return [SimpleNamespace(name=name) for name in self._registered_tools]

        def run(self):
            return None


    mcp_module = types.ModuleType("mcp")
    server_module = types.ModuleType("mcp.server")
    server_module.MCPServer = FakeMCPServer
    mcp_module.server = server_module

    sys.modules["mcp"] = mcp_module
    sys.modules["mcp.server"] = server_module

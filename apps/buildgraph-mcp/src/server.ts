import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  BUILDGRAPH_CAPABILITIES,
  resolveCapabilityGraph,
} from '@opportunityos/core';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';

const SERVER_VERSION = '0.1.0-simulation';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'opportunityos-buildgraph',
    version: SERVER_VERSION,
  });

  server.registerTool(
    'buildgraph_list_capabilities',
    {
      title: 'List BuildGraph capabilities',
      description: 'Use this when you need to inspect the reusable capabilities currently modeled by OpportunityOS BuildGraph before planning or executing a workflow.',
      inputSchema: {
        autonomy: z.enum(['autonomous', 'autonomous-with-verification', 'human-gated', 'prohibited']).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ autonomy }) => {
      const capabilities = autonomy
        ? BUILDGRAPH_CAPABILITIES.filter((node) => node.autonomy === autonomy)
        : BUILDGRAPH_CAPABILITIES;
      return toolResult({ capabilities });
    },
  );

  server.registerTool(
    'buildgraph_resolve_workflow',
    {
      title: 'Resolve a BuildGraph workflow',
      description: 'Use this when a goal must be translated into an ordered capability path with blockers, missing capabilities, or human approval gates.',
      inputSchema: {
        goalId: z.string().min(1),
        availableCapabilities: z.array(z.string().min(1)).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ goalId, availableCapabilities }) => {
      const available = new Set(availableCapabilities ?? BUILDGRAPH_CAPABILITIES.map((node) => node.id));
      try {
        return toolResult({ ...resolveCapabilityGraph(goalId, available) });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'buildgraph_check_readiness',
    {
      title: 'Check workflow readiness',
      description: 'Use this when deciding whether OpportunityOS can complete a workflow end-to-end before applying, committing, or starting fulfillment.',
      inputSchema: {
        goalId: z.string().min(1),
        availableCapabilities: z.array(z.string().min(1)),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ goalId, availableCapabilities }) => {
      try {
        const resolution = resolveCapabilityGraph(goalId, new Set(availableCapabilities));
        const coverage = resolution.orderedIds.length === 0
          ? 0
          : (resolution.orderedIds.length - resolution.missingIds.length) / resolution.orderedIds.length;
        return toolResult({
          ...resolution,
          capabilityCoverage: Number((coverage * 100).toFixed(2)),
          readyForAutonomousExecution: resolution.status === 'ready',
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'buildgraph_verify_completion',
    {
      title: 'Verify workflow completion evidence',
      description: 'Use this when an execution claims to be complete and the required evidence for each capability must be checked before accepting the result.',
      inputSchema: {
        goalId: z.string().min(1),
        evidenceByCapability: z.record(z.string(), z.array(z.string())),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ goalId, evidenceByCapability }) => {
      try {
        const resolution = resolveCapabilityGraph(
          goalId,
          new Set(BUILDGRAPH_CAPABILITIES.map((node) => node.id)),
        );
        const byId = new Map(BUILDGRAPH_CAPABILITIES.map((node) => [node.id, node]));
        const missingEvidence: Array<{ capabilityId: string; required: string[]; provided: string[] }> = [];

        for (const id of resolution.orderedIds) {
          const node = byId.get(id);
          if (!node) continue;
          const provided = new Set(evidenceByCapability[id] ?? []);
          const required = node.evidence.filter((evidence) => !provided.has(evidence));
          if (required.length > 0) {
            missingEvidence.push({ capabilityId: id, required, provided: [...provided] });
          }
        }

        return toolResult({
          goalId,
          accepted: missingEvidence.length === 0 && resolution.status === 'ready',
          resolutionStatus: resolution.status,
          missingEvidence,
          rule: 'EXECUTED -> EVIDENCE_PRODUCED -> VERIFIED -> ACCEPTED',
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    'buildgraph_capability_gaps',
    {
      title: 'Rank BuildGraph capability gaps',
      description: 'Use this when repeated opportunities or failures reveal missing capabilities and you need to prioritize which skill, tool, plugin, verifier, or human gate to improve next.',
      inputSchema: {
        observations: z.array(z.object({
          capabilityId: z.string().min(1),
          occurrenceCount: z.number().int().nonnegative(),
          estimatedValue: z.number().nonnegative().optional(),
          implementationCost: z.number().nonnegative().optional(),
          verificationFeasible: z.boolean().default(true),
          reason: z.string().optional(),
        })),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ observations }) => {
      const ranked = observations
        .map((item) => {
          const value = item.estimatedValue ?? 0;
          const cost = item.implementationCost ?? 1;
          const feasibilityMultiplier = item.verificationFeasible ? 1 : 0.25;
          const score = item.occurrenceCount * ((value + 1) / (cost + 1)) * feasibilityMultiplier;
          return { ...item, score: Number(score.toFixed(4)) };
        })
        .sort((a, b) => b.score - a.score);
      return toolResult({ ranked, note: 'Scores are prioritization heuristics, not realized revenue.' });
    },
  );

  return server;
}

function toolResult(structuredContent: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structuredContent) }],
    structuredContent,
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown BuildGraph error';
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
    structuredContent: { status: 'error', message },
  };
}

const port = Number.parseInt(process.env.PORT ?? '8000', 10);
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'opportunityos-buildgraph', version: SERVER_VERSION, mode: 'simulation' });
});

app.all('/mcp', async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('BuildGraph MCP error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

app.listen(port, () => {
  console.log(`OpportunityOS BuildGraph MCP listening on http://localhost:${port}/mcp`);
});

export { createServer };

import { spawn } from 'node:child_process';
import type { FreelancerGatewayInput, FreelancerGatewayOutput, FreelancerGatewayTransport } from './freelancer-trusted-gateway.ts';

export interface PythonGatewayTransportOptions {
  pythonExecutable?: string;
  gatewayScript: string;
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export function createPythonFreelancerGatewayTransport(options: PythonGatewayTransportOptions): FreelancerGatewayTransport {
  const pythonExecutable = options.pythonExecutable ?? 'python';
  const timeoutMs = options.timeoutMs ?? 15_000;

  return async (input: FreelancerGatewayInput): Promise<FreelancerGatewayOutput> => new Promise((resolve) => {
    const child = spawn(pythonExecutable, [options.gatewayScript], {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (output: FreelancerGatewayOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(output);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ status: 'failed', verified: false, message: 'Trusted gateway timed out.' });
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', () => finish({ status: 'failed', verified: false, message: 'Trusted gateway process could not start.' }));
    child.on('close', () => {
      if (settled) return;
      try {
        const parsed: unknown = JSON.parse(stdout);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          finish({ status: 'failed', verified: false, message: 'Trusted gateway returned an invalid response.' });
          return;
        }
        const candidate = parsed as Partial<FreelancerGatewayOutput>;
        if (typeof candidate.status !== 'string') {
          finish({ status: 'failed', verified: false, message: 'Trusted gateway response omitted status.' });
          return;
        }
        finish({
          status: candidate.status,
          ...(typeof candidate.verified === 'boolean' ? { verified: candidate.verified } : {}),
          ...(typeof candidate.external_id === 'string' ? { external_id: candidate.external_id } : {}),
          ...(Array.isArray(candidate.evidence_refs) && candidate.evidence_refs.every((ref) => typeof ref === 'string') ? { evidence_refs: candidate.evidence_refs } : {}),
          ...(typeof candidate.message === 'string' ? { message: candidate.message } : stderr ? { message: 'Trusted gateway reported an execution error.' } : {}),
        });
      } catch {
        finish({ status: 'failed', verified: false, message: 'Trusted gateway returned malformed JSON.' });
      }
    });

    child.stdin.end(JSON.stringify(input));
  });
}

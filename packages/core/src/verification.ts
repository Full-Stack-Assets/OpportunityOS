import { hashCanonical } from './canonical.ts';

export interface VerifiableArtifact {
  id: string;
  content: string;
  checksum: string;
}

export type VerificationResult =
  | { verified: true; artifactId: string; observedChecksum: string }
  | { verified: false; artifactId: string; observedChecksum: string; reason: 'CHECKSUM_MISMATCH' };

export function verifyArtifact(artifact: VerifiableArtifact): VerificationResult {
  const observedChecksum = hashCanonical(artifact.content);
  if (observedChecksum !== artifact.checksum) {
    return { verified: false, artifactId: artifact.id, observedChecksum, reason: 'CHECKSUM_MISMATCH' };
  }
  return { verified: true, artifactId: artifact.id, observedChecksum };
}

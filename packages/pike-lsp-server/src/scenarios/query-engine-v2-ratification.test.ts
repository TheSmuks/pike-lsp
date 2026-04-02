import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtocolCompatible } from '../query-engine/contracts.js';

interface ContractInvariant {
  id: string;
  title: string;
  acceptanceTest: string;
}

interface ContractSnapshot {
  artifact: string;
  version: string;
  status: string;
  handshake: {
    protocol: string;
    major: number;
    minor: number;
  };
  invariants: ContractInvariant[];
}

function readWorkspaceFile(relativePath: string): string {
  const fromModule = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(fromModule, '../../../../..', relativePath),
    path.resolve(fromModule, '../../../..', relativePath),
    path.resolve(process.cwd(), relativePath),
  ];
  const absolutePath = candidates.find(candidate => existsSync(candidate));
  if (!absolutePath) {
    throw new Error(`Unable to locate workspace file: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf8');
}

describe('Scenario: query engine v2 ratification', () => {
  it('should publish active accepted RFC and protocol with versioned 8-invariant contract', () => {
    const rfc = readWorkspaceFile('docs/specs/query-engine-v2-rfc.md');
    const protocol = readWorkspaceFile('docs/specs/query-engine-v2-protocol.md');
    const contractRaw = readWorkspaceFile(
      'docs/specs/query-engine-v2-protocol-contract.v2.0.0.json'
    );
    const contract = JSON.parse(contractRaw) as ContractSnapshot;

    assert.match(rfc, /Status:\s+Active \(Accepted\)/);
    assert.match(rfc, /RFC Version:\s+2\.0\.0/);
    assert.match(protocol, /Status:\s+Active \(Accepted\)/);
    assert.match(protocol, /Protocol Version:\s+2\.0\.0/);

    assert.equal(contract.artifact, 'query-engine-v2-protocol-contract');
    assert.equal(contract.version, '2.0.0');
    assert.equal(contract.status, 'active-accepted');
    assert.equal(contract.invariants.length, 8);

    for (const invariant of contract.invariants) {
      assert.match(invariant.id, /^INV-0[1-8]$/);
      assert.ok(invariant.title.length > 0);
      assert.ok(invariant.acceptanceTest.length > 0);
    }

    assert.equal(
      isProtocolCompatible({
        protocol: contract.handshake.protocol,
        version: contract.version,
        major: contract.handshake.major,
        minor: contract.handshake.minor,
      }),
      true
    );

    assert.equal(
      isProtocolCompatible({
        protocol: contract.handshake.protocol,
        version: '3.0.0',
        major: contract.handshake.major + 1,
        minor: 0,
      }),
      false
    );
  });
});

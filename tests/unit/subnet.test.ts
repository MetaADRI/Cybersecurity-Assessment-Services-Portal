import { describe, expect, it } from 'vitest';
import { runSubnetCalculator } from '../../server/src/free-checks/subnet';

describe('subnet calculator', () => {
  it('breaks a /24 into network, broadcast and usable range', async () => {
    const result = await runSubnetCalculator({ target: '192.168.10.42/24' });
    expect(result.serviceKey).toBe('subnet_calculator');
    expect(result.meta?.subnet).toMatchObject({
      cidr: '192.168.10.0/24',
      prefix: 24,
      network: '192.168.10.0',
      broadcast: '192.168.10.255',
      netmask: '255.255.255.0',
      wildcard: '0.0.0.255',
      firstUsable: '192.168.10.1',
      lastUsable: '192.168.10.254',
      usableHosts: '254',
      totalAddresses: '256',
      scope: 'Private (RFC 1918)',
      isPrivate: true,
    });
    expect(result.meta?.subnet?.binary.network).toBe('11000000.10101000.00001010.00000000');
  });

  it('accepts a dotted netmask instead of a prefix', async () => {
    const result = await runSubnetCalculator({ target: '10.0.0.5/255.255.255.0' });
    expect(result.meta?.subnet?.prefix).toBe(24);
    expect(result.meta?.subnet?.cidr).toBe('10.0.0.0/24');
  });

  it('defaults a bare address to a single host route', async () => {
    const result = await runSubnetCalculator({ target: '203.0.113.9' });
    expect(result.meta?.subnet).toMatchObject({
      prefix: 32,
      usableHosts: '1',
      firstUsable: '203.0.113.9',
      lastUsable: '203.0.113.9',
    });
  });

  it('treats /31 as a two-address point-to-point link', async () => {
    const result = await runSubnetCalculator({ target: '198.51.100.10/31' });
    expect(result.meta?.subnet).toMatchObject({
      network: '198.51.100.10',
      broadcast: '198.51.100.11',
      usableHosts: '2',
      firstUsable: '198.51.100.10',
      lastUsable: '198.51.100.11',
    });
  });

  it('rejects malformed addresses and prefixes', async () => {
    await expect(runSubnetCalculator({ target: '192.168.1.999/24' })).rejects.toThrow(/valid IPv4/);
    await expect(runSubnetCalculator({ target: '192.168.1.1/33' })).rejects.toThrow(
      /prefix length/,
    );
    await expect(runSubnetCalculator({ target: '192.168.1.1/255.0.255.0' })).rejects.toThrow(
      /contiguous dotted netmask/,
    );
  });
});

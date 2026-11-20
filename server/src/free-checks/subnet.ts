import {
  FREE_RESULT_SCHEMA_VERSION,
  TOOL_FINDING_COPY,
  type FreeFinding,
  type FreeResult,
  type SubnetMeta,
} from '../../../shared/free-services';
import { ValidationError } from '../utils/errors';

function parseIpv4(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = ((result << 8) | octet) >>> 0;
  }
  return result;
}

function formatIpv4(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff].join(
    '.',
  );
}

function binaryIpv4(value: number): string {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
    .map((octet) => octet.toString(2).padStart(8, '0'))
    .join('.');
}

function maskForPrefix(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

function prefixFromNetmask(ip: number): number | null {
  let seenZero = false;
  let bits = 0;
  for (let bit = 31; bit >= 0; bit -= 1) {
    const set = ((ip >>> bit) & 1) === 1;
    if (set && seenZero) return null;
    if (!set) seenZero = true;
    if (set) bits += 1;
  }
  return bits;
}

function inRange(address: number, base: string, bits: number): boolean {
  const baseInt = parseIpv4(base);
  if (baseInt === null) return false;
  const mask = maskForPrefix(bits);
  return (address & mask) >>> 0 === (baseInt & mask) >>> 0;
}

function addressClass(firstOctet: number): string {
  if (firstOctet < 127) return 'Class A';
  if (firstOctet === 127) return 'Loopback';
  if (firstOctet < 192) return 'Class B';
  if (firstOctet < 224) return 'Class C';
  if (firstOctet < 240) return 'Class D (multicast)';
  return 'Class E (reserved)';
}

function addressScope(address: number, firstOctet: number): { scope: string; isPrivate: boolean } {
  if (firstOctet === 127 || inRange(address, '127.0.0.0', 8)) {
    return { scope: 'Loopback', isPrivate: false };
  }
  if (inRange(address, '169.254.0.0', 16)) {
    return { scope: 'Link-local', isPrivate: false };
  }
  if (inRange(address, '100.64.0.0', 10)) {
    return { scope: 'Carrier-grade NAT', isPrivate: false };
  }
  if (inRange(address, '10.0.0.0', 8)) return { scope: 'Private (RFC 1918)', isPrivate: true };
  if (inRange(address, '172.16.0.0', 12)) return { scope: 'Private (RFC 1918)', isPrivate: true };
  if (inRange(address, '192.168.0.0', 16)) return { scope: 'Private (RFC 1918)', isPrivate: true };
  if (inRange(address, '224.0.0.0', 4)) return { scope: 'Multicast', isPrivate: false };
  if (firstOctet >= 240 || inRange(address, '0.0.0.0', 8)) {
    return { scope: 'Reserved', isPrivate: false };
  }
  if (
    inRange(address, '192.0.2.0', 24) ||
    inRange(address, '198.18.0.0', 15) ||
    inRange(address, '198.51.100.0', 24) ||
    inRange(address, '203.0.113.0', 24)
  ) {
    return { scope: 'Reserved for documentation/testing', isPrivate: false };
  }
  return { scope: 'Public', isPrivate: false };
}

export async function runSubnetCalculator(input: { target: string }): Promise<FreeResult> {
  const raw = input.target.trim();
  if (!raw)
    throw new ValidationError('Enter an IPv4 address with a prefix, such as 192.168.1.10/24');

  const slash = raw.indexOf('/');
  const addressPart = slash === -1 ? raw : raw.slice(0, slash);
  const prefixPart = slash === -1 ? '32' : raw.slice(slash + 1).trim();
  if (!prefixPart) throw new ValidationError('Add a prefix length after the slash, such as /24');

  const address = parseIpv4(addressPart);
  if (address === null) {
    throw new ValidationError('Enter a valid IPv4 address, such as 192.168.1.10/24');
  }

  let prefix: number;
  if (prefixPart.includes('.')) {
    const netmask = parseIpv4(prefixPart);
    const derived = netmask === null ? null : prefixFromNetmask(netmask);
    if (derived === null) {
      throw new ValidationError('Enter a valid prefix length (0-32) or contiguous dotted netmask');
    }
    prefix = derived;
  } else {
    if (!/^\d{1,2}$/.test(prefixPart)) {
      throw new ValidationError('Enter a valid prefix length (0-32)');
    }
    prefix = Number(prefixPart);
    if (prefix > 32) throw new ValidationError('Enter a valid prefix length (0-32)');
  }

  const mask = maskForPrefix(prefix);
  const network = (address & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const totalAddresses = 2 ** (32 - prefix);
  const firstUsable = prefix >= 31 ? network : (network + 1) >>> 0;
  const lastUsable = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
  const usableHosts = prefix >= 31 ? totalAddresses : Math.max(0, totalAddresses - 2);
  const firstOctet = (network >>> 24) & 0xff;
  const { scope, isPrivate } = addressScope(network, firstOctet);

  const subnet: SubnetMeta = {
    input: raw,
    cidr: `${formatIpv4(network)}/${prefix}`,
    prefix,
    network: formatIpv4(network),
    broadcast: formatIpv4(broadcast),
    netmask: formatIpv4(mask),
    wildcard: formatIpv4(~mask >>> 0),
    firstUsable: formatIpv4(firstUsable),
    lastUsable: formatIpv4(lastUsable),
    totalAddresses: totalAddresses.toLocaleString('en-GB'),
    usableHosts: usableHosts.toLocaleString('en-GB'),
    addressClass: addressClass(firstOctet),
    scope,
    isPrivate,
    binary: {
      network: binaryIpv4(network),
      netmask: binaryIpv4(mask),
    },
  };

  const finding: FreeFinding = {
    id: 'subnet.calculated',
    ...TOOL_FINDING_COPY['subnet.calculated'],
    detail: `${subnet.cidr} · ${subnet.scope} · ${subnet.usableHosts} usable address(es)`,
  };

  return {
    schemaVersion: FREE_RESULT_SCHEMA_VERSION,
    serviceKey: 'subnet_calculator',
    score: 100,
    grade: 'A',
    summary: `Network ${subnet.network}, broadcast ${subnet.broadcast}, usable hosts ${subnet.firstUsable} to ${subnet.lastUsable}.`,
    findings: [finding],
    checkedAt: new Date().toISOString(),
    meta: {
      target: subnet.cidr,
      checksRun: 1,
      subnet,
    },
  };
}

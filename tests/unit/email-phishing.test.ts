import { describe, expect, it } from 'vitest';
import { runEmailPhishingCheck } from '../../server/src/free-checks/email-phishing';

const phishingEmail = `Delivered-To: me@example.com
Received: from mail.accounts-payments.co by mx.example.com with ESMTPS
Authentication-Results: mx.example.com; spf=fail smtp.mailfrom=accounts-payments.co; dkim=fail header.d=accounts-payments.co; dmarc=fail header.from=accounts-payments.co
From: "PayPal Security" <security@random-mail.test>
Reply-To: billing@different-domain.test
Subject: Urgent: verify your account
Dear User,
We need your password and one-time code immediately. Pay the invoice here: https://bit.ly/verify-now
`;

const cleanEmail = `Authentication-Results: mx.example.com; spf=pass smtp.mailfrom=northwind.co.zm; dkim=pass header.d=northwind.co.zm; dmarc=pass header.from=northwind.co.zm
From: Jane Doe <jane@northwind.co.zm>
Reply-To: jane@northwind.co.zm
Subject: Meeting notes
Hi Team,
The notes from today's planning session are ready. Thanks for the useful discussion.
`;

describe('suspicious email analyzer', () => {
  it('detects sender, authentication, urgency and link signals', async () => {
    const result = await runEmailPhishingCheck({ target: phishingEmail });
    const ids = result.findings.map((finding) => finding.id);
    expect(result.serviceKey).toBe('email_phishing_check');
    expect(ids).toContain('emailphish.sender_mismatch');
    expect(ids).toContain('emailphish.reply_to_mismatch');
    expect(ids).toContain('emailphish.spf_fail');
    expect(ids).toContain('emailphish.dkim_fail');
    expect(ids).toContain('emailphish.dmarc_fail');
    expect(ids).toContain('emailphish.credential_request');
    expect(ids).toContain('emailphish.shortened_links');
    expect(result.score).toBe(0);
    expect(result.meta?.emailPhishing?.links).toContainEqual({
      host: 'bit.ly',
      reason: 'URL shortening service',
    });
    expect(JSON.stringify(result)).not.toContain('one-time code immediately');
  });

  it('keeps a clean message at full score', async () => {
    const result = await runEmailPhishingCheck({ target: cleanEmail });
    expect(result.score).toBe(100);
    expect(result.findings.map((finding) => finding.id)).toEqual([
      'emailphish.no_obvious_signals',
    ]);
    expect(result.meta?.emailPhishing?.auth).toEqual({
      spf: 'pass',
      dkim: 'pass',
      dmarc: 'pass',
    });
  });

  it('flags missing authentication details without inventing a failure', async () => {
    const result = await runEmailPhishingCheck({
      target: `From: Jane Doe <jane@northwind.co.zm>\nSubject: Lunch\n\nHi Sam, are we still meeting at the usual place tomorrow?`,
    });
    const ids = result.findings.map((finding) => finding.id);
    expect(ids).toContain('emailphish.auth_missing');
    expect(ids).not.toContain('emailphish.spf_fail');
    expect(result.score).toBe(96);
  });

  it('rejects too little pasted content', async () => {
    await expect(runEmailPhishingCheck({ target: 'short' })).rejects.toThrow(/full suspicious email/i);
  });
});

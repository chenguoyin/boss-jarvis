#!/usr/bin/env node
/**
 * Open an Outlook compose window on Windows via Outlook COM.
 * Field values are passed as base64 to avoid quoting issues.
 * This only opens the window; sending stays with the user.
 */
const { spawnSync } = require('child_process');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const confirmed = process.argv.includes('--confirmed') || process.env.MAIL_REPLY_CONFIRMED === '1';
if (!confirmed) fail('写操作需要 --confirmed 或 MAIL_REPLY_CONFIRMED=1');

const to = process.argv.find(arg => arg.startsWith('--to='))?.slice('--to='.length);
const subject = process.argv.find(arg => arg.startsWith('--subject='))?.slice('--subject='.length);
const body = process.argv.find(arg => arg.startsWith('--body='))?.slice('--body='.length);
if (!to || !subject || !body) fail('用法: open-confirmed-reply.cjs --to=... --subject=... --body=... --confirmed');

const b64 = (value) => Buffer.from(value, 'utf8').toString('base64');
const psScript = [
  "$ErrorActionPreference = 'Stop'",
  'try {',
  "  $to = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64(to) + "'))",
  "  $subject = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64(subject) + "'))",
  "  $body = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + b64(body) + "'))",
  '  $outlook = New-Object -ComObject Outlook.Application',
  '  $mail = $outlook.CreateItem(0)',
  '  $mail.To = $to',
  '  $mail.Subject = $subject',
  '  $mail.Body = $body',
  '  $mail.Display()',
  '  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($mail) | Out-Null',
  '  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null',
  '  [pscustomobject]@{ ok = $true; opened = $true; sent = $false } | ConvertTo-Json -Compress',
  '} catch {',
  '  [pscustomobject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress',
  '  exit 1',
  '}',
].join('\n');

const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
  encoding: 'utf8',
  timeout: 30000,
});

if (result.status !== 0) {
  const detail = (result.stderr || result.stdout || '').trim() || 'Outlook 未响应';
  fail('无法打开回复窗口: ' + detail.replace(/\s+/g, ' '));
}

console.log(result.stdout.trim());

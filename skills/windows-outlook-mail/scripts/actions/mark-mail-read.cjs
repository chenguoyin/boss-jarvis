#!/usr/bin/env node
/**
 * Mark one Outlook message as read on Windows via Outlook COM.
 * The EntryID is passed to PowerShell as base64 to avoid quoting issues.
 */
const { spawnSync } = require('child_process');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const confirmed = process.argv.includes('--confirmed') || process.env.MAIL_MARK_READ_CONFIRMED === '1';
if (!confirmed) fail('写操作需要 --confirmed 或 MAIL_MARK_READ_CONFIRMED=1');

const messageId = process.argv.find(arg => arg.startsWith('--message-id='))?.slice('--message-id='.length);
if (!messageId) fail('用法: mark-mail-read.cjs --message-id=<EntryID> --confirmed');

const entryIdB64 = Buffer.from(messageId, 'utf8').toString('base64');
const psScript = [
  "$ErrorActionPreference = 'Stop'",
  'try {',
  "  $entryId = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + entryIdB64 + "'))",
  '  $outlook = New-Object -ComObject Outlook.Application',
  "  $namespace = $outlook.GetNamespace('MAPI')",
  '  $item = $namespace.GetItemFromID($entryId)',
  '  $item.UnRead = $false',
  '  $item.Save()',
  '  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($item) | Out-Null',
  '  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($namespace) | Out-Null',
  '  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($outlook) | Out-Null',
  '  [pscustomobject]@{ ok = $true; markedRead = $true } | ConvertTo-Json -Compress',
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
  fail('无法标记已读: ' + detail.replace(/\s+/g, ' '));
}

console.log(result.stdout.trim());

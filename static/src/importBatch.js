// One import batch, as run from the browser: submit the bulk upsert, wait for Jira's task to end, then
// finalise (service project + organisation membership). `invoke` is passed in so this is unit-tested
// against the real resolvers.

// Jira reports FAILED for bulk tasks that still created or updated the accounts (seen on a live site),
// so any terminal status just means "finished"; finalise decides what actually worked.
const TERMINAL = new Set(['COMPLETE', 'COMPLETED', 'SUCCESS', 'DONE', 'FAILED', 'CANCELLED']);
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForTask(invoke, taskId, { timeoutMs = 90000, intervalMs = 2000, sleep = defaultSleep, now = Date.now } = {}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    let status = '';
    try {
      status = String((await invoke('getTaskStatus', { taskId }))?.status || '').toUpperCase();
    } catch {
      status = '';
    }
    if (TERMINAL.has(status)) return status;
    if (now() >= deadline) return 'TIMED_OUT';
    await sleep(intervalMs);
  }
}

export async function submitAndFinaliseBatch(invoke, plan, batchIndex, options = {}) {
  const chunk = plan.chunks[batchIndex];
  const batchNumber = batchIndex + 1;
  const totalBatches = plan.chunks.length;
  const task = await invoke('bulkUpsertCustomers', {
    rows: chunk,
    importSessionId: plan.sessionId,
    batchNumber,
    totalBatches,
    idempotencyKey: `${plan.sessionId}-batch-${batchNumber}`,
    rowStart: chunk[0]?.rowNumber || null,
    rowEnd: chunk[chunk.length - 1]?.rowNumber || null
  });
  const taskStatus = await waitForTask(invoke, task.id, options);
  const finalised = await invoke('finaliseImportBatch', {
    rows: chunk.map((r) => ({ rowNumber: r.rowNumber, email: r.email, organizationIds: r.organizationIds || [] })),
    serviceDeskId: plan.serviceDeskId,
    importSessionId: plan.sessionId,
    batchNumber,
    totalBatches
  });
  return {
    ...task,
    taskStatus,
    submittedRows: chunk.length,
    linked: finalised.linked,
    problems: (finalised.results || []).filter((r) => r.status !== 'done')
  };
}

const csvCell = (value) => {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// CSV of rows that didn't finish, in the import's own format plus the reason, so they can be fixed and re-imported.
export function problemRowsCsv(problems, rowsByNumber) {
  const lines = ['Email,Full Name,Organisation,Row,Problem'];
  for (const p of problems) {
    const row = rowsByNumber.get(p.rowNumber) || {};
    lines.push([p.email, row.displayName || '', row.organisation || '', p.rowNumber, p.error || p.status].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

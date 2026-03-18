const backendUrl =
  process.env.PLAYWRIGHT_BACKEND_HEALTH_URL ?? 'http://localhost:3000/health';
const frontendUrl =
  process.env.PLAYWRIGHT_FRONTEND_URL ?? 'http://localhost:3001/es/login';
const timeoutMs = Number(process.env.PLAYWRIGHT_WAIT_TIMEOUT_MS ?? 180000);
const intervalMs = 2000;

async function waitForUrl(url, label) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

await waitForUrl(backendUrl, 'backend');
await waitForUrl(frontendUrl, 'frontend');

const healthUrl = process.env.API_HEALTH_URL ?? 'http://127.0.0.1:4000/api/v1/health/ready';
const timeoutMs = Number(process.env.API_STARTUP_TIMEOUT_MS ?? 120_000);
const startedAt = Date.now();

process.stdout.write(`Đang chờ API sẵn sàng tại ${healthUrl}\n`);

let ready = false;
while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2_500) });
    if (response.ok) {
      const body = await response.json();
      if (body?.status === 'ready') {
        process.stdout.write('API, MariaDB và Redis đã sẵn sàng.\n');
        ready = true;
        break;
      }
    }
  } catch {
    // API may still be compiling or waiting for its dependencies.
  }
  await new Promise((resolve) => setTimeout(resolve, 750));
}

if (!ready) {
  process.stderr.write(`API chưa sẵn sàng sau ${Math.round(timeoutMs / 1000)} giây. Kiểm tra log tiến trình api.\n`);
  process.exitCode = 1;
}

try {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || '3001'}/api/health`, {
    signal: AbortSignal.timeout(4_000),
    redirect: 'error',
  });
  if (!response.ok || (await response.json()).status !== 'ok') process.exitCode = 1;
} catch {
  // Keep credentials, upstream URLs and raw network errors out of Docker health logs.
  process.exitCode = 1;
}

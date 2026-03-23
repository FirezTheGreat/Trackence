type CheckResult = {
  name: string;
  ok: boolean;
  details: string;
};

const baseUrl = String(process.env.API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

const run = async () => {
  const checks: CheckResult[] = [];

  const push = (name: string, ok: boolean, details: string) => {
    checks.push({ name, ok, details });
  };

  try {
    const rootRes = await fetch(`${baseUrl}/`);
    const rootText = await rootRes.text();
    push(
      "Root endpoint",
      rootRes.ok && /backend is running/i.test(rootText),
      `status=${rootRes.status}`
    );
  } catch (error) {
    push("Root endpoint", false, `request failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const orgsRes = await fetch(`${baseUrl}/api/auth/organizations`);
    push("Public organizations endpoint", orgsRes.ok, `status=${orgsRes.status}`);
  } catch (error) {
    push("Public organizations endpoint", false, `request failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const meRes = await fetch(`${baseUrl}/api/auth/me`);
    push("Protected me endpoint rejects anonymous access", meRes.status === 401, `status=${meRes.status}`);
  } catch (error) {
    push("Protected me endpoint rejects anonymous access", false, `request failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    const healthRes = await fetch(`${baseUrl}/api/system/health`);
    const healthJson = await healthRes.json().catch(() => null);
    const looksValid = Boolean(healthJson && typeof healthJson === "object" && "status" in healthJson);
    push("System health endpoint", healthRes.ok && looksValid, `status=${healthRes.status}`);
  } catch (error) {
    push("System health endpoint", false, `request failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const failed = checks.filter((check) => !check.ok);

  console.log(`\nSmoke checks against ${baseUrl}`);
  for (const check of checks) {
    const mark = check.ok ? "PASS" : "FAIL";
    console.log(`- [${mark}] ${check.name} (${check.details})`);
  }

  if (failed.length > 0) {
    console.error(`\n${failed.length} smoke check(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll smoke checks passed.");
};

void run();

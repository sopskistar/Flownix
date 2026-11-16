export function localAccessAllowed(
  host: string | null,
  forwarded: boolean,
  mode: string,
  production: boolean,
) {
  // Only loopback listener plus exact Host, no forwarded requests, and never local bypass in production.
  return (
    mode === "local" &&
    !production &&
    !forwarded &&
    !!host &&
    /^(127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)
  );
}
export function safeCsv(value: unknown) {
  const s =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return (
    '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
  );
}

let connection = ""
for await (const chunk of process.stdin) connection += chunk

const normalized = connection.toLowerCase().replaceAll(/\s/g, "")
const values = (key: string): string[] => {
  const prefix = `${key}=`
  return normalized
    .split(";")
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length))
}
const required = new Map<string, string | undefined>([
  ["database", undefined],
  ["username", undefined],
  ["password", undefined],
  ["maximumpoolsize", "10"],
  ["minimumpoolsize", "0"],
  ["connectionidlelifetime", "240"],
  ["timeout", "15"],
  ["keepalive", "0"],
  ["sslmode", "verifyfull"],
  ["channelbinding", "require"],
  ["gssencryptionmode", "disable"],
  ["noresetonclose", "true"],
])
const host = values("host")
const valid =
  host.length === 1 &&
  host[0].includes("-pooler.") &&
  host[0].endsWith(".aws.neon.tech") &&
  [...required].every(([key, expected]) => {
    const setting = values(key)
    return setting.length === 1 && setting[0].length > 0 &&
      (expected === undefined || setting[0] === expected)
  }) &&
  values("trustservercertificate").length === 0

process.exitCode = valid ? 0 : 1

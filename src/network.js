const fs = require("fs");
const os = require("os");
const path = require("path");
const { runPowerShell } = require("./powershell");

const whitelistPath = path.join(__dirname, "..", "config", "whitelist.json");

function getLanAddresses(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];

  for (const records of Object.values(interfaces)) {
    for (const record of records || []) {
      if (record.family !== "IPv4" || record.internal) {
        continue;
      }

      urls.push(`http://${record.address}:${port}`);
    }
  }

  return urls;
}

function normalizeIp(address) {
  if (!address) {
    return "";
  }

  if (address.startsWith("::ffff:")) {
    return address.slice(7);
  }

  if (address === "::1") {
    return "127.0.0.1";
  }

  return address;
}

function normalizeMac(macAddress) {
  return String(macAddress || "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");
}

function loadWhitelist() {
  const raw = fs.readFileSync(whitelistPath, "utf8");
  const parsed = JSON.parse(raw);
  const allowedMacs = new Set((parsed.allowedMacs || []).map(normalizeMac).filter(Boolean));

  return {
    enabled: Boolean(parsed.enabled),
    allowedMacs
  };
}

function isLocalAddress(ipAddress) {
  return ipAddress === "127.0.0.1" || ipAddress === "::1";
}

async function lookupMacAddress(ipAddress) {
  const normalizedIp = normalizeIp(ipAddress);

  if (!normalizedIp || isLocalAddress(normalizedIp)) {
    return null;
  }

  const command = `
$neighbor = Get-NetNeighbor -IPAddress '${normalizedIp}' -ErrorAction SilentlyContinue |
  Where-Object { $_.LinkLayerAddress -and $_.State -ne 'Unreachable' } |
  Select-Object -First 1 -ExpandProperty LinkLayerAddress
if ($neighbor) { $neighbor }
`;

  const result = await runPowerShell([
    "-NoProfile",
    "-Command",
    command
  ]);

  return result || null;
}

async function authorizeRequest(request) {
  const whitelist = loadWhitelist();
  const ipAddress = normalizeIp(request.socket.remoteAddress);

  if (!whitelist.enabled || isLocalAddress(ipAddress)) {
    return {
      allowed: true,
      ipAddress,
      macAddress: null
    };
  }

  const macAddress = await lookupMacAddress(ipAddress);
  const normalizedMac = normalizeMac(macAddress);

  if (!normalizedMac) {
    return {
      allowed: false,
      ipAddress,
      macAddress: null,
      reason: "Could not resolve device MAC address from its IP."
    };
  }

  if (!whitelist.allowedMacs.has(normalizedMac)) {
    return {
      allowed: false,
      ipAddress,
      macAddress,
      reason: "Device MAC address is not in the whitelist."
    };
  }

  return {
    allowed: true,
    ipAddress,
    macAddress
  };
}

module.exports = {
  authorizeRequest,
  getLanAddresses,
  normalizeIp
};

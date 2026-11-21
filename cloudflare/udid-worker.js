// Ofuq UDID worker (Cloudflare Workers).
//
// The iPhone cannot give its UDID to a web page. It gives it to a "Profile Service" configuration profile:
//   1. GET  /profile  → the profile. iOS asks the user to install it (Settings > Profile Downloaded).
//   2. When installed, iOS sends the UDID, model and iOS version (signed by the device) to POST /submit.
//      Nothing stays installed on the iPhone.
//   3. /submit redirects Safari back to the Ofuq site with the UDID after "#" (never sent to any server again,
//      not logged by GitHub Pages). Nothing is stored here.
//   GET /ping → "ok", so the site can tell the service is up.
//
// Deploy: Cloudflare dashboard > Workers & Pages > Create > Worker, name it "ofuq-udid", paste this file, Deploy.

const SITE = "https://ufuq-official.github.io/iPhone-/udid.html";
const PROFILE_UUID = "6F0E2C1A-5B7D-4E3F-9A8B-0C1D2E3F4A5B";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET" && path === "/ping") {
      return new Response("ok", { headers: { ...corsHeaders(), "Cache-Control": "no-store" } });
    }

    if (request.method === "GET" && (path === "/" || path === "/profile")) {
      return new Response(profile(url.origin + "/submit"), {
        headers: {
          "Content-Type": "application/x-apple-aspen-config; charset=utf-8",
          "Content-Disposition": 'attachment; filename="ofuq-udid.mobileconfig"',
          "Cache-Control": "no-store",
        },
      });
    }

    if (request.method === "POST" && path === "/submit") {
      const body = new Uint8Array(await request.arrayBuffer());
      const info = deviceInfo(body);
      if (!info.udid) {
        return redirect(SITE + "#error=1");
      }
      const params = new URLSearchParams({ udid: info.udid });
      if (info.product) params.set("product", info.product);
      if (info.version) params.set("version", info.version);
      return redirect(SITE + "#" + params.toString());
    }

    return new Response("Not found", { status: 404 });
  },
};

// iOS opens the Location of a 301 in Safari once the profile is installed.
function redirect(location) {
  return new Response(null, { status: 301, headers: { Location: location, "Cache-Control": "no-store" } });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function profile(submitURL) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<dict>
		<key>URL</key>
		<string>${escapeXML(submitURL)}</string>
		<key>DeviceAttributes</key>
		<array>
			<string>UDID</string>
			<string>PRODUCT</string>
			<string>VERSION</string>
		</array>
	</dict>
	<key>PayloadOrganization</key>
	<string>منصة أفق</string>
	<key>PayloadDisplayName</key>
	<string>أفق - استخراج UDID</string>
	<key>PayloadDescription</key>
	<string>يقرأ رقم الـ UDID الخاص بجهازك حتى نفعّل شهادتك. لا يبقى أي شيء مثبّتاً على جهازك.</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadUUID</key>
	<string>${PROFILE_UUID}</string>
	<key>PayloadIdentifier</key>
	<string>com.ofuq.udid</string>
	<key>PayloadType</key>
	<string>Profile Service</string>
</dict>
</plist>
`;
}

function escapeXML(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The device signs its answer (PKCS#7); the plist inside is plain text between "<?xml" and "</plist>".
function deviceInfo(bytes) {
  const start = indexOf(bytes, "<?xml", 0);
  const end = start < 0 ? -1 : indexOf(bytes, "</plist>", start);
  if (start < 0 || end < 0) return {};

  const xml = new TextDecoder("utf-8").decode(bytes.subarray(start, end + "</plist>".length));
  const values = {};
  const pattern = /<key>\s*([A-Za-z_]+)\s*<\/key>\s*<string>([^<]*)<\/string>/g;
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    values[match[1]] = match[2].trim();
  }

  const info = {};
  // 40 hex characters (older iPhones) or 8-16 hex with a dash (iPhone XS and later).
  if (/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$|^[0-9A-Fa-f]{40}$/.test(values.UDID || "")) info.udid = values.UDID.toUpperCase();
  if (/^[A-Za-z]+[0-9]+,[0-9]+$/.test(values.PRODUCT || "")) info.product = values.PRODUCT;
  if (/^[0-9A-Za-z.]{1,16}$/.test(values.VERSION || "")) info.version = values.VERSION;
  return info;
}

function indexOf(bytes, text, from) {
  const needle = new TextEncoder().encode(text);
  outer: for (let i = from; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

(function () {
  "use strict";

  // Base64url helpers
  function b64urlEncode(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function b64urlDecode(str) {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function concat(...arrays) {
    const total = arrays.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrays) { out.set(a, offset); offset += a.length; }
    return out;
  }

  // Fernet: version(0x80) + timestamp(8) + iv(16) + AES-128-CBC(plaintext) + HMAC-SHA256
  // key32: first 16 bytes = signing key, last 16 bytes = AES key
  async function fernetEncrypt(plaintext, key32) {
    const signingKey = key32.slice(0, 16);
    const encKey = key32.slice(16, 32);

    const version = new Uint8Array([0x80]);
    const ts = new Uint8Array(8);
    const now = Math.floor(Date.now() / 1000);
    const dv = new DataView(ts.buffer);
    dv.setUint32(0, Math.floor(now / 0x100000000), false);
    dv.setUint32(4, now >>> 0, false);

    const iv = crypto.getRandomValues(new Uint8Array(16));
    const data = new TextEncoder().encode(plaintext);

    const aesKey = await crypto.subtle.importKey("raw", encKey, { name: "AES-CBC" }, false, ["encrypt"]);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, aesKey, data));

    const preHmac = concat(version, ts, iv, ciphertext);

    const hmacKey = await crypto.subtle.importKey(
      "raw", signingKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, preHmac));

    return b64urlEncode(concat(preHmac, mac));
  }

  async function fernetDecrypt(token, key32) {
    const bytes = b64urlDecode(token);
    if (bytes.length < 57) throw new Error("Token too short");

    const signingKey = key32.slice(0, 16);
    const encKey = key32.slice(16, 32);

    const mac = bytes.slice(-32);
    const preHmac = bytes.slice(0, -32);

    const hmacKey = await crypto.subtle.importKey(
      "raw", signingKey, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    const valid = await crypto.subtle.verify("HMAC", hmacKey, mac, preHmac);
    if (!valid) throw new Error("Invalid HMAC — message tampered or wrong key");

    const iv = preHmac.slice(9, 25);
    const ciphertext = preHmac.slice(25);

    const aesKey = await crypto.subtle.importKey("raw", encKey, { name: "AES-CBC" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, aesKey, ciphertext);
    return new TextDecoder().decode(plain);
  }

  // ECDH P-256 + HKDF-SHA256 → 32-byte Fernet key
  async function deriveConversationKey(myPrivateKeyJwk, theirPublicKeyJwk) {
    const myPrivateKey = await crypto.subtle.importKey(
      "jwk", myPrivateKeyJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]
    );
    const theirPublicKey = await crypto.subtle.importKey(
      "jwk", theirPublicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, false, []
    );
    const sharedBits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: theirPublicKey }, myPrivateKey, 256
    );

    const hkdfKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveBits"]);
    const fernetBits = await crypto.subtle.deriveBits({
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("talkup-e2e-salt"),
      info: new TextEncoder().encode("talkup-fernet-key"),
    }, hkdfKey, 256);

    return new Uint8Array(fernetBits);
  }

  // PIN → AES-GCM key via PBKDF2
  async function pinToKey(pin, saltBytes) {
    const pinKey = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 300000 },
      pinKey, 256
    );
    return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function encryptPrivateKey(privateKeyJwk, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await pinToKey(pin, salt);
    const data = new TextEncoder().encode(JSON.stringify(privateKeyJwk));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return {
      ct: b64urlEncode(new Uint8Array(ct)),
      salt: b64urlEncode(salt),
      iv: b64urlEncode(iv),
    };
  }

  async function decryptPrivateKey(ctB64, saltB64, ivB64, pin) {
    const key = await pinToKey(pin, b64urlDecode(saltB64));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlDecode(ivB64) },
      key,
      b64urlDecode(ctB64)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // Internal state
  let _privateKeyJwk = null;
  const _keyCache = {};

  // HTTP helpers
  function apiGet(url) {
    return fetch(url, { credentials: "same-origin" }).then(r => r.json());
  }

  function apiPost(url, body) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrf(),
      },
      body: JSON.stringify(body),
    }).then(r => r.json());
  }

  function getCsrf() {
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : "";
  }

  // PIN modal
  function showPinModal(mode, onSubmit) {
    const existing = document.getElementById("e2e-pin-modal");
    if (existing) existing.remove();

    const isSetup = mode === "setup";
    const title = isSetup
      ? "Shifrlash PIN kodi o'rnatish"
      : "PIN kodingizni kiriting";
    const desc = isSetup
      ? "Bu PIN kod xabarlaringizni himoya qiladi. Uni unutmang — tiklash imkoni yo'q."
      : "Xabarlaringizni o'qish uchun PIN kodingizni kiriting.";

    const modal = document.createElement("div");
    modal.id = "e2e-pin-modal";
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);
      display:flex;align-items:center;justify-content:center;
    `;
    modal.innerHTML = `
      <div style="background:#1e293b;border-radius:16px;padding:32px;width:100%;max-width:400px;margin:16px;box-shadow:0 25px 50px rgba(0,0,0,0.5);">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:48px;margin-bottom:12px;">🔐</div>
          <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px;">${title}</h2>
          <p style="color:#94a3b8;font-size:14px;margin:0;">${desc}</p>
        </div>
        <input id="e2e-pin-input" type="password" placeholder="PIN kod (kamida 6 ta belgi)"
          style="width:100%;box-sizing:border-box;padding:14px 16px;border-radius:10px;border:2px solid #334155;
          background:#0f172a;color:#f1f5f9;font-size:16px;outline:none;margin-bottom:8px;"
          autocomplete="off" inputmode="numeric" maxlength="20" />
        ${isSetup ? `
        <input id="e2e-pin-confirm" type="password" placeholder="PIN kodni takrorlang"
          style="width:100%;box-sizing:border-box;padding:14px 16px;border-radius:10px;border:2px solid #334155;
          background:#0f172a;color:#f1f5f9;font-size:16px;outline:none;margin-bottom:8px;"
          autocomplete="off" inputmode="numeric" maxlength="20" />` : ""}
        <div id="e2e-pin-error" style="color:#f87171;font-size:13px;min-height:20px;margin-bottom:12px;text-align:center;"></div>
        <button id="e2e-pin-submit"
          style="width:100%;padding:14px;border-radius:10px;border:none;background:#3b82f6;color:#fff;
          font-size:16px;font-weight:600;cursor:pointer;">
          ${isSetup ? "PIN o'rnatish va kalitlar yaratish" : "Kirish"}
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const input = modal.querySelector("#e2e-pin-input");
    const confirm = modal.querySelector("#e2e-pin-confirm");
    const errorEl = modal.querySelector("#e2e-pin-error");
    const btn = modal.querySelector("#e2e-pin-submit");

    input.focus();

    async function handleSubmit() {
      const pin = input.value;
      errorEl.textContent = "";

      if (pin.length < 6) {
        errorEl.textContent = "PIN kamida 6 ta belgidan iborat bo'lishi kerak.";
        return;
      }

      if (isSetup && confirm && confirm.value !== pin) {
        errorEl.textContent = "PIN kodlar mos kelmadi.";
        return;
      }

      btn.disabled = true;
      btn.textContent = "Yuklanmoqda...";

      const errMsg = await onSubmit(pin);
      if (errMsg) {
        errorEl.textContent = errMsg;
        btn.disabled = false;
        btn.textContent = isSetup ? "PIN o'rnatish va kalitlar yaratish" : "Kirish";
      }
    }

    btn.addEventListener("click", handleSubmit);
    input.addEventListener("keydown", e => { if (e.key === "Enter") handleSubmit(); });
    if (confirm) confirm.addEventListener("keydown", e => { if (e.key === "Enter") handleSubmit(); });
  }

  function hidePinModal() {
    const modal = document.getElementById("e2e-pin-modal");
    if (modal) modal.remove();
  }

  // Public API
  window.E2E = {
    async getConversationKey(partnerId) {
      if (_keyCache[partnerId]) return _keyCache[partnerId];
      const { public_key } = await apiGet(`/api/keys/user/${partnerId}/`);
      if (!public_key) throw new Error("Hamkorning kaliti topilmadi");
      const fernetKey = await deriveConversationKey(_privateKeyJwk, JSON.parse(public_key));
      _keyCache[partnerId] = fernetKey;
      return fernetKey;
    },
    fernetEncrypt,
    fernetDecrypt,
    isReady: () => _privateKeyJwk !== null,
    ready: null,
  };

  window.E2E.ready = new Promise((resolve, reject) => {
    if (!window.E2E_USER_ID) { resolve(); return; }

    const cached = sessionStorage.getItem("e2e_private_key");
    if (cached) {
      try {
        _privateKeyJwk = JSON.parse(cached);
        resolve();
        return;
      } catch (_) { /* fall through to fetch */ }
    }

    apiGet("/api/keys/my-private/").then(keyData => {
      if (!keyData.encrypted_private_key) {
        showPinModal("setup", async (pin) => {
          try {
            const keyPair = await crypto.subtle.generateKey(
              { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
            );
            const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
            const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
            const enc = await encryptPrivateKey(privateKeyJwk, pin);
            await apiPost("/api/keys/setup/", {
              public_key: JSON.stringify(publicKeyJwk),
              encrypted_private_key: JSON.stringify(enc),
            });
            _privateKeyJwk = privateKeyJwk;
            sessionStorage.setItem("e2e_private_key", JSON.stringify(privateKeyJwk));
            hidePinModal();
            resolve();
          } catch (err) {
            console.error("E2E setup error:", err);
            return "Xatolik yuz berdi. Sahifani yangilab qaytadan urinib ko'ring.";
          }
        });
      } else {
        showPinModal("entry", async (pin) => {
          try {
            const enc = JSON.parse(keyData.encrypted_private_key);
            const privateKeyJwk = await decryptPrivateKey(enc.ct, enc.salt, enc.iv, pin);
            _privateKeyJwk = privateKeyJwk;
            sessionStorage.setItem("e2e_private_key", JSON.stringify(privateKeyJwk));
            hidePinModal();
            resolve();
          } catch (_) {
            return "PIN noto'g'ri. Qaytadan kiriting.";
          }
        });
      }
    }).catch(err => {
      console.error("E2E init error:", err);
      reject(err);
    });
  });
})();

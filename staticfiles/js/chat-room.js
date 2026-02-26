lucide?.createIcons?.();

const ME_ID = Number(window.CHAT?.meId);
const receiverId = Number(window.CHAT?.receiverId);

const messagesEl = document.getElementById("messages");
const subStatusEl = document.getElementById("subStatus");
const inputEl = document.getElementById("messageInput");
const formEl = document.getElementById("form");
const scrollBtn = document.getElementById("scrollBottomBtn");
const olderLoader = document.getElementById("olderLoader");

const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");
const emojiGrid = document.getElementById("emojiGrid");
const emojiCloseBtn = document.getElementById("emojiCloseBtn");
const emojiTabs = Array.from(document.querySelectorAll(".emojiTab"));

const replyBar = document.getElementById("replyBar");
const replyNameEl = document.getElementById("replyName");
const replyTextEl = document.getElementById("replyText");
const replyCloseBtn = document.getElementById("replyCloseBtn");

const sendIconWrap = document.getElementById("sendIconWrap");
const sendSpinnerWrap = document.getElementById("sendSpinnerWrap");

let replyToId = null;

let pingInterval = null;
const PING_MS = 30000;

let socket = null;
let typingTimer = null;
let editingMessageId = null;
let typingCooldown = false;
let lastBaseStatus = subStatusEl.textContent || "yaqinda onlayn edi";


let loadingOlder = false;
let hasMoreOlder = true;

let loaderHideTimer = null;
let loaderShowTimer = null;
let loaderShownAt = 0;

const LOADER_DELAY_MS = 120;
const LOADER_MIN_MS = 250;

let pendingSend = null;
let reconnecting = false;

function setSendUi(connected) {
    if (connected) {
        sendSpinnerWrap.classList.add("hidden");
        sendIconWrap.classList.remove("hidden");
    } else {
        sendIconWrap.classList.add("hidden");
        sendSpinnerWrap.classList.remove("hidden");
    }
}

function sendPayload(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
}

function ensureConnectedAndSend(payload) {
    if (sendPayload(payload)) return true;

    pendingSend = payload;

    if (reconnecting) return false;
    reconnecting = true;

    try {
        socket?.close?.();
    } catch {
    }
    socket = null;

    setSubStatus("Ulanmoqda...");
    setSendUi(false);

    connectWs();
    return false;
}

function showOlderLoader() {
    loaderShownAt = 0;

    if (loaderShowTimer) {
        clearTimeout(loaderShowTimer);
        loaderShowTimer = null;
    }

    loaderShowTimer = setTimeout(() => {
        loaderShownAt = Date.now();
        olderLoader.classList.remove("hidden");
    }, LOADER_DELAY_MS);
}

function hideOlderLoader() {
    loadingOlder = false;

    if (loaderShowTimer) {
        clearTimeout(loaderShowTimer);
        loaderShowTimer = null;
    }

    if (loaderHideTimer) {
        clearTimeout(loaderHideTimer);
        loaderHideTimer = null;
    }

    if (!loaderShownAt) {
        olderLoader.classList.add("hidden");
        syncSepVisibility();
        return;
    }

    const elapsed = Date.now() - loaderShownAt;
    const wait = Math.max(0, LOADER_MIN_MS - elapsed);

    loaderHideTimer = setTimeout(() => {
        olderLoader.classList.add("hidden");
        loaderShownAt = 0;
        loaderHideTimer = null;
        syncSepVisibility();
    }, wait);
}

function getTopAnchor() {
    const bubbles = Array.from(messagesEl.querySelectorAll(".bubble[data-id]"));
    if (!bubbles.length) return null;

    const boxTop = messagesEl.getBoundingClientRect().top;

    let best = bubbles[0];
    let bestDist = Infinity;

    for (const b of bubbles) {
        const dist = Math.abs(b.getBoundingClientRect().top - boxTop);
        if (dist < bestDist) {
            bestDist = dist;
            best = b;
        }
    }

    return {id: best.dataset.id, top: best.getBoundingClientRect().top};
}

function restoreTopAnchor(anchor) {
    if (!anchor) return;
    const bubble = messagesEl.querySelector(`.bubble[data-id="${anchor.id}"]`);
    if (!bubble) return;

    const newTop = bubble.getBoundingClientRect().top;
    const diff = newTop - anchor.top;
    messagesEl.scrollTop += diff;
}

function getOldestMessageId() {
    const bubbles = messagesEl.querySelectorAll(".bubble[data-id]");
    let min = null;
    bubbles.forEach(b => {
        const id = Number(b.dataset.id || 0);
        if (!id) return;
        if (min === null || id < min) min = id;
    });
    return min || 0;
}

function buildDateSepNode(label, key) {
    const wrap = document.createElement("div");
    wrap.dataset.sep = "1";
    wrap.dataset.dateKey = key;
    wrap.className = "flex justify-center py-2";
    wrap.innerHTML = `
              <div class="px-3 py-1 rounded-full text-[12px] font-semibold
                          bg-white/80 border border-slate-200 text-slate-500 shadow-sm">
                ${label}
              </div>`;
    return wrap;
}

function buildMessageNode(m) {
    const isMe = Number(m.user_id) === ME_ID;

    const row = document.createElement("div");
    row.className = "msg-row " + (isMe ? "out" : "in");

    const bubble = document.createElement("div");
    bubble.className = "bubble " + (isMe ? "out" : "in");

    if (m.id !== undefined && m.id !== null) bubble.dataset.id = String(m.id);

    const k = dateKeyFromIso(m.created_at);
    if (k) bubble.dataset.dateKey = k;

    if (m.reply_to && m.reply_to.id) {
        const rp = document.createElement("div");
        rp.className = "reply-preview";
        rp.dataset.replyId = String(m.reply_to.id);

        rp.innerHTML = `<div class="r-name"></div><div class="r-text"></div>`;
        rp.querySelector(".r-name").textContent = m.reply_to.user || "Foydalanuvchi";
        rp.querySelector(".r-text").textContent = smartReplyText(m.reply_to.text, m.message);

        rp.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const target = messagesEl.querySelector(`.bubble[data-id="${m.reply_to.id}"]`);
            if (target) target.scrollIntoView({behavior: "smooth", block: "center"});
        });

        bubble.appendChild(rp);
    }

    const text = document.createElement("div");
    text.className = "bubble-text";
    text.textContent = m.message || "";

    const meta = document.createElement("div");
    meta.className = "bubble-meta";

    if (m.is_edited) {
        const ed = document.createElement("span");
        ed.className = "edited-label";
        ed.textContent = "✎";
        ed.style.opacity = "0.75";
        meta.appendChild(ed);
    }

    const timeEl = document.createElement("span");
    timeEl.textContent = formatTime(m.created_at);
    meta.appendChild(timeEl);

    if (isMe) meta.appendChild(makeTicks(!!m.is_read));

    bubble.appendChild(text);
    bubble.appendChild(meta);
    row.appendChild(bubble);
    return row;
}

function normalizeSeparators() {
    const bubbles = Array.from(messagesEl.querySelectorAll(".bubble[data-id]"));
    if (!bubbles.length) return;

    const order = [];
    const firstRowByKey = new Map();

    for (const b of bubbles) {
        const k = b.dataset.dateKey;
        if (!k) continue;
        if (!firstRowByKey.has(k)) {
            firstRowByKey.set(k, b.closest(".msg-row"));
            order.push(k);
        }
    }

    const seen = new Set();
    messagesEl.querySelectorAll('[data-sep="1"][data-date-key]').forEach(sep => {
        const k = sep.dataset.dateKey;
        if (!firstRowByKey.has(k) || seen.has(k)) {
            sep.remove();
        } else {
            seen.add(k);
        }
    });

    for (const k of order) {
        const row = firstRowByKey.get(k);
        if (!row) continue;
        insertDateSeparator(k, row);
    }
}

function prependBatch(msgs) {
    if (!msgs || !msgs.length) return;

    const anchor = getTopAnchor();

    const frag = document.createDocumentFragment();

    msgs.forEach(m => {
        if (m.id && messagesEl.querySelector(`.bubble[data-id="${m.id}"]`)) return;
        frag.appendChild(buildMessageNode(m));
    });

    messagesEl.insertBefore(frag, olderLoader.nextSibling);

    normalizeSeparators();
    restoreTopAnchor(anchor);
}

function isNearBottom() {
    return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 80;
}

function updateScrollButton() {
    if (isNearBottom()) {
        scrollBtn.classList.add("hidden");
    } else {
        scrollBtn.classList.remove("hidden");
    }
}

const LOAD_TRIGGER = 120;

function syncSepVisibility() {
    if (loadingOlder) messagesEl.classList.add("loading-older"); else messagesEl.classList.remove("loading-older");
}

messagesEl.addEventListener("scroll", () => {
    updateScrollButton?.();
    syncSepVisibility();

    if (!hasMoreOlder) return;
    if (loadingOlder) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    if (messagesEl.scrollTop <= LOAD_TRIGGER) {
        loadingOlder = true;
        syncSepVisibility();
        showOlderLoader();

        socket.send(JSON.stringify({
            type: "load_older", before_id: getOldestMessageId(), limit: 50
        }));
    }
});

function scrollToBottomSmooth() {
    messagesEl.scrollTo({top: messagesEl.scrollHeight, behavior: "smooth"});

    requestAnimationFrame(() => {
        messagesEl.scrollTo({top: messagesEl.scrollHeight, behavior: "smooth"});
    });

    setTimeout(() => {
        messagesEl.scrollTo({top: messagesEl.scrollHeight, behavior: "smooth"});
    }, 80);

    scrollBtn.classList.add("hidden");
}

scrollBtn.addEventListener("click", () => {
    messagesEl.scrollTo({
        top: messagesEl.scrollHeight, behavior: "smooth"
    });
});

function setSubStatus(text) {
    subStatusEl.textContent = text;
}

function autoGrowTextarea() {
    inputEl.style.height = "0px";
    inputEl.style.height = inputEl.scrollHeight + "px";
}

function focusInput() {
    setTimeout(() => {
        inputEl.focus();
        const v = inputEl.value || "";
        inputEl.setSelectionRange(v.length, v.length);
        autoGrowTextarea();
    }, 0);
}

function makeTicks(isRead) {
    const wrap = document.createElement("span");
    wrap.className = "ticks";
    wrap.dataset.read = isRead ? "1" : "0";

    wrap.innerHTML = `
        <svg class="c1" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        <svg class="c2" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
      `;
    return wrap;
}

function renderEmptyState() {
    messagesEl.innerHTML = "";
    messagesEl.appendChild(olderLoader);
    olderLoader.classList.add("hidden");

    messagesEl.insertAdjacentHTML("beforeend", `
            <div data-empty class="h-full flex items-center justify-center px-4">
                <div class="text-center max-w-xs w-full">
    
                    <div class="mx-auto w-16 h-16 rounded-2xl
                                bg-slate-100 border border-slate-200
                                flex items-center justify-center mb-5 shadow-sm">
                        <i data-lucide="message-circle" class="w-7 h-7 text-slate-500"></i>
                    </div>
    
                    <div class="text-base font-semibold text-slate-700">
                        Hali xabar yo'q
                    </div>
    
                    <div class="text-sm text-slate-500 mt-1">
                        Suhbatni boshlang va birinchi xabarni yuboring
                    </div>
    
                </div>
            </div>
        `);

    lucide?.createIcons?.();
}

function dateKeyFromIso(iso) {
    if (!iso) return null;

    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    }

    const s = String(iso);
    return s.length >= 10 ? s.slice(0, 10) : null;
}

function formatUzDayMonth(key) {
    const [y, m, d] = key.split("-").map(Number);

    const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];

    const month = months[(m - 1)] || "";
    return `${d} - ${month}`;
}

function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleTimeString("uz-UZ", {
        hour: "2-digit", minute: "2-digit"
    });
}

function insertDateSeparator(key, beforeEl = null) {
    if (!key) return null;

    const exists = messagesEl.querySelector(`[data-sep="1"][data-date-key="${key}"]`);
    if (exists) {
        if (beforeEl && (beforeEl.compareDocumentPosition(exists) & Node.DOCUMENT_POSITION_FOLLOWING)) {
            messagesEl.insertBefore(exists, beforeEl);
        }
        return exists;
    }

    const label = formatUzDayMonth(key);
    const wrap = document.createElement("div");
    wrap.dataset.sep = "1";
    wrap.dataset.dateKey = key;
    wrap.className = "flex justify-center py-2";
    wrap.innerHTML = `
        <div class="px-3 py-1 rounded-full text-[12px] font-semibold
                    bg-white/80 border border-slate-200 text-slate-500 shadow-sm">
          ${label}
        </div>`;

    if (beforeEl) messagesEl.insertBefore(wrap, beforeEl); else messagesEl.appendChild(wrap);

    return wrap;
}

function addMessage({id, message, created_at, user_id, is_read, is_edited, reply_to}, isMe = false) {
    const empty = messagesEl.querySelector("[data-empty]");
    if (empty) empty.remove();

    const key = dateKeyFromIso(created_at);

    const row = document.createElement("div");
    row.className = "msg-row " + (isMe ? "out" : "in");

    const bubble = document.createElement("div");
    bubble.className = "bubble " + (isMe ? "out" : "in");
    if (id !== undefined && id !== null) bubble.dataset.id = String(id);
    if (key) bubble.dataset.dateKey = key;

    if (reply_to && reply_to.id) {
        const rp = document.createElement("div");
        rp.className = "reply-preview";
        rp.dataset.replyId = String(reply_to.id);

        rp.innerHTML = `<div class="r-name"></div><div class="r-text"></div>`;
        rp.querySelector(".r-name").textContent = reply_to.user || "Foydalanuvchi";
        rp.querySelector(".r-text").textContent = smartReplyText(reply_to.text, message);

        rp.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const target = messagesEl.querySelector(`.bubble[data-id="${reply_to.id}"]`);
            if (target) target.scrollIntoView({behavior: "smooth", block: "center"});
        });

        bubble.appendChild(rp);
    }

    const text = document.createElement("div");
    text.className = "bubble-text";
    text.textContent = message || "";

    const meta = document.createElement("div");
    meta.className = "bubble-meta";

    if (is_edited) {
        const ed = document.createElement("span");
        ed.className = "edited-label";
        ed.textContent = "✎";
        ed.style.opacity = "0.75";
        meta.appendChild(ed);
    }

    const timeEl = document.createElement("span");
    timeEl.textContent = formatTime(created_at);
    meta.appendChild(timeEl);

    if (isMe) meta.appendChild(makeTicks(!!is_read));

    bubble.appendChild(text);
    bubble.appendChild(meta);
    row.appendChild(bubble);

    messagesEl.appendChild(row);

    if (key) insertDateSeparator(key, row);

    updateScrollButton();
}

function setTicksReadUpTo(upToId) {
    const upTo = Number(upToId || 0);
    if (!upTo) return;

    document.querySelectorAll(".bubble.out").forEach(b => {
        const mid = Number(b.dataset.id || 0);
        if (mid && mid <= upTo) {
            const t = b.querySelector(".ticks");
            if (t) t.dataset.read = "1";
        }
    });
}

function connectWs() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    if (!receiverId || Number.isNaN(receiverId)) {
        setSubStatus("Ulanmoqda...");
        setSendUi(false);
        return;
    }

    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${scheme}://${location.host}/ws/private/${receiverId}/`;
    socket = new WebSocket(wsUrl);

    setSubStatus("Ulanmoqda...");
    setSendUi(false);

    socket.onopen = () => {
        reconnecting = false;
        setSendUi(true);
        setSubStatus(lastBaseStatus);
        focusInput();

        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }

        pingInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ping: true}));
            }
        }, PING_MS);

        if (pendingSend) {
            const p = pendingSend;
            pendingSend = null;
            sendPayload(p);
        }
    };

    socket.onclose = () => {
        lastBaseStatus = "yaqinda onlayn edi";
        loadingOlder = false;

        hideOlderLoader();
        setSubStatus(lastBaseStatus);

        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }

        socket = null;
        reconnecting = false;
        setSendUi(false);
    };
    socket.onerror = () => {
        loadingOlder = false;

        hideOlderLoader();
        setSubStatus("Ulanmoqda...");

        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }

        try {
            socket?.close?.();
        } catch {
        }
        socket = null;
        reconnecting = false;
        setSendUi(false);
    };

    socket.onmessage = (e) => {
        const data = JSON.parse(e.data);

        if (data.history) {
            messagesEl.innerHTML = "";
            messagesEl.appendChild(olderLoader);
            olderLoader.classList.add("hidden");

            if (!data.messages || !data.messages.length) {
                renderEmptyState();
                return;
            }

            const msgs = (data.messages || []).slice().sort((a, b) => {
                const ta = Date.parse(a.created_at || "") || 0;
                const tb = Date.parse(b.created_at || "") || 0;
                if (ta !== tb) return ta - tb;
                return (Number(a.id) || 0) - (Number(b.id) || 0);
            });

            const frag = document.createDocumentFragment();
            let lastKey = null;

            msgs.forEach(m => {
                const key = dateKeyFromIso(m.created_at);
                if (key && key !== lastKey) {
                    frag.appendChild(buildDateSepNode(formatUzDayMonth(key), key));
                    lastKey = key;
                }
                frag.appendChild(buildMessageNode(m));
            });

            messagesEl.appendChild(frag);
            normalizeSeparators();
            messagesEl.scrollTop = messagesEl.scrollHeight;

            setSubStatus(lastBaseStatus);
            updateScrollButton();
            return;
        }

        if (data.presence) {
            if (Number(data.user_id) === receiverId) {
                lastBaseStatus = data.status || lastBaseStatus;
                setSubStatus(lastBaseStatus);
            }
            return;
        }

        if (data.typing) {
            if (Number(data.user_id) !== receiverId) return;
            setSubStatus("yozmoqda...");
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => setSubStatus(lastBaseStatus), 1000);
            return;
        }

        if (data.type === "chat_read") {
            if (Number(data.reader_id) !== receiverId) return;
            setTicksReadUpTo(data.up_to_id);
            return;
        }

        if (data.type === "chat_edited") {
            const mid = Number(data.message_id || 0);
            if (!mid) return;

            const newText = data.message || "";

            const bubble = document.querySelector(`.bubble[data-id="${mid}"]`);
            if (bubble) {
                const textEl = bubble.querySelector(".bubble-text");
                if (textEl) textEl.textContent = newText;

                const meta = bubble.querySelector(".bubble-meta");
                if (meta) {
                    let ed = meta.querySelector(".edited-label");
                    if (!ed) {
                        ed = document.createElement("span");
                        ed.className = "edited-label";
                        ed.style.opacity = "0.75";
                    }
                    ed.textContent = "✎";

                    const timeEl = meta.querySelector("span");
                    if (timeEl) meta.insertBefore(ed, timeEl); else meta.prepend(ed);
                }
            }

            document.querySelectorAll(`.reply-preview[data-reply-id="${mid}"]`).forEach(rp => {
                const rText = rp.querySelector(".r-text");
                if (!rText) return;

                const parentBubble = rp.closest(".bubble");
                const childText = parentBubble?.querySelector(".bubble-text")?.textContent || "";

                rText.textContent = smartReplyText(newText, childText);
            });

            return;
        }

        if (data.type === "chat_deleted") {
            const mid = Number(data.message_id || 0);
            if (!mid) return;

            document
                .querySelectorAll(`.reply-preview[data-reply-id="${mid}"]`)
                .forEach(rp => rp.remove());

            const bubble = document.querySelector(`.bubble[data-id="${mid}"]`);
            const row = bubble ? bubble.closest(".msg-row") : null;
            if (row) row.remove();

            if (replyToId && Number(replyToId) === mid) {
                closeReply?.();
            }

            return;
        }

        if (data.type === "older_messages") {
            const msgs = (data.messages || []).slice().sort((a, b) => {
                const ta = Date.parse(a.created_at || "") || 0;
                const tb = Date.parse(b.created_at || "") || 0;
                if (ta !== tb) return ta - tb;
                return (Number(a.id) || 0) - (Number(b.id) || 0);
            });

            if (!msgs.length) {
                hasMoreOlder = false;
            } else {
                prependBatch(msgs);
            }

            loadingOlder = false;
            hideOlderLoader();
            return;
        }

        if (data.message) {
            const isMe = Number(data.user_id) === ME_ID;

            const shouldScroll = isMe || isNearBottom();

            addMessage(data, isMe);

            if (shouldScroll) scrollToBottomSmooth();

            return;
        }
    };
}

inputEl.addEventListener("input", () => {
    autoGrowTextarea();
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (typingCooldown) return;
    typingCooldown = true;
    socket.send(JSON.stringify({typing: true}));
    setTimeout(() => (typingCooldown = false), 800);
});

inputEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
        return;
    }

    if (!e.shiftKey) {
        e.preventDefault();
        formEl.requestSubmit();
    }
});

formEl.addEventListener("submit", (e) => {
    e.preventDefault();

    const msg = (inputEl.value || "").trim();
    if (!msg) return;

    const payload = editingMessageId ? {edit: true, message_id: editingMessageId, message: msg} : {
        message: msg, reply_to_id: replyToId || null
    };

    ensureConnectedAndSend(payload);

    if (editingMessageId) {
        editingMessageId = null;
        inputEl.classList.remove("ring-2", "ring-blue-500");
    } else {
        closeReply();
    }

    inputEl.value = "";
    autoGrowTextarea();
    inputEl.focus();
});

const EMOJIS = {
    faces: ["😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "🙂", "🙃", "😍", "😘", "😗", "😙", "😚", "😋", "😛", "😜", "🤪", "😝", "🤗", "🤭", "🤫", "🤔", "😐", "😑", "😶", "🙄", "😏", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "😵", "🤯", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "😤", "😡", "😠", "🤬"],
    hands: ["👋", "🤚", "✋", "🖐️", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🙏", "💪"],
    hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "❤️‍🔥", "❤️‍🩹", "💌", "💋", "🫶", "💍"]
};

let activeTab = "faces";

function setActiveTab(tab) {
    activeTab = tab;
    emojiTabs.forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.className = "emojiTab flex-1 px-3 py-2 rounded-xl text-sm font-semibold " + (isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200");
    });
    renderEmojis();
}

function renderEmojis() {
    emojiGrid.innerHTML = "";
    (EMOJIS[activeTab] || []).forEach(e => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = e;
        btn.className = "w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition";
        btn.onclick = () => {
            inputEl.value += e;
            inputEl.focus();
        };
        emojiGrid.appendChild(btn);
    });
}

function openEmojiPicker() {
    emojiPicker.classList.remove("hidden");
    setActiveTab(activeTab);
}

function closeEmojiPicker() {
    emojiPicker.classList.add("hidden");
}

emojiBtn.onclick = () => emojiPicker.classList.contains("hidden") ? openEmojiPicker() : closeEmojiPicker();
emojiCloseBtn.onclick = closeEmojiPicker;
emojiTabs.forEach(btn => btn.addEventListener("click", () => setActiveTab(btn.dataset.tab)));

document.addEventListener("click", (e) => {
    if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) closeEmojiPicker();
});

const ctxMenu = document.createElement("div");
ctxMenu.className = "ctx-menu";
ctxMenu.innerHTML = `
  <button type="button" class="ctx-item" data-action="reply">
    <i data-lucide="corner-up-left" class="w-4 h-4"></i>
    <span>Javob berish</span>
  </button>

  <div class="ctx-sep" data-sep="always"></div>

  <button type="button" class="ctx-item" data-action="copy">
    <i data-lucide="copy" class="w-4 h-4"></i>
    <span>Nusxalash</span>
  </button>

  <div class="ctx-sep" data-sep="mine"></div>

  <button type="button" class="ctx-item" data-action="edit">
    <i data-lucide="edit-3" class="w-4 h-4"></i>
    <span>Tahrirlash</span>
  </button>

  <div class="ctx-sep" data-sep="mine"></div>

  <button type="button" class="ctx-item danger" data-action="delete">
    <i data-lucide="trash-2" class="w-4 h-4"></i>
    <span>O'chirish</span>
  </button>
`;

document.body.appendChild(ctxMenu);
lucide?.createIcons?.();

let ctxTargetBubble = null;

function hideCtxMenu() {
    ctxMenu.style.display = "none";
    ctxTargetBubble = null;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function showCtxMenu(x, y, bubble) {
    ctxTargetBubble = bubble;

    const msgId = bubble?.dataset?.id ? Number(bubble.dataset.id) : 0;
    const isMine = bubble?.classList?.contains("out");
    const mine = (isMine && msgId);

    const delBtn = ctxMenu.querySelector('[data-action="delete"]');
    const editBtn = ctxMenu.querySelector('[data-action="edit"]');

    delBtn.style.display = mine ? "flex" : "none";
    editBtn.style.display = mine ? "flex" : "none";

    const seps = ctxMenu.querySelectorAll(".ctx-sep");

    if (seps[0]) seps[0].style.display = "block";

    if (seps[1]) seps[1].style.display = mine ? "block" : "none";

    if (seps[2]) seps[2].style.display = mine ? "block" : "none";

    ctxMenu.style.display = "block";

    const rect = ctxMenu.getBoundingClientRect();
    const px = clamp(x, 8, window.innerWidth - rect.width - 8);
    const py = clamp(y, 8, window.innerHeight - rect.height - 8);

    ctxMenu.style.left = px + "px";
    ctxMenu.style.top = py + "px";
}

async function copyText(text) {
    const t = (text || "").trim();
    if (!t) return;
    try {
        await navigator.clipboard.writeText(t);
    } catch {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
        } catch {
        }
        ta.remove();
    }
}

function requestDelete(messageId) {
    if (!messageId) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({delete: true, message_id: Number(messageId)}));
}

ctxMenu.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !ctxTargetBubble) return;

    const action = btn.dataset.action;
    const text = ctxTargetBubble.querySelector(".bubble-text")?.textContent || "";
    const messageId = Number(ctxTargetBubble.dataset.id || 0);

    if (action === "reply") {
        const messageId = Number(ctxTargetBubble.dataset.id || 0);
        if (!messageId) return;

        const user = ctxTargetBubble.classList.contains("out") ? "Siz" : (document.querySelector("h1")?.textContent?.trim() || "Foydalanuvchi");
        const text = ctxTargetBubble.querySelector(".bubble-text")?.textContent || "";

        openReply({id: messageId, user, text});
        hideCtxMenu();
        return;
    }

    if (action === "copy") {
        await copyText(text);
        hideCtxMenu();
        return;
    }

    if (action === "edit") {
        const messageId = Number(ctxTargetBubble.dataset.id || 0);
        const isMine = ctxTargetBubble.classList.contains("out");
        if (!isMine || !messageId) return;

        closeReply?.();
        replyToId = null;

        const text = ctxTargetBubble.querySelector(".bubble-text")?.textContent || "";
        editingMessageId = messageId;

        inputEl.value = text;
        autoGrowTextarea();
        inputEl.focus();
        inputEl.classList.add("ring-2", "ring-blue-500");

        hideCtxMenu();
        return;
    }

    if (action === "delete") {
        requestDelete(messageId);
        hideCtxMenu();
        return;
    }
});

document.addEventListener("click", (e) => {
    if (!ctxMenu.contains(e.target)) hideCtxMenu();
});

window.addEventListener("resize", hideCtxMenu);
window.addEventListener("scroll", hideCtxMenu, true);

function findBubbleFromEventTarget(t) {
    const bubble = t.closest?.(".bubble");
    if (!bubble) return null;
    if (!bubble.dataset.id) return null;
    return bubble;
}

messagesEl.addEventListener("contextmenu", (e) => {
    const bubble = findBubbleFromEventTarget(e.target);
    if (!bubble) return;
    e.preventDefault();
    showCtxMenu(e.clientX, e.clientY, bubble);
});

let lpTimer = null;
let lpStart = null;
const LONG_PRESS_MS = 420;
const MOVE_CANCEL_PX = 12;

messagesEl.addEventListener("touchstart", (e) => {
    const bubble = findBubbleFromEventTarget(e.target);
    if (!bubble) return;

    if (lpTimer) clearTimeout(lpTimer);
    const t = e.touches[0];
    lpStart = {x: t.clientX, y: t.clientY, bubble};

    lpTimer = setTimeout(() => {
        showCtxMenu(lpStart.x, lpStart.y, lpStart.bubble);
    }, LONG_PRESS_MS);
}, {passive: true});

messagesEl.addEventListener("touchmove", (e) => {
    if (!lpStart || !lpTimer) return;
    const t = e.touches[0];
    const dx = t.clientX - lpStart.x;
    const dy = t.clientY - lpStart.y;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        clearTimeout(lpTimer);
        lpTimer = null;
    }
}, {passive: true});

messagesEl.addEventListener("touchend", () => {
    if (lpTimer) clearTimeout(lpTimer);
    lpTimer = null;
    lpStart = null;
}, {passive: true});

function setRealVh() {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--vh", (h * 0.01) + "px");
}

setRealVh();
window.addEventListener("resize", setRealVh);
window.addEventListener("orientationchange", setRealVh);

if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setRealVh);
    window.visualViewport.addEventListener("scroll", setRealVh);
}

function smartReplyText(text, mainMessage) {
    const clean = (text || "").replace(/\s+/g, " ").trim();

    if (!mainMessage) return clean;

    if (mainMessage.length > 60) {
        return clean.length > 28 ? clean.slice(0, 28) + "..." : clean;
    }

    return clean;
}

function clipOneLine(s, max = 28) {
    const t = (s || "").replace(/\s+/g, " ").trim();
    return t.length > max ? (t.slice(0, max - 1) + "…") : t;
}

function openReply(reply) {
    if (!reply || !reply.id) return;
    replyToId = Number(reply.id);

    replyNameEl.textContent = reply.user || "Foydalanuvchi";
    replyTextEl.textContent = clipOneLine(reply.text || "");
    replyBar.classList.remove("hidden");

    lucide?.createIcons?.();
    focusInput();
}

function closeReply() {
    replyToId = null;
    replyBar.classList.add("hidden");
    replyNameEl.textContent = "";
    replyTextEl.textContent = "";
}

replyCloseBtn?.addEventListener("click", closeReply);

connectWs();
syncSepVisibility();
updateScrollButton();
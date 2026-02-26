(function bootToasts() {
    const run = () => {
        const msgs = window.__DJANGO_MESSAGES__ || [];
        msgs.forEach(m => showToast(m.text, m.tags));
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", run);
    } else {
        run();
    }
})();

function showToast(text, tags = "") {
    injectToastStyles();

    const type = resolveType(tags);
    const {icon, tone} = toastMeta(type);

    const container = getToastContainer();

    const toast = document.createElement("div");
    toast.className = `toast ${tone}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    const DURATION = 3200;

    toast.innerHTML = `
    <div class="toast__icon">
      <i data-lucide="${icon}"></i>
    </div>

    <div class="toast__body">
      <div class="toast__text">${escapeHtml(text)}</div>
    </div>

    <button class="toast__close" type="button" aria-label="Close">
      <i data-lucide="x"></i>
    </button>

    <div class="toast__bar" style="--toast-duration:${DURATION}ms"></div>
  `;

    container.appendChild(toast);
    lucide?.createIcons?.();

    requestAnimationFrame(() => toast.classList.add("toast--in"));

    const closeBtn = toast.querySelector(".toast__close");
    const bar = toast.querySelector(".toast__bar");

    let timer = null;
    let remaining = DURATION;
    let start = performance.now();
    let paused = false;

    const remove = () => {
        toast.classList.remove("toast--in");
        toast.classList.add("toast--out");
        clearTimeout(timer);
        setTimeout(() => toast.remove(), 260);
    };

    const startTimer = () => {
        paused = false;
        start = performance.now();

        bar.style.animation = "none";
        void bar.offsetHeight;
        bar.style.animation = `toastBar linear ${remaining}ms forwards`;

        clearTimeout(timer);
        timer = setTimeout(remove, remaining);
    };

    const pauseTimer = () => {
        if (paused) return;
        paused = true;

        const elapsed = performance.now() - start;
        remaining = Math.max(0, remaining - elapsed);

        clearTimeout(timer);

        const computed = getComputedStyle(bar);
        const matrix = computed.transform; // matrix(...) or none
        bar.style.animation = "none";
        bar.style.transform = matrix === "none" ? "scaleX(1)" : matrix;
    };

    closeBtn.addEventListener("click", remove);

    toast.addEventListener("mouseenter", pauseTimer);
    toast.addEventListener("mouseleave", startTimer);

    const onKey = (e) => {
        if (e.key === "Escape") {
            remove();
            document.removeEventListener("keydown", onKey);
        }
    };
    document.addEventListener("keydown", onKey);

    startTimer();
}

// --- Helpers ---
function resolveType(tags = "") {
    const t = (tags || "").toLowerCase();
    if (t.includes("error") || t.includes("danger")) return "error";
    if (t.includes("warning")) return "warning";
    if (t.includes("info")) return "info";
    return "success";
}

function toastMeta(type) {
    switch (type) {
        case "error":
            return {icon: "alert-triangle", tone: "toast--error"};
        case "warning":
            return {icon: "alert-circle", tone: "toast--warning"};
        case "info":
            return {icon: "info", tone: "toast--info"};
        default:
            return {icon: "check-circle-2", tone: "toast--success"};
    }
}

function getToastContainer() {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    return container;
}

function injectToastStyles() {
    if (document.getElementById("toast-styles")) return;

    const style = document.createElement("style");
    style.id = "toast-styles";
    style.textContent = `
/* container: mobile top-center, desktop top-right */
.toast-container{
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  gap: .75rem;
  pointer-events: none;
}

@media (max-width: 640px){
  .toast-container{
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: min(92vw, 420px);
  }
}

/* toast card */
.toast{
  pointer-events: auto;
  width: min(380px, 92vw);
  border-radius: 1.25rem;
  border: 1px solid rgba(0,0,0,.08);
  background: rgba(255,255,255,.9);
  backdrop-filter: blur(10px);
  box-shadow: 0 18px 40px rgba(0,0,0,.12);
  overflow: hidden;

  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  gap: .5rem;
  padding: .85rem .9rem;

  opacity: 0;
  transform: translateX(28px) scale(.98);
  transition: transform .28s ease, opacity .28s ease;
}

.toast--in{
  opacity: 1;
  transform: translateX(0) scale(1);
}

/* slide-out */
.toast--out{
  opacity: 0;
  transform: translateX(28px) scale(.98);
}

/* icon */
.toast__icon{
  width: 36px; height: 36px;
  border-radius: 14px;
  display: grid;
  place-items: center;
}

/* text */
.toast__body{ padding-top: 0rem; }
.toast__text{
  font-size: .9rem;
  font-weight: 650;
  line-height: 1.35rem;
  color: rgba(15,23,42,0.92); /* slate-900-ish */
  word-break: break-word;
}

/* close */
.toast__close{
  width: 36px; height: 36px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(15,23,42,0.75);
  transition: background .15s ease, color .15s ease;
}
.toast__close:hover{
  background: rgba(255,255,255,.55);
  color: rgba(15,23,42,0.95);
}

/* progress bar */
.toast__bar{
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  transform-origin: left;
  transform: scaleX(1);
  opacity: .55;
}

/* tones */
.toast--success{ border-color: rgba(16,185,129,.25); }
.toast--success .toast__icon{ background: rgba(16,185,129,.12); color: rgb(16,185,129); }
.toast--success .toast__bar{ background: rgb(16,185,129); }

.toast--error{ border-color: rgba(244,63,94,.25); }
.toast--error .toast__icon{ background: rgba(244,63,94,.12); color: rgb(244,63,94); }
.toast--error .toast__bar{ background: rgb(244,63,94); }

.toast--warning{ border-color: rgba(245,158,11,.25); }
.toast--warning .toast__icon{ background: rgba(245,158,11,.14); color: rgb(245,158,11); }
.toast--warning .toast__bar{ background: rgb(245,158,11); }

.toast--info{ border-color: rgba(59,130,246,.25); }
.toast--info .toast__icon{ background: rgba(59,130,246,.12); color: rgb(59,130,246); }
.toast--info .toast__bar{ background: rgb(59,130,246); }

@keyframes toastBar{
  from{ transform: scaleX(1); }
  to{ transform: scaleX(0); }
}
  `;
    document.head.appendChild(style);
}

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
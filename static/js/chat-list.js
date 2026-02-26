lucide?.createIcons?.();

const search = document.getElementById("search");
const clearBtn = document.getElementById("clearSearch");
const box = document.getElementById("searchBox");
const resultsEl = document.getElementById("searchResults");

const profileBtn = document.getElementById("profileBtn");
const profileModal = document.getElementById("profileModal");
const profileClose = document.getElementById("profileClose");
const profileOk = document.getElementById("profileOk");

let timer = null;

const profileViewBox = document.getElementById("profileViewBox");
const profileEditBox = document.getElementById("profileEditBox");

const profileEditBtnInModal = document.getElementById("profileEditBtnInModal");
const profileEditCancel = document.getElementById("profileEditCancel");

(() => {
    const avatarInput = document.getElementById("avatarInput");
    const avatarPickBtn = document.getElementById("avatarPickBtn");
    const avatarClearBtn = document.getElementById("avatarClearBtn");
    const avatarPreview = document.getElementById("avatarPreview");
    const avatarFallback = document.getElementById("avatarFallback");

    const cropModal = document.getElementById("cropModal");
    const cropImage = document.getElementById("cropImage");
    const cropPreview = document.getElementById("cropPreview");

    const cropClose = document.getElementById("cropClose");
    const cropCancel = document.getElementById("cropCancel");
    const cropApply = document.getElementById("cropApply");

    const resetCropBtn = document.getElementById("resetCrop");

    if (!avatarInput || !cropModal || !cropImage) return;

    let cropper = null;
    let originalFileName = "avatar.png";
    let currentBlobUrl = null;
    let hasNewAvatar = false;

    const isBlobUrl = (s) => typeof s === "string" && s.startsWith("blob:");
    const serverPreviewSrc = avatarPreview?.getAttribute("src") || "";

    function setEnabled(ok) {
        [resetCropBtn, cropApply].forEach((b) => {
            if (!b) return;
            b.disabled = !ok;
            b.classList.toggle("opacity-50", !ok);
            b.classList.toggle("cursor-not-allowed", !ok);
        });
    }

    function openModal() {
        cropModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
        setEnabled(false);
        lucide?.createIcons?.();
    }

    function destroy() {
        setEnabled(false);
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
        cropImage.onload = null;
        cropImage.onerror = null;
        cropImage.src = "";
        if (cropPreview) cropPreview.src = "";
    }

    function closeModal() {
        cropModal.classList.add("hidden");
        document.body.style.overflow = "";
        destroy();
    }

    avatarPickBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        avatarInput.click();
    });

    avatarClearBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!hasNewAvatar) return;

        avatarInput.value = "";
        hasNewAvatar = false;

        if (avatarPreview) {
            const old = avatarPreview.src || "";
            if (isBlobUrl(old)) URL.revokeObjectURL(old);

            if (serverPreviewSrc) {
                avatarPreview.src = serverPreviewSrc;
                avatarPreview.classList.remove("hidden");
                avatarFallback?.classList.add("hidden");
            } else {
                avatarPreview.classList.add("hidden");
                avatarFallback?.classList.remove("hidden");
            }
        }

        avatarClearBtn.disabled = true;
        avatarClearBtn.classList.add("opacity-50", "cursor-not-allowed");
    });

    avatarInput.addEventListener("change", () => {
        const file = avatarInput.files?.[0];
        if (!file) return;

        originalFileName = file.name || "avatar.png";

        destroy();
        currentBlobUrl = URL.createObjectURL(file);

        cropImage.onload = async () => {
            try {
                await cropImage.decode();
            } catch {
            }

            cropper = new Cropper(cropImage, {
                viewMode: 1, aspectRatio: 1, autoCropArea: 0.85,

                dragMode: "move", movable: true, zoomable: true,

                cropBoxMovable: true, cropBoxResizable: true,

                toggleDragModeOnDblclick: false,

                guides: true, center: true, highlight: false, background: false, responsive: true,

                ready() {
                    requestAnimationFrame(() => {
                        setEnabled(true);

                        const container = cropModal.querySelector(".cropper-container");
                        if (!container) return;

                        const onDown = (e) => {
                            const inCropBox = !!e.target.closest(".cropper-crop-box");
                            cropper.setDragMode(inCropBox ? "crop" : "move");
                        };

                        container.addEventListener("pointerdown", onDown, true);
                        container.addEventListener("mousedown", onDown, true);
                    });
                }
            });
        };

        cropImage.onerror = () => closeModal();

        openModal();
        cropImage.src = currentBlobUrl;
    });

    cropClose?.addEventListener("click", (e) => {
        e.preventDefault();
        closeModal();
    });
    cropCancel?.addEventListener("click", (e) => {
        e.preventDefault();
        closeModal();
    });

    cropModal.addEventListener("click", (e) => {
        if (e.target === cropModal) closeModal();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !cropModal.classList.contains("hidden")) closeModal();
    });

    resetCropBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        cropper?.reset();
    });

    cropApply?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!cropper) return;

        const size = 512;

        const square = cropper.getCroppedCanvas({width: size, height: size});

        const circle = document.createElement("canvas");
        circle.width = size;
        circle.height = size;
        const ctx = circle.getContext("2d");

        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(square, 0, 0);
        ctx.restore();

        circle.toBlob((blob) => {
            if (!blob) return;

            const base = originalFileName.replace(/\.\w+$/, "");
            const file = new File([blob], base + ".png", {type: "image/png", lastModified: Date.now()});

            const dt = new DataTransfer();
            dt.items.add(file);
            avatarInput.files = dt.files;

            if (avatarPreview) {
                const old = avatarPreview.src || "";
                if (isBlobUrl(old)) URL.revokeObjectURL(old);

                const url = URL.createObjectURL(file);
                avatarPreview.src = url;
                avatarPreview.classList.remove("hidden");
                avatarFallback?.classList.add("hidden");
            }

            hasNewAvatar = true;
            if (avatarClearBtn) {
                avatarClearBtn.disabled = false;
                avatarClearBtn.classList.remove("opacity-50", "cursor-not-allowed");
            }

            closeModal();
        }, "image/png");
    });
})();

(() => {
    const menu = document.getElementById("chatCtxMenu");
    const verifyBtnText = document.getElementById("verifyBtnText");
    const form = document.getElementById("chatDeleteForm");
    if (!menu || !form) return;

    function updateVerifyText(row) {
        if (!verifyBtnText || !row) return;

        const isVerified = row.dataset.verified === "1";
        verifyBtnText.textContent = isVerified ? "Bekor qilish" : "Tasdiqlash";
    }

    let currentRow = null;
    let longPressTimer = null;
    let longPressFired = false;

    function hideMenu() {
        menu.classList.add("hidden");
        currentRow = null;
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    function showMenuAt(x, y, row) {
        currentRow = row;
        menu.classList.remove("hidden");

        updateVerifyText(row);

        lucide?.createIcons?.();

        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const left = clamp(x, 8, vw - rect.width - 8);
        const top = clamp(y, 8, vh - rect.height - 8);

        menu.style.left = left + "px";
        menu.style.top = top + "px";
    }

    document.addEventListener("contextmenu", (e) => {
        const row = e.target.closest(".user-row");
        if (!row) return;
        e.preventDefault();
        showMenuAt(e.clientX, e.clientY, row);
    });

    document.addEventListener("pointerdown", (e) => {
        const row = e.target.closest(".user-row");
        if (!row) return;
        if (e.pointerType === "mouse") return;

        longPressFired = false;
        clearTimeout(longPressTimer);

        longPressTimer = setTimeout(() => {
            longPressFired = true;
            showMenuAt(e.clientX || (window.innerWidth / 2), e.clientY || 80, row);
            navigator.vibrate?.(10);
        }, 550);
    }, {passive: true});

    document.addEventListener("pointerup", () => clearTimeout(longPressTimer));
    document.addEventListener("pointermove", () => clearTimeout(longPressTimer));

    document.addEventListener("click", (e) => {
        const row = e.target.closest(".user-row");
        if (row && longPressFired) {
            e.preventDefault();
            longPressFired = false;
            return;
        }
        if (!menu.classList.contains("hidden") && !e.target.closest("#chatCtxMenu")) hideMenu();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideMenu();
    });

    menu.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn || !currentRow) return;

        const action = btn.dataset.action;
        const href = currentRow.getAttribute("href");
        const delUrl = currentRow.dataset.deleteUrl;

        if (action === "open") {
            window.location.href = href;
            return;
        }

        if (action === "verify") {
            const row = currentRow;
            const verifyUrl = row?.dataset.verifyUrl;
            if (!verifyUrl) return;

            hideMenu();

            const csrf = form.querySelector('[name=csrfmiddlewaretoken]')?.value;

            fetch(verifyUrl, {
                method: "POST", headers: {
                    "X-CSRFToken": csrf,
                },
            })
                .then(res => {
                    if (!res.ok) throw new Error();
                    return res.json();
                })
                .then(data => {
                    row.dataset.verified = data.is_verified ? "1" : "0";
                    location.reload();
                })
                .catch(() => {
                });

            return;
        }

        if (action === "delete") {
            hideMenu();
            if (!delUrl) return;
            form.action = delUrl;
            form.submit();
        }
    });

    window.addEventListener("scroll", hideMenu, {passive: true});
    window.addEventListener("resize", hideMenu);
})();

function openProfileEdit() {
    profileViewBox?.classList.add("hidden");
    profileEditBox?.classList.remove("hidden");
    lucide?.createIcons?.();
}

function closeProfileEdit() {
    profileEditBox?.classList.add("hidden");
    profileViewBox?.classList.remove("hidden");
    lucide?.createIcons?.();
}

function openProfile() {
    profileModal?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    lucide?.createIcons?.();
}

function closeProfile() {
    profileModal?.classList.add("hidden");
    document.body.style.overflow = "";

    profileEditBox?.classList.add("hidden");
    profileViewBox?.classList.remove("hidden");
}

profileBtn?.addEventListener("click", openProfile);
profileClose?.addEventListener("click", closeProfile);
profileOk?.addEventListener("click", closeProfile);

profileEditBtnInModal?.addEventListener("click", openProfileEdit);
profileEditCancel?.addEventListener("click", closeProfileEdit);

profileModal?.addEventListener("click", (e) => {
    if (e.target === profileModal || e.target === profileModal.firstElementChild) closeProfile();
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && profileModal && !profileModal.classList.contains("hidden")) closeProfile();
});

function renderResults(items) {
    if (!items.length) {
        resultsEl.innerHTML = `<div class="p-4 text-sm text-slate-500">Foydalanuvchi topilmadi.</div>`;
        return;
    }

    resultsEl.innerHTML = items.map(u => `
      <a href="/chats/${u.username}/"
         class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition">
        <div class="min-w-0">
          <div class="flex items-center gap-1 min-w-0">
            <div class="truncate font-medium text-slate-900">${u.name}</div>
            ${u.is_verified ? `
              <svg class="w-[14px] h-[14px] shrink-0 block" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#3390EC"></circle>
                <path d="M8 12.5L10.2 14.7L16 9"
                      stroke="white" stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"></path>
              </svg>` : ``}
          </div>
          <div class="text-xs text-slate-500 truncate">@${u.username}</div>
        </div>
        ${u.online ? `<span class="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">onlayn</span>` : ``}
      </a>
    `).join("");
}

async function doSearch(q) {
    try {
        const res = await fetch(`/search/?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        renderResults(data.results || []);
        box.classList.remove("hidden");
    } catch (err) {
        resultsEl.innerHTML = `<div class="p-4 text-sm text-rose-600">Search error: ${err.message}</div>`;
        box.classList.remove("hidden");
    }
}

search?.addEventListener("input", () => {
    const q = search.value.trim();

    clearBtn?.classList.toggle("hidden", !search.value.length);

    clearTimeout(timer);

    if (q.length < 2) {
        box?.classList.add("hidden");
        return;
    }

    timer = setTimeout(() => doSearch(q), 250);
});

document.addEventListener("click", (e) => {
    if (box && search && !box.contains(e.target) && e.target !== search) {
        box.classList.add("hidden");
    }
});

clearBtn?.addEventListener("click", () => {
    if (!search) return;
    search.value = "";
    box?.classList.add("hidden");
    clearBtn.classList.add("hidden");
    search.focus();
});
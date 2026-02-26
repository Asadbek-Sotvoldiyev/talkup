document.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('keydown', (e) => {
    const key = e.key?.toLowerCase();

    if (e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    if (e.ctrlKey && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    if (e.ctrlKey && key === 'u') {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }

    if (e.metaKey && e.altKey && (key === 'i' || key === 'j')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
}, true);
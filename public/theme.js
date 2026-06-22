/* Shared theme logic for sub-pages */
(function () {
    var saved = localStorage.getItem('theme');
    /* Default: light. Only go dark if user explicitly saved 'dark'. */
    if (saved === 'dark') {
        document.documentElement.classList.add('dark-mode-pre');
    } else {
        document.body && document.body.classList.add('light-mode');
    }
})();

document.addEventListener('DOMContentLoaded', function () {
    var saved = localStorage.getItem('theme');
    if (saved !== 'dark') document.body.classList.add('light-mode');
    updateThemeIcon();
});

function toggleTheme() {
    var isLight = document.body.classList.contains('light-mode');
    if (isLight) {
        document.body.classList.remove('light-mode');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
    }
    updateThemeIcon();
}

function updateThemeIcon() {
    var isLight = document.body.classList.contains('light-mode');
    var moon = document.getElementById('themeIconMoon');
    var sun  = document.getElementById('themeIconSun');
    if (moon) moon.style.display = isLight ? 'none' : '';
    if (sun)  sun.style.display  = isLight ? '' : 'none';
}

/* ==================================================
   Abrilcita - router.js
   Navegación SPA entre pantallas
   ================================================== */

const ROUTER = (function () {
    let currentPage = 'perfil';
    const pages = ['perfil', 'vacunas', 'desparasitacion', 'alimentacion', 'historial'];

    function init() {
        const nav = document.getElementById('mainNav');
        nav.addEventListener('click', function (e) {
            if (e.target.tagName !== 'BUTTON') return;
            const dest = e.target.dataset.page;
            navigate(dest);
        });

        // Manejar hash para deep-linking (ej: #/vacunas)
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#/', '');
            if (pages.includes(hash)) navigate(hash, true);
        });

        // Navegación inicial desde hash
        const initial = window.location.hash.replace('#/', '');
        if (pages.includes(initial)) {
            navigate(initial, true);
        }
    }

    function navigate(pageName, fromHash = false) {
        if (!pages.includes(pageName)) return;

        // Actualizar páginas visibles
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(pageName).classList.add('active');

        // Actualizar botones nav
        document.querySelectorAll('.nav-bar button').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.nav-bar button[data-page="${pageName}"]`);
        if (btn) btn.classList.add('active');

        currentPage = pageName;

        // Actualizar hash (sin re-disparar navegación)
        if (!fromHash && window.location.hash !== '#/' + pageName) {
            history.replaceState(null, '', '#/' + pageName);
        }

        // Disparar evento de render para la App
        document.dispatchEvent(new CustomEvent('route:change', { detail: { page: pageName } }));
    }

    function getCurrent() {
        return currentPage;
    }

    return { init, navigate, getCurrent };
})();

window.ROUTER = ROUTER;

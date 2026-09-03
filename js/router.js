/* ==================================================
   Abrilcita - router.js
   Navegación SPA entre pantallas
   ================================================== */

const ROUTER = (function () {
    let currentPage = 'inicio';
    const pages = ['inicio', 'vacunas', 'desparasitacion', 'alimentacion', 'controles', 'historial'];

    function init() {
        const nav = document.getElementById('mainNav');
        nav.addEventListener('click', function (e) {
            const btn = e.target.closest('button');
            if (!btn || !btn.dataset.page) return;
            navigate(btn.dataset.page);
        });

        // Animación de entrada en la carga inicial (página inicio activa por defecto)
        const initial = window.location.hash.replace('#/', '');
        const firstPage = pages.includes(initial) ? initial : 'inicio';
        const fp = document.getElementById(firstPage);
        if (fp) { fp.classList.add('active'); fp.classList.add('animating'); }

        // Manejar hash para deep-linking (ej: #/vacunas)
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#/', '');
            if (pages.includes(hash)) navigate(hash, true);
        });

        // Navegación inicial desde hash
        if (pages.includes(initial)) {
            navigate(initial, true);
        }
    }

    function navigate(pageName, fromHash = false) {
        if (!pages.includes(pageName)) return;

        // Actualizar páginas visibles
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(pageName);
        target.classList.add('active');
        // Reiniciar animación de entrada en cada navegación (fuera de .page param animación con reflow)
        target.classList.remove('animating');
        void target.offsetWidth; // forzar reflow
        target.classList.add('animating');

        // Actualizar botones nav
        document.querySelectorAll('.navtabs button').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.navtabs button[data-page="${pageName}"]`);
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

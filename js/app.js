/* ==================================================
   Abrilcita - app.js
   Lógica principal de la aplicación (controllers)
   ================================================== */

const APP = (function () {
    // ============ UTILIDADES ============
    function $(id) { return document.getElementById(id); }
    function val(id) { const el = $(id); return el ? el.value.trim() : ''; }
    function setVal(id, value) { const el = $(id); if (el && value !== undefined && value !== null) el.value = value; }
    function clearForm(ids) { ids.forEach(id => { const el = $(id); if (el) el.value = ''; }); }
    function fmtDate(d) { if (!d) return '—'; const p = String(d).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; }
    function money(n) { return n ? '$' + Number(n).toLocaleString('es-CL') + ' CLP' : '—'; }

    function toast(msg, type = 'success') {
        let box = $('toast');
        if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
        const t = document.createElement('div');
        t.className = 'toast ' + type;
        t.textContent = msg;
        box.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    function refreshIcons() {
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            try { lucide.createIcons(); } catch (e) {}
        }
    }

    // ---------- DINAMISMO: animaciones & feedback en vivo ----------

    // Anima un número desde 0 hasta el valor en el elemento dado
    function animateValue(el, to, opts = {}) {
        if (!el) return;
        const { suffix = '', duration = 600, decimals = 0 } = opts;
        const target = parseFloat(to) || 0;
        el.textContent = '0' + suffix;
        const start = performance.now();
        function step(now) {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
            let v = (target * eased).toFixed(decimals);
            if (decimals === 0) v = String(Math.round(target * eased));
            el.textContent = v + suffix;
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    // Agrega aparición escalonada a filas/items de una lista
    function staggerRows(container, selector = 'tr') {
        const rows = container ? container.querySelectorAll(selector) : [];
        rows.forEach((row, i) => {
            row.classList.remove('stagger-in');
            row.style.animationDelay = (i * 45) + 'ms';
            // Re-trigger animation
            void row.offsetWidth;
            row.classList.add('stagger-in');
        });
    }

    // Destello/pulso temporal sobre un elemento para "avisar" actualización
    function pulse(el) {
        if (!el) return;
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
    }

    // Estado de guardado en un botón (spinner + deshabilitado)
    function using(btn) {
        if (!btn) return { end: function () {} };
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Guardando…';
        return {
            end() { btn.disabled = false; btn.innerHTML = orig; }
        };
    }

    // Sincroniza el estado del elemento con su error en vivo
    function setFieldError(input, message) {
        if (!input) return;
        const wrap = input.parentNode;
        let errEl = wrap.querySelector('.field-error');
        if (message) {
            input.classList.add('invalid');
            if (!errEl) {
                errEl = document.createElement('small');
                errEl.className = 'field-error';
                wrap.appendChild(errEl);
            }
            errEl.textContent = message;
            errEl.style.animation = 'none';
            void errEl.offsetWidth;
            errEl.style.animation = '';
        } else {
            input.classList.remove('invalid');
            if (errEl) errEl.remove();
        }
    }

    // Vincula validación en vivo a un formulario: revalida todo el form en cada 'input'
    // y muestra errores por campo al instante.
    function bindLiveValidation(formId, prefix, validator, fields) {
        const inputs = fields.map(k => $((prefix === 'p' ? 'p' : prefix) + k)).filter(Boolean);
        const collect = () => {
            const data = {};
            fields.forEach(k => data[k] = val((prefix === 'p' ? 'p' : prefix) + k));
            return data;
        };
        const apply = () => {
            const errors = validator(collect());
            fields.forEach(k => {
                const el = $((prefix === 'p' ? 'p' : prefix) + k);
                if (el) setFieldError(el, errors[k] || '');
            });
        };
        inputs.forEach(inp => {
            inp.addEventListener('input', apply);
            inp.addEventListener('change', apply);
        });
    }

    // Contador de caracteres en vivo sobre una textarea
    function bindCharCount(id, max) {
        const ta = $(id);
        if (!ta || ta.dataset.charCount === '1') return;
        ta.dataset.charCount = '1';
        const counter = document.createElement('small');
        counter.className = 'char-count';
        ta.insertAdjacentElement('afterend', counter);
        function update() {
            const n = ta.value.length;
            counter.textContent = n + ' / ' + max;
            counter.classList.toggle('over', n > max);
        }
        ta.addEventListener('input', update);
        update();
    }

    function calcAge(birth) {
        if (!birth) return '—';
        const b = new Date(birth), now = new Date();
        let y = now.getFullYear() - b.getFullYear(), m = now.getMonth() - b.getMonth();
        if (m < 0) { y--; m += 12; }
        return y > 0 ? y + ' año' + (y > 1 ? 's' : '') + (m > 0 ? ' ' + m + ' mes' + (m > 1 ? 'es' : '') : '') : (m + ' mes' + (m > 1 ? 'es' : ''));
    }

    // ============ INIT ============
    async function init() {
        // Cargar foto desde DB
        try {
            const db = await DB.get();
            applyPhotoUI(db.profile && db.profile.photo ? db.profile.photo : '', 'navAvatar');
            renderHome();
            renderDietStats();
            refreshIcons();
        } catch (e) {
            console.error('Init DB error', e);
        }

        // Configurar foto upload
        $('catPhoto').addEventListener('change', handlePhotoUpload);

        // Dinamismo: validación en vivo + contador de caracteres
        bindLiveValidation('formP', 'p', VALIDATORS.validateProfile, ['name','birth','breed','weight','rut','vetPhone','vet','color']);
        bindLiveValidation('formVax', 'vax', VALIDATORS.validateVaccine, ['type','date','next','cost','lot','lab','vet','notes']);
        bindLiveValidation('formDesp', 'desp', VALIDATORS.validateDeworming, ['type','date','next','product','dose','weight','cost']);
        bindLiveValidation('formFC', 'foodChange', VALIDATORS.validateFoodChange, ['date','desc']);
        bindLiveValidation('formNote', 'note', VALIDATORS.validateNote, ['date','title']);
        bindCharCount('foodNotes', 300);
        bindCharCount('foodChangeReason', 300);
        bindCharCount('noteDesc', 300);
        bindCharCount('despNotes', 300);
        bindCharCount('vaxNotes', 300);
        bindCharCount('cResult', 300);
        bindCharCount('medInst', 200);

        // Configurar router de navegación
        ROUTER.init();

        // Listener de cambio de ruta
        document.addEventListener('route:change', (e) => {
            const page = e.detail.page;
            if (page === 'inicio') { renderHome(); renderDietStats(); }
            if (page === 'vacunas') renderAllVaccines();
            if (page === 'desparasitacion') renderAllDeworming();
            if (page === 'alimentacion') { loadFoodForm(); renderDietStats(); renderWeightChart(); renderMealSchedule(); renderFoodHistory(); }
            if (page === 'controles') { renderVisits(); renderMedications(); }
            if (page === 'historial') renderHistory();
            refreshIcons();
        });
    }

    // ============ FOTO ============
    function applyPhotoUI(photo, navAvatarId) {
        const box = $('catAvatar') ? $('catAvatar').closest('.pet-photo') : null;
        if ($('catAvatar')) {
            if (photo) {
                $('catAvatar').innerHTML = '<img src="' + photo + '">';
                if (box) box.classList.remove('no-photo'); box.classList.add('has-photo');
            } else {
                $('catAvatar').innerHTML = '<i data-lucide="cat"></i><span class="pet-fallback-text">Haz clic para subir foto</span>';
                if (box) box.classList.add('no-photo'); box.classList.remove('has-photo');
            }
        }
        if (navAvatarId && $(navAvatarId)) {
            if (photo) { $(navAvatarId).innerHTML = '<img src="' + photo + '">'; }
            else { $(navAvatarId).innerHTML = '<i data-lucide="cat"></i>'; }
        }
        refreshIcons();
    }

    function handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast('Debes seleccionar una imagen.', 'error'); return; }
        const reader = new FileReader();
        reader.onload = async function (ev) {
            const db = await DB.get();
            db.profile.photo = ev.target.result;
            await DB.save(db);
            applyPhotoUI(ev.target.result, 'navAvatar');
            toast('Foto actualizada.');
        };
        reader.readAsDataURL(file);
    }

    // ============ PERFIL ============
    async function saveProfile() {
        const data = {
            name: val('pName'), birth: val('pBirth'), breed: val('pBreed'),
            weight: val('pWeight'), sex: val('pSex'), color: val('pColor'),
            vet: val('pVet'), vetPhone: val('pVetPhone'), rut: val('pRut')
        };
        const errors = VALIDATORS.validateProfile(data);
        VALIDATORS.markFields('p', errors);

        if (VALIDATORS.hasErrors(errors)) { toast('Corrige los campos marcados.', 'error'); return; }

        const db = await DB.get();
        // Conservar foto anterior
        data.photo = db.profile.photo || '';
        db.profile = data;

        // Registrar peso automáticamente
        if (data.weight) {
            if (!db.weights) db.weights = [];
            const today = new Date().toISOString().slice(0, 10);
            const last = db.weights[db.weights.length - 1];
            if (!last || last.w !== data.weight || last.d !== today) {
                db.weights.push({ id: DB.genId(), d: today, w: data.weight });
            }
        }
        await DB.save(db);
        renderHome();
        toast('Perfil guardado correctamente.');
    }

    // ---------- INICIO / HOME DASHBOARD ----------
    function renderHome() {
        DB.get().then(db => {
            const p = db.profile || {};
            // Brand + pet overview
            if ($('brandName')) $('brandName').textContent = p.name || 'Abrilcita';
            const navAvatar = $('navAvatar');
            if (navAvatar) navAvatar.innerHTML = p.photo ? '<img src="' + p.photo + '" alt="' + esc(p.name || '') + '">' : '<img src="assets/logo.svg" alt="Logo">';
            if ($('homeName')) $('homeName').textContent = p.name || 'Sin nombre';
            if ($('homeAge')) $('homeAge').textContent = calcAge(p.birth);
            if ($('homeWeight')) $('homeWeight').textContent = (p.weight ? p.weight + ' kg' : '—');
            // Pre-cargar formulario de perfil
            setVal('pName', p.name); setVal('pBirth', p.birth); setVal('pBreed', p.breed);
            setVal('pWeight', p.weight); setVal('pSex', p.sex); setVal('pColor', p.color);
            setVal('pVet', p.vet); setVal('pVetPhone', p.vetPhone); setVal('pRut', p.rut);

            // Health status
            const total = (db.vaccines || []).length + (db.deworming || []).length + (db.controls || []).length;
            const hs = $('homeHealth');
            if (hs) { hs.textContent = total > 0 ? 'Excelente' : 'Sin datos'; hs.className = 'status ' + (total > 0 ? 'status-ok' : 'status-pend'); }
            const vaxOk = statusOf(db.vaccines);
            const despOk = statusOf(db.deworming);
            const vaxS = $('homeVaxStatus'), despS = $('homeDespStatus');
            if (vaxS) { vaxS.textContent = vaxOk === 'none' ? 'Sin registros' : (vaxOk ? 'Al día' : 'Un vencimiento'); vaxS.className = 'status ' + (vaxOk === 'none' ? 'status-pend' : (vaxOk ? 'status-ok' : 'status-danger')); }
            if (despS) { despS.textContent = despOk === 'none' ? 'Sin registros' : (despOk ? 'Al día' : 'Pendiente'); despS.className = 'status ' + (despOk === 'none' ? 'status-pend' : (despOk ? 'status-ok' : 'status-danger')); }

            // KPIs protagonistas
            fillKpis(db);

            // Gráfico de peso del home
            renderHomeWeightChart(db);

            // Upcoming alerts
            renderAlerts(db);
        });
    }

    function fillKpis(db) {
        const p = db.profile || {};
        const w = $('kpiWeight'); if (w) w.textContent = (p.weight ? p.weight + ' kg' : '—');
        const a = $('kpiAge'); if (a) a.textContent = calcAge(p.birth);

        // Micro-tendencia del peso en el hero (comparación con el último registro)
        const wt = $('kpiWeightTrend');
        if (wt) {
            const wl = (db.weights || []).slice().sort((x, y) => String(x.d).localeCompare(String(y.d)));
            if (wl.length >= 2) {
                const prev = parseFloat(wl[wl.length - 2].w), last = parseFloat(wl[wl.length - 1].w);
                const diff = last - prev;
                const sign = diff > 0 ? '+' : (diff < 0 ? '' : '');
                const arrow = diff > 0 ? '&#9650;' : (diff < 0 ? '&#9660;' : '&#9679;');
                const cls = diff > 0 ? 'hero-trend-up' : (diff < 0 ? 'hero-trend-down' : 'hero-trend-flat');
                wt.innerHTML = '<span class="' + cls + '">' + arrow + ' ' + sign + diff.toFixed(1) + ' kg vs anterior</span>';
            } else if (wl.length === 1) {
                wt.innerHTML = '<span class="hero-trend-flat">&#9679; Primer registro</span>';
            } else {
                wt.textContent = 'Último registrado';
            }
        }

        const nextVax = nextExpiry(db.vaccines);
        const nv = $('kpiNextVax'), nvs = $('kpiNextVaxSub');
        if (nv) { nv.textContent = nextVax ? fmtDate(nextVax) : '—'; if (nvs) nvs.textContent = nextVax ? (new Date(nextVax) < new Date() ? 'vencida' : 'próximo refuerzo') : 'sin refuerzos'; }

        const nextDesp = nextExpiry(db.deworming);
        const nd = $('kpiNextDesp'), nds = $('kpiNextDespSub');
        if (nd) { nd.textContent = nextDesp ? fmtDate(nextDesp) : '—'; if (nds) nds.textContent = nextDesp ? (new Date(nextDesp) < new Date() ? 'vencida' : 'próxima aplicación') : 'sin datos'; }
    }

    // Devuelve la fecha 'next' más próxima (o la más antigua vencida) o null
    function nextExpiry(arr) {
        const a = (arr || []).filter(x => x.next);
        if (!a.length) return null;
        const sorted = a.map(x => x.next).sort((x, y) => String(x).localeCompare(y));
        const today = new Date().toISOString().slice(0, 10);
        const upcoming = sorted.find(d => d >= today);
        return upcoming || sorted[0];
    }

    // Llena los 4 KPIs de una colección (vacunas/desparasitación) dado un prefijo de ids
    function fillCollectionKpis(arr, prefix) {
        const list = arr || [];
        const overdue = list.filter(x => x.next && new Date(x.next) < new Date()).length;
        const ok = list.length - overdue;
        const next = nextExpiry(list);
        const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        set(prefix + 'Total', list.length);
        set(prefix + 'Ok', ok);
        set(prefix + 'Overdue', overdue);
        set(prefix + 'Next', next ? fmtDate(next) : '—');
    }

    // true=al día, false=algo vencido, 'none'=sin datos
    function statusOf(arr) {
        const a = arr || [];
        if (!a.length) return 'none';
        return !a.some(x => x.next && new Date(x.next) < new Date());
    }

    let _homeWeightChart = null;
    function renderHomeWeightChart(db) {
        const el = $('homeWeightChart');
        const weights = db.weights || [];
        const listed = weights.slice(-12);
        const cur = (db.profile && db.profile.weight) ? parseFloat(db.profile.weight) : (listed.length ? parseFloat(listed[listed.length-1].w) : null);
        if ($('homeWeightCard')) $('homeWeightCard').textContent = cur ? cur + ' kg' : '—';
        if ($('homeWeightCount')) $('homeWeightCount').textContent = weights.length + (weights.length === 1 ? ' registro' : ' registros');
        const badge = $('homeTrendBadge');
        if (badge) {
            if (listed.length >= 2) {
                const first = parseFloat(listed[0].w), last = parseFloat(listed[listed.length-1].w);
                if (last > first) { badge.textContent = 'Subiendo'; badge.className = 'status status-warn'; }
                else if (last < first) { badge.textContent = 'Bajando'; badge.className = 'status status-danger'; }
                else { badge.textContent = 'Estable'; badge.className = 'status status-ok'; }
            } else { badge.textContent = 'Estable'; badge.className = 'status status-ok'; }
        }
        if (_homeWeightChart) { _homeWeightChart.destroy(); _homeWeightChart = null; }
        if (!el || !weights.length) return;
        const labels = listed.map(w => { const d = new Date(w.d + 'T12:00:00'); return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); });
        const data = listed.map(w => parseFloat(w.w));
        _homeWeightChart = new Chart(el, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Peso (kg)', data, borderColor: '#12A594', backgroundColor: 'rgba(18,165,148,0.18)', fill: true, tension: 0.35, pointBackgroundColor: '#12A594', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 3, pointHoverRadius: 5 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1B2A4A', titleColor: '#E6F7F5', bodyColor: '#fff', cornerRadius: 8, padding: 10 } },
                scales: { y: { beginAtZero: false, grid: { color: '#F3F4F6' }, ticks: { color: '#9CA3AF' } }, x: { grid: { display: false }, ticks: { color: '#9CA3AF' } } }
            }
        });
    }

    function renderAlerts(db) {
        const el = $('homeAlerts');
        if (!el) return;
        const alerts = [];
        (db.vaccines || []).forEach(v => { if (v.next) alerts.push({ date: v.next, title: 'Vacuna: ' + (v.type || ''), kind: 'vacuna' }); });
        (db.deworming || []).forEach(d => { if (d.next) alerts.push({ date: d.next, title: 'Desparasitación', kind: 'desp' }); });
        alerts.sort((a, b) => String(a.date).localeCompare(b.date));
        if (!alerts.length) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="bell"></i></div><div class="empty-title">Sin alertas</div><div class="empty-text">Los próximos vencimientos aparecerán aquí.</div></div>';
            refreshIcons(); return;
        }
        const icons = { vacuna: 'syringe', desp: 'droplet' };
        el.innerHTML = alerts.slice(0, 5).map((a, i) =>
            '<div class="alert-item' + (i === 0 ? ' highlight' : '') + '">' +
            '<div class="al-icon"><i data-lucide="' + icons[a.kind] + '"></i></div>' +
            '<div class="al-body"><div class="al-title">' + esc(a.title) + '</div><div class="al-date">Vence el ' + fmtDate(a.date) + '</div></div>' +
            '</div>'
        ).join('');
        refreshIcons();
    }

    function toggleProfileEdit() {
        const card = $('profileEditCard');
        if (!card) return;
        const show = card.style.display === 'none';
        card.style.display = show ? 'block' : 'none';
        if (show) renderHome();
        refreshIcons();
        if (show) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------- ALIMENTACIÓN: minitarjetas + alertas ----------
    function renderDietStats() {
        DB.get().then(db => {
            const f = db.food || {};
            const timesMap = { '1': '1 vez/día', '2': '2 veces/día', '3': '3 veces/día', 'libre': 'Libre' };
            if ($('dietBrand')) $('dietBrand').textContent = f.brand || '—';
            if ($('dietType')) $('dietType').textContent = f.type || '—';
            if ($('dietAmount')) $('dietAmount').textContent = f.amount || '—';
            if ($('dietTimes')) $('dietTimes').textContent = timesMap[f.times] || '—';
            // restricciones: tags dinámicos según lo guardado
            const restCont = $('dietRestrictions');
            if (restCont) {
                const list = String(f.restrictions || '').split(',').map(s => s.trim()).filter(Boolean);
                if (list.length) {
                    restCont.innerHTML = list.map(t => '<span class="tag">' + esc(t) + '</span>').join('');
                } else {
                    restCont.innerHTML = '<span class="restriction-empty">Sin alergias ni requisitos especiales</span>';
                }
                refreshIcons();
            }
        });
    }

    function toggleDietEdit() {
        const card = $('dietEditCard');
        if (!card) return;
        const show = card.style.display === 'none';
        card.style.display = show ? 'block' : 'none';
        if (show) loadFoodForm();
        refreshIcons();
    }

    // ---------- CONTROLES / VISITAS ----------
    function newVisit() {
        const form = $('visitForm');
        if (!form) return;
        form.style.display = 'block';
        refreshIcons();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function quickAdd() {
        ROUTER.navigate('controles');
        const form = $('visitForm');
        if (form) { form.style.display = 'block'; refreshIcons(); }
        const first = form ? form.querySelector('input, select, textarea') : null;
        if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); first.focus(); }
    }

    async function saveControl() {
        const data = {
            date: val('cDate'), type: val('cType'), reason: val('cReason'),
            clinic: val('cClinic'), weight: val('cWeight'), cost: val('cCost'), result: val('cResult')
        };
        if (!data.date || !data.type) { toast('Completa fecha y tipo de control.', 'error'); return; }
        const db = await DB.get();
        db.controls.push({ id: DB.genId(), vetName: data.clinic, ...data });
        await DB.save(db);
        clearForm(['cDate', 'cType', 'cReason', 'cClinic', 'cWeight', 'cCost', 'cResult']);
        document.getElementById('visitForm').style.display = 'none';
        // registrar peso del control
        if (data.weight) {
            db.weights = db.weights || [];
            const today = new Date().toISOString().slice(0, 10);
            db.weights.push({ id: DB.genId(), d: data.date || today, w: data.weight });
            await DB.save(db);
        }
        renderVisits();
        renderHome();
        toast('Visita registrada.');
    }

    function renderVisits() {
        DB.get().then(db => {
            const el = $('visitsTimeline');
            if (!el) return;
            const visits = (db.controls || []).slice().sort((a, b) => String(b.date).localeCompare(a.date));
            if (!visits.length) {
                el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="stethoscope"></i></div><div class="empty-title">Sin visitas registradas</div><div class="empty-text">Registra el primer control veterinario de Abrilcita.</div></div>';
                refreshIcons(); return;
            }
            el.innerHTML = visits.map(v =>
                '<div class="tl-item"><div class="tl-card">' +
                '<div class="tl-date">' + fmtDate(v.date) + '</div>' +
                '<div class="tl-reason">' + esc(v.type + (v.reason ? ' · ' + v.reason : '')) + '</div>' +
                '<div class="tl-clinic"><i data-lucide="building-2"></i> ' + esc(v.clinic || v.vetName || 'Clínica') + '</div>' +
                (v.result ? '<div style="font-size:var(--fs-sm);color:var(--gray-700)">' + esc(v.result) + '</div>' : '') +
                '<button class="btn btn-link btn-sm" onclick="APP.delControl(\'' + v.id + '\')" style="margin-top:var(--sp-2)">Eliminar visita</button>' +
                '</div></div>'
            ).join('');
            refreshIcons();
        });
    }

    async function delControl(id) {
        if (!confirm('¿Eliminar esta visita?')) return;
        const db = await DB.get();
        db.controls = db.controls.filter(c => c.id !== id);
        await DB.save(db);
        renderVisits();
        renderHome();
        toast('Visita eliminada.');
    }

    // ---------- MEDICACIÓN ----------
    function renderMedications() {
        DB.get().then(db => {
            const el = $('medList');
            if (!el) return;
            const meds = db.medications || [];
            if (!meds.length) {
                el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="pill"></i></div><div class="empty-title">Sin medicación activa</div><div class="empty-text">Los medicamentos que agregues aparecerán aquí.</div></div>';
                refreshIcons(); return;
            }
            el.innerHTML = meds.map(m =>
                '<div class="info-item">' +
                '<div class="ii-icon"><i data-lucide="pill"></i></div>' +
                '<div class="ii-body"><div class="ii-value">' + esc(m.name) + '</div><div class="ii-label">' + esc(m.dose || '') + (m.inst ? ' · ' + esc(m.inst) : '') + '</div></div>' +
                '<div class="ii-badge" style="display:flex;gap:6px"><button class="btn btn-link btn-sm" onclick="APP.delMedication(\'' + m.id + '\')">Quitar</button></div>' +
                '</div>'
            ).join('');
            refreshIcons();
        });
    }

    async function addMedication() {
        const name = val('medName'), dose = val('medDose'), inst = val('medInst');
        if (!name) { toast('Indica el nombre del medicamento.', 'error'); return; }
        const db = await DB.get();
        if (!db.medications) db.medications = [];
        db.medications.push({ id: DB.genId(), name, dose, inst });
        await DB.save(db);
        clearForm(['medName', 'medDose', 'medInst']);
        renderMedications();
        toast('Medicamento añadido.');
    }

    async function delMedication(id) {
        const db = await DB.get();
        db.medications = (db.medications || []).filter(m => m.id !== id);
        await DB.save(db);
        renderMedications();
        toast('Medicamento eliminado.');
    }

    // ============ VACUNAS ============
    async function saveVaccine() {
        const data = {
            type: val('vaxType'), date: val('vaxDate'), lot: val('vaxLot'),
            lab: val('vaxLab'), vet: val('vaxVet'), next: val('vaxNext'),
            cost: val('vaxCost'), notes: val('vaxNotes')
        };
        const errors = VALIDATORS.validateVaccine(data);
        if (VALIDATORS.hasErrors(errors)) { toast('Corrige los campos.', 'error'); return; }

        const db = await DB.get();
        db.vaccines.push({ id: DB.genId(), ...data });
        await DB.save(db);
        clearForm(['vaxType', 'vaxDate', 'vaxLot', 'vaxLab', 'vaxVet', 'vaxNext', 'vaxCost', 'vaxNotes']);
        renderAllVaccines();
        toast('Vacuna registrada.');
    }

    function renderCalendar() {
        DB.get().then(db => {
            const now = new Date(), y = now.getFullYear(), m = now.getMonth();
            const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
            const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
            const vaxDates = (db.vaccines || []).map(v => parseInt(String(v.date).split('-')[2]));
            const despDates = (db.deworming || []).map(d => parseInt(String(d.date).split('-')[2]));
            let h = '<div class="calendar"><div class="calendar-header"><h4>' + months[m] + ' ' + y + '</h4></div><div class="calendar-grid">';
            ['Do','Lu','Ma','Mi','Ju','Vi','Sa'].forEach(d => h += '<div class="day-name">' + d + '</div>');
            for (let i = 0; i < first; i++) h += '<div class="day empty"></div>';
            for (let d = 1; d <= days; d++) {
                let cls = d === now.getDate() ? 'day today' : 'day';
                const hasVax = vaxDates.includes(d), hasDesp = despDates.includes(d);
                const dots = (hasVax ? '<span style="background:var(--teal-bright)"></span>' : '') + (hasDesp ? '<span style="background:var(--warning)"></span>' : '');
                h += '<div class="' + cls + '" title="' + (hasVax ? 'Vacuna' : '') + (hasVax && hasDesp ? ' · ' : '') + (hasDesp ? 'Desparasitación' : '') + '">' + d + (dots ? '<span class="ev-dot">' + dots + '</span>' : '') + '</div>';
            }
            h += '</div></div>';
            $('calendarWidget').innerHTML = h;
        });
    }

    async function renderAllVaccines() {
        const db = await DB.get();
        fillCollectionKpis(db.vaccines, 'vaxKpi');
        const el = $('vaxBody');
        renderCalendar();
        if (!(db.vaccines || []).length) { el.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><i data-lucide="syringe"></i></div><div class="empty-title">Sin vacunas registradas</div><div class="empty-text">Agrega la primera vacuna para empezar el carnet.</div><button class="btn btn-primary" onclick="APP.focusField(\'vaxType\')">Registrar vacuna</button></div></td></tr>'; refreshIcons(); renderVaccineCard(); return; }
        el.innerHTML = db.vaccines.map(vx => {
            const past = vx.next && new Date(vx.next) < new Date();
            const st = past ? '<span class="status status-danger"><i data-lucide="alert-triangle"></i> Vencido</span>' : (vx.next ? '<span class="status status-ok"><i data-lucide="check-circle-2"></i> Al día</span>' : '<span class="status status-pend"><i data-lucide="clock"></i> Sin ref.</span>');
            return '<tr><td><input type="checkbox" class="checkbox" checked></td><td><strong>' + esc(vx.type) + '</strong></td><td>' + fmtDate(vx.date) + '</td><td>' + (vx.next ? fmtDate(vx.next) : '—') + '</td><td>' + st + '</td><td><button class="btn btn-danger btn-sm" onclick="APP.delVaccine(\'' + vx.id + '\')">✕</button></td></tr>';
        }).join('');
        refreshIcons();
        renderVaccineCard(db);
        refreshIcons();
    }

    async function delVaccine(id) {
        if (!confirm('¿Eliminar esta vacuna?')) return;
        const db = await DB.get();
        db.vaccines = db.vaccines.filter(v => v.id !== id);
        await DB.save(db);
        renderAllVaccines();
        toast('Vacuna eliminada.');
    }

    async function renderVaccineCard(db) {
        if (!db) db = await DB.get();
        const el = $('vaccineCard'); const p = db.profile || {}; const vs = db.vaccines || [];
        if (!vs.length && !p.name) { el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="syringe"></i></div><div class="empty-title">Carnet de vacunas</div><div class="empty-text">Registra la primera vacuna para ver el carnet.</div></div>'; refreshIcons(); return; }
        let h = '<div class="vaccine-card">';
        h += '<div class="vc-logo"><i data-lucide="heart-pulse" style="width:40px;height:40px;color:var(--teal-dark)"></i></div>';
        h += '<div style="font-weight:800;font-size:1rem;margin:0.3rem 0;color:var(--gray-900)">' + esc(p.name || '—') + '</div>';
        h += '<div style="font-size:0.75rem;color:var(--gray-500)">' + (p.breed || '') + (p.sex ? ' · ' + p.sex : '') + (p.weight ? ' · ' + p.weight + ' kg' : '') + '</div>';
        if (p.rut) h += '<div style="font-size:0.7rem;color:var(--gray-500)">ID: ' + esc(p.rut) + '</div>';
        if (vs.length) {
            h += '<table style="width:100%;margin-top:0.8rem;font-size:0.75rem;border-collapse:collapse">';
            h += '<tr style="background:var(--teal);color:white"><th style="padding:0.3rem;text-align:left">Vacuna</th><th style="padding:0.3rem;text-align:left">Fecha</th><th style="padding:0.3rem;text-align:left">Estado</th></tr>';
            vs.forEach(vx => {
                const past = vx.next && new Date(vx.next) < new Date();
                const st = past ? 'VENCIDO' : (vx.next ? 'OK' : 'SIN REF.');
                h += '<tr><td style="padding:0.3rem;border-bottom:1px solid var(--gray-200);font-size:0.8rem;text-align:left"><strong>' + esc(vx.type) + '</strong></td><td style="padding:0.3rem;border-bottom:1px solid var(--gray-200);font-size:0.8rem">' + fmtDate(vx.date) + '</td><td style="padding:0.3rem;border-bottom:1px solid var(--gray-200)"><span class="status ' + (past ? 'status-danger' : 'status-ok') + '">' + st + '</span></td></tr>';
            });
            h += '</table>';
        }
        h += '<div style="margin-top:0.5rem;font-size:0.7rem;color:var(--gray-500)">Generado por Abrilcita · ' + new Date().toLocaleDateString('es-CL') + '</div></div>';
        el.innerHTML = h;
    }

    // ============ DESPARASITACION ============
    async function saveDeworming() {
        const data = {
            type: val('despType'), date: val('despDate'), product: val('despProduct'),
            dose: val('despDose'), weight: val('despWeight'), next: val('despNext'),
            vet: val('despVet'), cost: val('despCost'), notes: val('despNotes')
        };
        const errors = VALIDATORS.validateDeworming(data);
        if (VALIDATORS.hasErrors(errors)) { toast('Corrige los campos.', 'error'); return; }

        const db = await DB.get();
        db.deworming.push({ id: DB.genId(), ...data });
        await DB.save(db);
        clearForm(['despType', 'despDate', 'despProduct', 'despDose', 'despWeight', 'despNext', 'despVet', 'despCost', 'despNotes']);
        renderAllDeworming();
        toast('Registro guardado.');
    }

    async function renderAllDeworming() {
        const db = await DB.get();
        fillCollectionKpis(db.deworming, 'despKpi');
        const el = $('despBody');
        if (!el) return;
        if (!(db.deworming || []).length) { el.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><i data-lucide="droplet"></i></div><div class="empty-title">Sin registros de desparasitación</div><div class="empty-text">Registra la primera aplicación para controlar parásitos.</div><button class="btn btn-primary" onclick="APP.focusField(\'despType\')">Registrar</button></div></td></tr>'; refreshIcons(); return; }
        el.innerHTML = db.deworming.map(dw => {
            const icon = dw.type === 'Externa' ? 'droplet' : (dw.type === 'Ambas' ? 'shield' : 'syringe');
            return '<tr><td><div style="display:flex;align-items:center;gap:8px"><i data-lucide="' + icon + '" style="width:16px;height:16px;color:var(--teal)"></i> ' + esc(dw.type) + '</div></td><td>' + fmtDate(dw.date) + '</td><td><strong>' + esc(dw.product || '—') + '</strong></td><td>' + esc(dw.dose || '—') + '</td><td>' + (dw.next ? fmtDate(dw.next) : '—') + '</td><td><button class="btn btn-danger btn-sm" onclick="APP.delDeworming(\'' + dw.id + '\')">✕</button></td></tr>';
        }).join('');
        refreshIcons();
    }

    async function delDeworming(id) {
        if (!confirm('¿Eliminar este registro?')) return;
        const db = await DB.get();
        db.deworming = db.deworming.filter(d => d.id !== id);
        await DB.save(db);
        renderAllDeworming();
        toast('Registro eliminado.');
    }

    // ============ ALIMENTACION ============
    async function saveFood() {
        const restrictions = collectRestrictions();
        const data = {
            type: val('foodType'), brand: val('foodBrand'), amount: val('foodAmount'),
            cost: val('foodCost'), notes: val('foodNotes'), supplements: val('foodSupplements'),
            treats: val('foodTreats'), restrictions,
            time1: val('foodTime1'), time2: val('foodTime2'), time3: val('foodTime3'), times: val('foodTimes')
        };
        const errors = VALIDATORS.validateFood(data);
        if (VALIDATORS.hasErrors(errors)) { toast('Corrige los campos.', 'error'); return; }

        const db = await DB.get();
        db.food = data;
        await DB.save(db);
        renderMealSchedule();
        renderDietStats();
        renderHome();
        toast('Alimentación guardada.');
    }

    function collectRestrictions() {
        const labels = [];
        const rows = [['drNoPoll', 'Sin pollo'], ['drNoLact', 'Sin lactosa'], ['drNoGranos', 'Sin granos'], ['drHighProt', 'Alta en proteínas']];
        rows.forEach(([id, label]) => { const el = $(id); if (el && el.checked) labels.push(label); });
        return labels.join(', ');
    }

    function loadFoodForm() {
        DB.get().then(db => {
            const f = db.food || {};
            setVal('foodType', f.type); setVal('foodBrand', f.brand); setVal('foodAmount', f.amount);
            setVal('foodCost', f.cost); setVal('foodNotes', f.notes); setVal('foodSupplements', f.supplements);
            setVal('foodTreats', f.treats); setVal('foodRestrictions', f.restrictions);
            setVal('foodTime1', f.time1); setVal('foodTime2', f.time2);
            setVal('foodTime3', f.time3); setVal('foodTimes', f.times);
            // checkboxes de restricciones según lo guardado
            const set = new Set(String(f.restrictions || '').split(',').map(s => s.trim().toLowerCase()));
            const map = { 'sin pollo': 'drNoPoll', 'sin lactosa': 'drNoLact', 'sin granos': 'drNoGranos', 'alta en proteinas': 'drHighProt' };
            Object.keys(map).forEach(k => { const el = $(map[k]); if (el) el.checked = set.has(k); });
        });
    }

    let _weightChart = null;
    async function renderWeightChart() {
        const db = await DB.get();
        const el = $('weightChart');
        if (!el) return;
        const weights = db.weights || [];
        const listed = weights.slice(-12);
        const cur = (db.profile && db.profile.weight) ? parseFloat(db.profile.weight) : (listed.length ? parseFloat(listed[listed.length-1].w) : null);
        if ($('chartWeight')) $('chartWeight').textContent = cur ? cur + ' kg' : '—';
        // Tendencia
        const trend = $('chartTrend');
        if (trend) {
            if (listed.length >= 2) {
                const first = parseFloat(listed[0].w), last = parseFloat(listed[listed.length-1].w);
                if (last > first) { trend.textContent = 'Subiendo'; trend.className = 'status status-warn'; }
                else if (last < first) { trend.textContent = 'Bajando'; trend.className = 'status status-danger'; }
                else { trend.textContent = 'Estable'; trend.className = 'status status-ok'; }
            } else { trend.textContent = 'Estable'; trend.className = 'status status-ok'; }
        }
        if (_weightChart) { _weightChart.destroy(); _weightChart = null; }
        if (!weights.length) {
            const box = $('weightChartBox');
            if (box) {
                box.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="line-chart"></i></div><div class="empty-title">Sin registros de peso</div><div class="empty-text">Registra un control o edita el perfil para empezar la evolución.</div><button class="btn btn-primary" onclick="APP.focusField(\'pWeight\')">Registrar peso</button></div>';
                refreshIcons();
            }
            return;
        }
        const labels = listed.map(w => { const d = new Date(w.d + 'T12:00:00'); return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); });
        const data = listed.map(w => parseFloat(w.w));
        _weightChart = new Chart(el, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Peso (kg)', data,
                    borderColor: '#12A594', backgroundColor: 'rgba(18,165,148,0.18)',
                    fill: true, tension: 0.35,
                    pointBackgroundColor: '#12A594', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false },
                    tooltip: { backgroundColor: '#1B2A4A', titleColor: '#E6F7F5', bodyColor: '#fff', cornerRadius: 8, padding: 10 } },
                scales: {
                    y: { beginAtZero: false, grid: { color: '#F3F4F6' }, ticks: { color: '#9CA3AF' } },
                    x: { grid: { display: false }, ticks: { color: '#9CA3AF' } }
                }
            }
        });
    }

    function renderMealSchedule() {
        DB.get().then(db => {
            const f = db.food || {};
            [['meal1time', f.time1], ['meal2time', f.time2], ['meal3time', f.time3]].forEach(([id, t]) => {
                const el = $(id); if (el) el.textContent = t || '--:--';
            });
        });
    }

    async function saveFoodChange() {
        const data = { date: val('foodChangeDate'), desc: val('foodChangeDesc'), reason: val('foodChangeReason') };
        const errors = VALIDATORS.validateFoodChange(data);
        if (VALIDATORS.hasErrors(errors)) { toast('Completa fecha y descripción.', 'error'); return; }
        const db = await DB.get();
        if (!db.foodChanges) db.foodChanges = [];
        db.foodChanges.push({ id: DB.genId(), ...data });
        await DB.save(db);
        clearForm(['foodChangeDate', 'foodChangeDesc', 'foodChangeReason']);
        renderFoodHistory();
        toast('Cambio registrado.');
    }

    async function renderFoodHistory() {
        const db = await DB.get();
        const el = $('foodHistory'); const ch = db.foodChanges || [];
        if (!ch.length) {
            el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="history"></i></div><div class="empty-title">Sin cambios registrados</div><div class="empty-text">Registra un cambio de alimentación para llevarle el historial.</div></div>';
            refreshIcons(); return;
        }
        el.innerHTML = '<div class="info-list">' + ch.sort((a, b) => String(b.date).localeCompare(a.date)).map(c =>
            '<div class="info-item">' +
            '<div class="ii-icon"><i data-lucide="utensils-crossed"></i></div>' +
            '<div class="ii-body"><div class="ii-value">' + esc(c.desc) + '</div><div class="ii-label">' + fmtDate(c.date) + (c.reason ? ' · ' + esc(c.reason) : '') + '</div></div>' +
            '<div class="ii-badge"><button class="btn btn-link btn-sm" onclick="APP.delFoodChange(\'' + c.id + '\')" title="Eliminar">Quitar</button></div>' +
            '</div>'
        ).join('') + '</div>';
        refreshIcons();
    }

    async function delFoodChange(id) {
        if (!confirm('¿Eliminar este cambio?')) return;
        const db = await DB.get();
        db.foodChanges = (db.foodChanges || []).filter(c => c.id !== id);
        await DB.save(db);
        renderFoodHistory();
        toast('Cambio eliminado.');
    }

    // ============ HISTORIAL ============
    async function saveNote() {
        const data = { date: val('noteDate'), title: val('noteTitle'), desc: val('noteDesc') };
        const errors = VALIDATORS.validateNote(data);
        if (VALIDATORS.hasErrors(errors)) { toast('Completa fecha y título.', 'error'); return; }
        const db = await DB.get();
        db.notes.push({ id: DB.genId(), ...data });
        await DB.save(db);
        clearForm(['noteDate', 'noteTitle', 'noteDesc']);
        renderHistory();
        toast('Nota guardada.');
    }

    async function renderHistory() {
        const db = await DB.get();
        const el = $('historyBody'); const items = [];
        const fVax = $('fVax').checked, fDesp = $('fDesp').checked, fVis = $('fVisits').checked, fFood = $('fFood').checked, fNotes = $('fNotes').checked;

        const catIcons = { vax: 'syringe', desp: 'bug', ctrl: 'stethoscope', fc: 'utensils-crossed', note: 'notebook-pen' };
        const catLabels = { vax: 'Vacuna', desp: 'Desparasitación', ctrl: 'Control', fc: 'Alimentación', note: 'Nota' };

        if (fVax) (db.vaccines || []).forEach(v => items.push({ date: v.date, type: 'vax', cat: catLabels.vax, desc: v.type + (v.lot ? ' · Lote: ' + v.lot : ''), status: 'Completado', id: v.id }));
        if (fDesp) (db.deworming || []).forEach(d => items.push({ date: d.date, type: 'desp', cat: catLabels.desp, desc: d.type + ' - ' + (d.product || ''), status: 'Completado', id: d.id }));
        if (fVis) (db.controls || []).forEach(c => items.push({ date: c.date, type: 'ctrl', cat: catLabels.ctrl, desc: c.type + ' - ' + (c.reason || c.result || ''), status: c.type === 'Urgencia' ? 'Urgencia' : 'Completado', id: c.id }));
        if (fFood) (db.foodChanges || []).forEach(f => items.push({ date: f.date, type: 'fc', cat: catLabels.fc, desc: f.desc, status: 'Cambio', id: f.id }));
        if (fNotes) (db.notes || []).forEach(n => items.push({ date: n.date, type: 'note', cat: catLabels.note, desc: n.title + (n.desc ? ' · ' + n.desc : ''), status: 'Nota', id: n.id }));

        items.sort((a, b) => String(b.date).localeCompare(a.date));

        if (!items.length) { el.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon"><i data-lucide="clipboard-list"></i></div><div class="empty-title">Sin eventos</div><div class="empty-text">Comienza registrando una vacuna, control o nota.</div></div></td></tr>'; refreshIcons(); }
        else {
            el.innerHTML = items.map(i => {
                const completed = i.status === 'Completado';
                const urgent = i.status === 'Urgencia';
                const ongoing = i.status === 'Cambio' || i.status === 'Nota';
                const badge = urgent ? '<span class="status status-danger"><i data-lucide="alert-triangle"></i> Urgencia</span>'
                    : ongoing ? '<span class="status status-pend"><i data-lucide="clock"></i> ' + i.status + '</span>'
                    : '<span class="status status-ok"><i data-lucide="check-circle-2"></i> Completado</span>';
                const action = i.type === 'ctrl' ? 'Ver notas'
                    : i.type === 'fc' ? 'Ver plan'
                    : (i.type === 'note' ? 'Ver nota' : 'Ver registro');
                return '<tr><td>' + fmtDate(i.date) + '</td><td><span style="display:inline-flex;align-items:center;gap:7px"><i data-lucide="' + catIcons[i.type] + '" style="width:16px;height:16px;color:var(--teal)"></i>' + i.cat + '</span></td><td><strong>' + esc(i.desc) + '</strong></td><td>' + badge + '</td>' +
                    '<td><button class="btn btn-link btn-sm" onclick="APP.delHistoryItem(\'' + i.type + '\',\'' + i.id + '\')" title="Eliminar">' + action + '</button></td></tr>';
            }).join('');
            refreshIcons();
        }

        const sum = $('historySummary');
        const overdue = (db.vaccines || []).filter(v => v.next && new Date(v.next) < new Date()).length;
        sum.innerHTML = '<div style="font-size:0.85rem;display:grid;gap:0.4rem">' +
            '<div><i data-lucide="syringe" style="width:14px;height:14px;color:var(--teal);margin-right:4px"></i>Vacunas: <strong>' + (db.vaccines || []).length + '</strong>' + (overdue ? ' <span style="color:#C62828">(' + overdue + ' vencidas)</span>' : '') + '</div>' +
            '<div><i data-lucide="bug" style="width:14px;height:14px;color:var(--teal);margin-right:4px"></i>Desparasitaciones: <strong>' + (db.deworming || []).length + '</strong></div>' +
            '<div><i data-lucide="stethoscope" style="width:14px;height:14px;color:var(--teal);margin-right:4px"></i>Controles: <strong>' + (db.controls || []).length + '</strong></div>' +
            '<div><i data-lucide="notebook-pen" style="width:14px;height:14px;color:var(--teal);margin-right:4px"></i>Notas: <strong>' + (db.notes || []).length + '</strong></div>' +
            '<div><i data-lucide="scale" style="width:14px;height:14px;color:var(--teal);margin-right:4px"></i>Peso: <strong>' + ((db.profile && db.profile.weight) || '—') + ' kg</strong></div>' +
            '</div>';
        refreshIcons();
    }

    async function delHistoryItem(type, id) {
        if (!confirm('¿Eliminar?')) return;
        const db = await DB.get();
        if (type === 'vax') db.vaccines = db.vaccines.filter(v => v.id !== id);
        if (type === 'desp') db.deworming = db.deworming.filter(d => d.id !== id);
        if (type === 'ctrl') db.controls = db.controls.filter(c => c.id !== id);
        if (type === 'note') db.notes = db.notes.filter(n => n.id !== id);
        if (type === 'fc') db.foodChanges = (db.foodChanges || []).filter(f => f.id !== id);
        await DB.save(db);
        renderHistory();
        toast('Eliminado.');
    }

    function renderApplyFilters() { renderHistory(); toast('Filtros aplicados.'); }

    // ============ EXPORT / CLEAR ============
    function exportData() {
        DB.get().then(db => {
            const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'abrilcita_' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            toast('Datos exportados.');
        });
    }

    async function clearAllData() {
        if (!confirm('¿Borrar TODOS los datos de Abrilcita?')) return;
        if (!confirm('¿Definitivamente?')) return;
        // Borrar todas las tablas de Supabase
        await DB.save({ profile: {}, vaccines: [], deworming: [], controls: [], notes: [], food: {}, foodChanges: [], weights: [], medications: [] });
        toast('Datos borrados de Supabase.');
        location.reload();
    }

    // ============ HELPERS ============
    function esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function focusField(id) {
        const el = $(id);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
    }

    // ============ EXPOSICIÓN PÚBLICA ============
    return {
        init, saveProfile, saveVaccine, delVaccine, saveDeworming, delDeworming,
        saveFood, saveFoodChange, delFoodChange, saveNote, delHistoryItem,
        renderApplyFilters, exportData, clearAllData,
        toggleProfileEdit, toggleDietEdit, newVisit, saveControl, delControl,
        addMedication, delMedication, renderHome, renderVisits, renderMedications,
        quickAdd, focusField
    };
})();

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => APP.init());
} else {
    APP.init();
}

window.APP = APP;

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
    function using(btn, msg) {
        if (!btn) return { end: function () {} };
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> ' + (msg || 'Guardando…');
        return {
            end() { btn.disabled = false; btn.innerHTML = orig; }
        };
    }

    // Protege un handler de doble-click: deshabilita el botón durante la ejecución
    // También marca una "ventana de silencio" para Realtime: si este mismo
    // dispositivo acaba de guardar/borrar algo, el eco que Supabase manda de
    // vuelta no debe mostrar el toast de "actualizado desde otro dispositivo".
    function guard(fn, btn, msg) {
        return async function () {
            if (!btn || btn.disabled) return;
            const state = using(btn, msg);
            try {
                await fn();
                lastLocalWriteAt = Date.now();
            } catch (e) { console.error(e); toast('Error al guardar: ' + e.message, 'error'); }
            finally { state.end(); }
        };
    }
    let lastLocalWriteAt = 0;

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

        // Event delegation: un solo listener para todos los botones con data-action
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id || '';
            const actions = {
                quickAdd: () => quickAdd(),
                toggleProfileEdit: () => toggleProfileEdit(),
                saveProfile: () => guard(saveProfile, btn)(),
                saveVaccine: () => guard(saveVaccine, btn)(),
                saveDeworming: () => guard(saveDeworming, btn)(),
                addMeal: () => addMeal(),
                toggleDietEdit: () => toggleDietEdit(),
                saveWeight: () => guard(saveWeight, btn)(),
                refreshWeights: () => guard(refreshWeights, btn, 'Actualizando…')(),
                saveFood: () => guard(saveFood, btn)(),
                saveSchedule: () => guard(saveFood, btn)(),
                saveFoodChange: () => guard(saveFoodChange, btn)(),
                newVisit: () => newVisit(),
                addMedication: () => guard(addMedication, btn)(),
                saveControl: () => guard(saveControl, btn)(),
                renderApplyFilters: () => renderApplyFilters(),
                saveNote: () => guard(saveNote, btn)(),
                exportData: () => exportData(),
                clearAllData: () => clearAllData(),
                delControl: () => { if (!confirm('¿Eliminar esta visita?')) return; guard(delControl, btn, 'Borrando…')(id); },
                delMedication: () => guard(delMedication, btn, 'Borrando…')(id),
                delVaccine: () => { if (!confirm('¿Eliminar esta vacuna?')) return; guard(delVaccine, btn, 'Borrando…')(id); },
                delDeworming: () => { if (!confirm('¿Eliminar este registro?')) return; guard(delDeworming, btn, 'Borrando…')(id); },
                delWeight: () => { if (!confirm('¿Eliminar este registro de peso?')) return; guard(delWeight, btn, 'Borrando…')(id); },
                delFoodChange: () => { if (!confirm('¿Eliminar este cambio?')) return; guard(delFoodChange, btn, 'Borrando…')(id); },
                delHistoryItem: () => {
                    const type = btn.dataset.type;
                    if (type && confirm('¿Eliminar?')) guard(delHistoryItem, btn, 'Borrando…')(type, id);
                },
                focusField: () => {
                    const target = btn.dataset.target;
                    if (target) focusField(target);
                }
            };
            if (actions[action]) actions[action]();
        });

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
            renderPage(e.detail.page);
            refreshIcons();
        });

        // Realtime: cuando otro dispositivo guarda o borra algo, refresca
        // la pantalla actual automáticamente (sin que el usuario recargue).
        // Se usa un pequeño debounce porque una sola acción del usuario
        // (ej. guardar perfil) puede disparar varios eventos seguidos.
        let realtimeDebounce = null;
        DB.subscribeRealtime(() => {
            clearTimeout(realtimeDebounce);
            realtimeDebounce = setTimeout(() => {
                renderPage(ROUTER.getCurrent());
                refreshIcons();
                // Solo avisamos si el cambio no vino de una acción reciente
                // de este mismo dispositivo (evita el toast "de otro
                // dispositivo" cuando en realidad fue uno mismo quien guardó).
                const recentLocalWrite = (Date.now() - lastLocalWriteAt) < 2000;
                if (!recentLocalWrite) toast('Datos actualizados desde otro dispositivo.');
            }, 400);
        });
    }

    // Renderiza las secciones correspondientes a una página. Se usa tanto
    // al navegar como cuando llega un cambio en tiempo real de Supabase.
    function renderPage(page) {
        if (page === 'inicio') { renderHome(); renderDietStats(); }
        if (page === 'vacunas') renderAllVaccines();
        if (page === 'desparasitacion') renderAllDeworming();
        if (page === 'alimentacion') { loadFoodForm(); renderDietStats(); renderWeightChart(); renderWeightList(); renderMealSchedule(); renderFoodHistory(); }
        if (page === 'controles') { renderVisits(); renderMedications(); }
        if (page === 'historial') renderHistory();
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
            try {
                applyPhotoUI(ev.target.result, 'navAvatar');
                const url = await DB.uploadPhoto(file);
                const db = await DB.get();
                db.profile.photo = url;
                await DB.saveProfile(db.profile);
                toast('Foto actualizada.');
            } catch (err) {
                console.error('Photo upload error:', err);
                toast('Error al subir foto: ' + err.message, 'error');
            }
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

        try {
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
        await DB.saveProfile(db.profile);
        await DB.saveWeights(db.weights);
        renderHome();
        toast('Perfil guardado correctamente.');
    } catch (e) { console.error(e); toast('Error al guardar perfil: ' + e.message, 'error'); }
    }

    // Helper: DB.get() con .catch para evitar UI congelada
    function safeGet(fn, fallback) {
        DB.get().then(fn).catch(e => {
            console.error('DB.get() error:', e);
            if (fallback) fallback();
            toast('Error al cargar datos. Revisa tu conexión.', 'error');
        });
    }

    // ---------- INICIO / HOME DASHBOARD ----------
    function renderHome() {
        // Estado de carga inmediato (antes de DB.get)
        if ($('homeName')) $('homeName').textContent = 'Cargando…';
        if ($('homeAge')) $('homeAge').textContent = '…';
        if ($('homeWeight')) $('homeWeight').textContent = '…';
        safeGet(db => {
            const p = db.profile || {};
            // Brand + pet overview
            if ($('brandName')) $('brandName').textContent = p.name || 'Abrilcita';
            const navAvatar = $('navAvatar');
            if (navAvatar) navAvatar.innerHTML = p.photo ? '<img src="' + p.photo + '" alt="' + esc(p.name || '') + '">' : '<img src="assets/logo.svg" alt="Logo">';
            if ($('homeName')) $('homeName').textContent = p.name || 'Sin nombre';
            if ($('homeAge')) $('homeAge').textContent = calcAge(p.birth);
            if ($('homeWeight')) $('homeWeight').textContent = (p.weight ? p.weight + ' kg' : '—');
            // Pre-cargar formulario de perfil (salvo que la persona esté con
            // el foco dentro del formulario, para no pisar lo que escribe si
            // llega un cambio en tiempo real de otro dispositivo)
            const editCard = $('profileEditCard');
            const isEditingProfile = editCard && document.activeElement && editCard.contains(document.activeElement);
            if (!isEditingProfile) {
                setVal('pName', p.name); setVal('pBirth', p.birth); setVal('pBreed', p.breed);
                setVal('pWeight', p.weight); setVal('pSex', p.sex); setVal('pColor', p.color);
                setVal('pVet', p.vet); setVal('pVetPhone', p.vetPhone); setVal('pRut', p.rut);
            }

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
        }, () => {
            if ($('homeName')) $('homeName').textContent = 'Error';
            if ($('homeAge')) $('homeAge').textContent = '—';
            if ($('homeWeight')) $('homeWeight').textContent = '—';
        });
    }

    function fillKpis(db) {
        const p = db.profile || {};
        const w = $('kpiWeight');
        if (w) {
            if (p.weight) { animateValue(w, p.weight, { suffix: ' kg', decimals: 1 }); pulse(w); }
            else w.textContent = '—';
        }
        const a = $('kpiAge');
        if (a) { a.textContent = calcAge(p.birth); pulse(a); }

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
        const stMap = vaccineStatusMap(list);
        const overdue = list.filter(x => stMap.get(x.id) === 'overdue').length;
        const ok = list.length - overdue;
        const next = nextExpiry(list);
        const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        set(prefix + 'Total', list.length);
        set(prefix + 'Ok', ok);
        set(prefix + 'Overdue', overdue);
        set(prefix + 'Next', next ? fmtDate(next) : '—');
    }

    // true=al día, false=algo vencido, 'none'=sin datos
    // Agrupa vacunas por type y devuelve un Map<id, status> donde status es
    // 'overdue' solo para la dosis MÁS RECIENTE de cada tipo cuyo next esté vencido.
    // Las dosis anteriores de la misma serie se marcan como 'completed'.
    function vaccineStatusMap(vaccines) {
        const map = new Map();
        if (!vaccines || !vaccines.length) return map;
        const today = new Date().toISOString().slice(0, 10);

        // Agrupar por type
        const groups = {};
        vaccines.forEach(v => {
            const key = v.type || '__none__';
            if (!groups[key]) groups[key] = [];
            groups[key].push(v);
        });

        // Para cada grupo, ordenar por date y evaluar solo la última dosis
        Object.values(groups).forEach(group => {
            group.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
            const latest = group[group.length - 1];
            const latestOverdue = latest.next && latest.next < today;

            group.forEach((v, i) => {
                if (v.id === latest.id) {
                    // La dosis más reciente: evaluar normalmente
                    map.set(v.id, latestOverdue ? 'overdue' : (v.next ? 'ok' : 'no_ref'));
                } else {
                    // Dosis anteriores de la misma serie: siempre "completada"
                    map.set(v.id, 'completed');
                }
            });
        });
        return map;
    }

    function statusOf(arr) {
        const a = arr || [];
        if (!a.length) return 'none';
        const stMap = vaccineStatusMap(a);
        return !Array.from(stMap.values()).some(s => s === 'overdue');
    }

    let _homeWeightChart = null;
    function renderHomeWeightChart(db) {
        const el = $('homeWeightChart');
        const weights = (db.weights || []).slice().sort((x, y) => String(x.d).localeCompare(y.d));
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
        if (!show) {
            // Al cerrar: confirmar si hay cambios sin guardar
            safeGet(db => {
                const p = db.profile || {};
                const current = { name: val('pName'), birth: val('pBirth'), weight: val('pWeight') };
                const dirty = current.name !== (p.name || '') || current.birth !== (p.birth || '') || current.weight !== (p.weight || '');
                if (dirty && !confirm('Tienes cambios sin guardar. ¿Cerrar sin guardar?')) return;
                card.style.display = 'none';
                refreshIcons();
            });
            return;
        }
        card.style.display = 'block';
        renderHome();
        refreshIcons();
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------- ALIMENTACIÓN: minitarjetas + alertas ----------
    function renderDietStats() {
        safeGet(db => {
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
        if (!show) {
            card.style.display = 'none';
            refreshIcons();
            return;
        }
        card.style.display = 'block';
        loadFoodForm();
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
        try {
        const db = await DB.get();
        db.controls.push({ id: DB.genId(), vetName: data.clinic, ...data });
        await DB.saveControls(db.controls);
        clearForm(['cDate', 'cType', 'cReason', 'cClinic', 'cWeight', 'cCost', 'cResult']);
        document.getElementById('visitForm').style.display = 'none';
        // registrar peso del control
        if (data.weight) {
            db.weights = db.weights || [];
            const today = new Date().toISOString().slice(0, 10);
            db.weights.push({ id: DB.genId(), d: data.date || today, w: data.weight });
            await DB.saveWeights(db.weights);
        }
        renderVisits();
        renderHome();
        toast('Visita registrada.');
        } catch (e) { console.error(e); toast('Error al guardar visita: ' + e.message, 'error'); }
    }

    function renderVisits() {
        safeGet(db => {
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
                '<button class="btn btn-link btn-sm" data-action="delControl" data-id="' + v.id + '" style="margin-top:var(--sp-2)">Eliminar visita</button>' +
                '</div></div>'
            ).join('');
            staggerRows(el, '.tl-item');
            refreshIcons();
        });
    }

    async function delControl(id) {
        try {
        const db = await DB.get();
        await DB.deleteControl(id);
        db.controls = db.controls.filter(c => c.id !== id);
        renderVisits();
        renderHome();
        toast('Visita eliminada.');
        } catch (e) { console.error(e); toast('Error al eliminar: ' + e.message, 'error'); }
    }

    // ---------- MEDICACIÓN ----------
    function renderMedications() {
        safeGet(db => {
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
                '<div class="ii-badge" style="display:flex;gap:6px"><button class="btn btn-link btn-sm" data-action="delMedication" data-id="' + m.id + '">Quitar</button></div>' +
                '</div>'
            ).join('');
            staggerRows(el, '.info-item');
            refreshIcons();
        });
    }

    async function addMedication() {
        const name = val('medName'), dose = val('medDose'), inst = val('medInst');
        if (!name) { toast('Indica el nombre del medicamento.', 'error'); return; }
        try {
        const db = await DB.get();
        if (!db.medications) db.medications = [];
        db.medications.push({ id: DB.genId(), name, dose, inst });
        await DB.saveMedications(db.medications);
        clearForm(['medName', 'medDose', 'medInst']);
        renderMedications();
        toast('Medicamento añadido.');
        } catch (e) { console.error(e); toast('Error al guardar medicamento: ' + e.message, 'error'); }
    }

    async function delMedication(id) {
        try {
        const db = await DB.get();
        await DB.deleteMedication(id);
        db.medications = (db.medications || []).filter(m => m.id !== id);
        renderMedications();
        toast('Medicamento eliminado.');
        } catch (e) { console.error(e); toast('Error al eliminar: ' + e.message, 'error'); }
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

        try {
        const db = await DB.get();
        db.vaccines.push({ id: DB.genId(), ...data });
        await DB.saveVaccines(db.vaccines);
        clearForm(['vaxType', 'vaxDate', 'vaxLot', 'vaxLab', 'vaxVet', 'vaxNext', 'vaxCost', 'vaxNotes']);
        renderAllVaccines();
        toast('Vacuna registrada.');
        } catch (e) { console.error(e); toast('Error al guardar vacuna: ' + e.message, 'error'); }
    }

    function renderCalendar() {
        safeGet(db => {
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
        if (!(db.vaccines || []).length) { el.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><i data-lucide="syringe"></i></div><div class="empty-title">Sin vacunas registradas</div><div class="empty-text">Agrega la primera vacuna para empezar el carnet.</div><button class="btn btn-primary" data-action="focusField" data-target="vaxType">Registrar vacuna</button></div></td></tr>'; refreshIcons(); renderVaccineCard(); return; }
        const stMap = vaccineStatusMap(db.vaccines);
        el.innerHTML = db.vaccines.map(vx => {
            const st = stMap.get(vx.id);
            const label = st === 'overdue' ? '<span class="status status-danger"><i data-lucide="alert-triangle"></i> Vencido</span>'
                : st === 'completed' ? '<span class="status status-ok"><i data-lucide="check-circle-2"></i> Completada</span>'
                : st === 'ok' ? '<span class="status status-ok"><i data-lucide="check-circle-2"></i> Al día</span>'
                : '<span class="status status-pend"><i data-lucide="clock"></i> Sin ref.</span>';
            return '<tr><td><input type="checkbox" class="checkbox" checked></td><td><strong>' + esc(vx.type) + '</strong></td><td>' + fmtDate(vx.date) + '</td><td>' + (vx.next ? fmtDate(vx.next) : '—') + '</td><td>' + label + '</td><td><button class="btn btn-danger btn-sm" data-action="delVaccine" data-id="' + vx.id + '">✕</button></td></tr>';
        }).join('');
        refreshIcons();
        renderVaccineCard(db);
        staggerRows(el);
        refreshIcons();
    }

    async function delVaccine(id) {
        try {
        const db = await DB.get();
        await DB.deleteVaccine(id);
        db.vaccines = db.vaccines.filter(v => v.id !== id);
        renderAllVaccines();
        toast('Vacuna eliminada.');
        } catch (e) { console.error(e); toast('Error al eliminar: ' + e.message, 'error'); }
    }

    async function renderVaccineCard(db) {
        if (!db) db = await DB.get();
        const el = $('vaccineCard'); const p = db.profile || {}; const vs = db.vaccines || [];
        if (!vs.length && !p.name) { el.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="syringe"></i></div><div class="empty-title">Carnet de vacunas</div><div class="empty-text">Registra la primera vacuna para ver el carnet.</div></div>'; refreshIcons(); return; }
        let h = '<div class="vaccine-card">';
        h += '<div class="vc-logo"><i data-lucide="heart-pulse" style="width:40px;height:40px;color:var(--teal-dark)"></i></div>';
        h += '<div style="font-weight:800;font-size:1rem;margin:0.3rem 0;color:var(--gray-900)">' + esc(p.name || '—') + '</div>';
        h += '<div style="font-size:0.75rem;color:var(--gray-500)">' + esc(p.breed || '') + (p.sex ? ' · ' + esc(p.sex) : '') + (p.weight ? ' · ' + p.weight + ' kg' : '') + '</div>';
        if (p.rut) h += '<div style="font-size:0.7rem;color:var(--gray-500)">ID: ' + esc(p.rut) + '</div>';
        if (vs.length) {
            const stMap = vaccineStatusMap(vs);
            h += '<table style="width:100%;margin-top:0.8rem;font-size:0.75rem;border-collapse:collapse">';
            h += '<tr style="background:var(--teal);color:white"><th style="padding:0.3rem;text-align:left">Vacuna</th><th style="padding:0.3rem;text-align:left">Fecha</th><th style="padding:0.3rem;text-align:left">Estado</th></tr>';
            vs.forEach(vx => {
                const st = stMap.get(vx.id);
                const label = st === 'overdue' ? 'VENCIDO' : st === 'completed' ? 'COMPLETADA' : st === 'ok' ? 'OK' : 'SIN REF.';
                const cls = st === 'overdue' ? 'status-danger' : 'status-ok';
                h += '<tr><td style="padding:0.3rem;border-bottom:1px solid var(--gray-200);font-size:0.8rem;text-align:left"><strong>' + esc(vx.type) + '</strong></td><td style="padding:0.3rem;border-bottom:1px solid var(--gray-200);font-size:0.8rem">' + fmtDate(vx.date) + '</td><td style="padding:0.3rem;border-bottom:1px solid var(--gray-200)"><span class="status ' + cls + '">' + label + '</span></td></tr>';
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

        try {
        const db = await DB.get();
        db.deworming.push({ id: DB.genId(), ...data });
        await DB.saveDeworming(db.deworming);
        clearForm(['despType', 'despDate', 'despProduct', 'despDose', 'despWeight', 'despNext', 'despVet', 'despCost', 'despNotes']);
        renderAllDeworming();
        toast('Registro guardado.');
        } catch (e) { console.error(e); toast('Error al guardar desparasitación: ' + e.message, 'error'); }
    }

    async function renderAllDeworming() {
        const db = await DB.get();
        fillCollectionKpis(db.deworming, 'despKpi');
        const el = $('despBody');
        if (!el) return;
        if (!(db.deworming || []).length) { el.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="empty-icon"><i data-lucide="droplet"></i></div><div class="empty-title">Sin registros de desparasitación</div><div class="empty-text">Registra la primera aplicación para controlar parásitos.</div><button class="btn btn-primary" data-action="focusField" data-target="despType">Registrar</button></div></td></tr>'; refreshIcons(); return; }
        el.innerHTML = db.deworming.map(dw => {
            const icon = dw.type === 'Externa' ? 'droplet' : (dw.type === 'Ambas' ? 'shield' : 'syringe');
            return '<tr><td><div style="display:flex;align-items:center;gap:8px"><i data-lucide="' + icon + '" style="width:16px;height:16px;color:var(--teal)"></i> ' + esc(dw.type) + '</div></td><td>' + fmtDate(dw.date) + '</td><td><strong>' + esc(dw.product || '—') + '</strong></td><td>' + esc(dw.dose || '—') + '</td><td>' + (dw.next ? fmtDate(dw.next) : '—') + '</td><td><button class="btn btn-danger btn-sm" data-action="delDeworming" data-id="' + dw.id + '">✕</button></td></tr>';
        }).join('');
        staggerRows(el);
        refreshIcons();
    }

    async function delDeworming(id) {
        try {
        const db = await DB.get();
        await DB.deleteDeworming(id);
        db.deworming = db.deworming.filter(d => d.id !== id);
        renderAllDeworming();
        toast('Registro eliminado.');
        } catch (e) { console.error(e); toast('Error al eliminar: ' + e.message, 'error'); }
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

        try {
        const db = await DB.get();
        db.food = data;
        await DB.saveFoodData(db.food);
        renderMealSchedule();
        renderDietStats();
        renderHome();
        toast('Alimentación guardada.');
        } catch (e) { console.error(e); toast('Error al guardar alimentación: ' + e.message, 'error'); }
    }

    function collectRestrictions() {
        const labels = [];
        const rows = [['drNoPoll', 'Sin pollo'], ['drNoLact', 'Sin lactosa'], ['drNoGranos', 'Sin granos'], ['drHighProt', 'Alta en proteínas']];
        rows.forEach(([id, label]) => { const el = $(id); if (el && el.checked) labels.push(label); });
        return labels.join(', ');
    }

    function loadFoodForm() {
        safeGet(db => {
            const f = db.food || {};
            // Si el usuario tiene el editor de alimentación abierto, no pisamos
            // lo que esté escribiendo (ej. si llega un cambio en tiempo real
            // de otro dispositivo mientras está editando).
            const editCard = $('dietEditCard');
            const isEditing = editCard && editCard.style.display !== 'none';
            if (isEditing && document.activeElement && editCard.contains(document.activeElement)) return;
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

    // ============ PESO RETROACTIVO ============
    async function saveWeight() {
        const date = val('rwDate');
        const w = parseFloat(val('rwWeight'));
        if (!date) { toast('Indica la fecha.', 'error'); focusField('rwDate'); return; }
        if (!w || w <= 0) { toast('Indica un peso válido (kg).', 'error'); focusField('rwWeight'); return; }

        try {
        const db = await DB.get();
        if (!db.weights) db.weights = [];
        // Evitar duplicado exacto (misma fecha + mismo peso)
        const dup = db.weights.find(x => x.d === date && parseFloat(x.w) === w);
        if (dup) { toast('Ese peso ya está registrado para esa fecha.', 'error'); return; }

        db.weights.push({ id: DB.genId(), d: date, w: String(w) });
        await DB.saveWeights(db.weights);

        // Actualizar peso actual del perfil si la fecha es la más reciente
        const sorted = db.weights.slice().sort((a, b) => String(b.d).localeCompare(String(a.d)));
        if (!db.profile) db.profile = {};
        if (!db.profile.weight && sorted[0] && sorted[0].id === db.weights[db.weights.length - 1].id) {
            db.profile.weight = String(w);
            await DB.saveProfile(db.profile);
        }

        renderWeightList();
        renderWeightChart();
        renderHome();
        toast('Peso registrado.');
        } catch (e) { console.error(e); toast('Error al guardar peso: ' + e.message, 'error'); }
    }

    // Fuerza una relectura de los pesos directo desde Supabase (por si el
    // dispositivo no ve un registro agregado desde otro dispositivo).
    async function refreshWeights() {
        try {
            renderWeightList();
            await renderWeightChart();
            renderHome();
            toast('Datos actualizados.');
        } catch (e) { console.error(e); toast('Error al actualizar: ' + e.message, 'error'); }
    }

    async function delWeight(id) {
        try {
        const db = await DB.get();
        await DB.deleteWeight(id);
        db.weights = (db.weights || []).filter(x => x.id !== id);
        renderWeightList();
        renderWeightChart();
        renderHome();
        toast('Registro de peso eliminado.');
        } catch (e) { console.error(e); toast('Error al eliminar: ' + e.message, 'error'); }
    }

    function renderWeightList() {
        const el = $('weightList');
        if (!el) return;
        safeGet(db => {
            const list = (db.weights || []).slice().sort((a, b) => String(b.d).localeCompare(String(a.d)));
            if (!list.length) { el.innerHTML = ''; return; }
            el.innerHTML = '<div class="weight-list">' + list.slice(0, 10).map(x =>
                '<div class="weight-item"><span class="wi-date">' + fmtDate(x.d) + '</span><span class="wi-value">' + parseFloat(x.w) + ' kg</span><button class="btn btn-danger btn-sm" data-action="delWeight" data-id="' + x.id + '">✕</button></div>'
            ).join('') + '</div>';
            refreshIcons();
        });
    }

    let _weightChart = null;
    async function renderWeightChart() {
        const db = await DB.get();
        const el = $('weightChart');
        if (!el) return;
        const weights = (db.weights || []).slice().sort((x, y) => String(x.d).localeCompare(y.d));
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
                box.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="line-chart"></i></div><div class="empty-title">Sin registros de peso</div><div class="empty-text">Registra un control o edita el perfil para empezar la evolución.</div><button class="btn btn-primary" data-action="focusField" data-target="pWeight">Registrar peso</button></div>';
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
        safeGet(db => {
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
        try {
        const db = await DB.get();
        if (!db.foodChanges) db.foodChanges = [];
        db.foodChanges.push({ id: DB.genId(), ...data });
        await DB.saveFoodChanges(db.foodChanges);
        clearForm(['foodChangeDate', 'foodChangeDesc', 'foodChangeReason']);
        renderFoodHistory();
        toast('Cambio registrado.');
        } catch (e) { console.error(e); toast('Error al guardar cambio: ' + e.message, 'error'); }
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
            '<div class="ii-badge"><button class="btn btn-link btn-sm" data-action="delFoodChange" data-id="' + c.id + '" title="Eliminar">Quitar</button></div>' +
            '</div>'
        ).join('') + '</div>';
        refreshIcons();
    }

    async function delFoodChange(id) {
        try {
        const db = await DB.get();
        await DB.deleteFoodChange(id);
        db.foodChanges = (db.foodChanges || []).filter(c => c.id !== id);
        renderFoodHistory();
        toast('Cambio eliminado.');
        } catch (e) { console.error(e); toast('Error al eliminar: ' + e.message, 'error'); }
    }

    // ============ HISTORIAL ============
    async function saveNote() {
        const data = { date: val('noteDate'), title: val('noteTitle'), desc: val('noteDesc') };
        const errors = VALIDATORS.validateNote(data);
        if (VALIDATORS.hasErrors(errors)) { toast('Completa fecha y título.', 'error'); return; }
        try {
        const db = await DB.get();
        db.notes.push({ id: DB.genId(), ...data });
        await DB.saveNotes(db.notes);
        clearForm(['noteDate', 'noteTitle', 'noteDesc']);
        renderHistory();
        toast('Nota guardada.');
        } catch (e) { console.error(e); toast('Error al guardar nota: ' + e.message, 'error'); }
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
                    '<td><button class="btn btn-link btn-sm" data-action="delHistoryItem" data-id="' + i.id + '" data-type="' + i.type + '" title="Eliminar">' + action + '</button></td></tr>';
            }).join('');
            staggerRows(el);
            refreshIcons();
        }

        const sum = $('historySummary');
        const stMap = vaccineStatusMap(db.vaccines || []);
        const overdue = (db.vaccines || []).filter(v => stMap.get(v.id) === 'overdue').length;
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
        try {
        const db = await DB.get();
        if (type === 'vax') { await DB.deleteVaccine(id); db.vaccines = db.vaccines.filter(v => v.id !== id); }
        if (type === 'desp') { await DB.deleteDeworming(id); db.deworming = db.deworming.filter(d => d.id !== id); }
        if (type === 'ctrl') { await DB.deleteControl(id); db.controls = db.controls.filter(c => c.id !== id); }
        if (type === 'note') { await DB.deleteNote(id); db.notes = db.notes.filter(n => n.id !== id); }
        if (type === 'fc') { await DB.deleteFoodChange(id); db.foodChanges = (db.foodChanges || []).filter(f => f.id !== id); }
        renderHistory();
        toast('Eliminado.');
        } catch (e) { console.error(e); toast('Error al eliminar: ' + e.message, 'error'); }
    }

    function renderApplyFilters() { renderHistory(); toast('Filtros aplicados.'); }

    // ============ EXPORT / CLEAR ============
    function exportData() {
        safeGet(db => {
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
        // Borrar todas las tablas de Supabase (borrado explícito e intencional)
        await DB.deleteAll();
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
        quickAdd, focusField, saveWeight, delWeight, guard
    };
})();

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => APP.init());
} else {
    APP.init();
}

window.APP = APP;

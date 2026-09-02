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
            if (db.profile && db.profile.photo) {
                $('catAvatar').innerHTML = '<img src="' + db.profile.photo + '">';
            }
            renderProfile();
            renderRecentActivity();
        } catch (e) {
            console.error('Init DB error', e);
        }

        // Configurar foto upload
        $('catPhoto').addEventListener('change', handlePhotoUpload);

        // Configurar filtros de historial + notas
        ROUTER.init();

        // Listener de cambio de ruta
        document.addEventListener('route:change', (e) => {
            const page = e.detail.page;
            if (page === 'vacunas') renderAllVaccines();
            if (page === 'desparasitacion') renderAllDeworming();
            if (page === 'alimentacion') { loadFoodForm(); renderWeightChart(); renderMealSchedule(); renderFoodHistory(); }
            if (page === 'historial') renderHistory();
            if (page === 'perfil') { renderProfile(); renderRecentActivity(); }
        });
    }

    // ============ FOTO ============
    function handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast('Debes seleccionar una imagen.', 'error'); return; }
        const reader = new FileReader();
        reader.onload = async function (ev) {
            $('catAvatar').innerHTML = '<img src="' + ev.target.result + '">';
            const db = await DB.get();
            db.profile.photo = ev.target.result;
            await DB.save(db);
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
        renderProfile();
        toast('Perfil guardado correctamente.');
    }

    function renderProfile() {
        DB.get().then(db => {
            const p = db.profile || {};
            $('displayName').textContent = p.name || 'Sin nombre';
            $('displayMeta').textContent = 'Edad: ' + calcAge(p.birth) + ' · Peso: ' + (p.weight || '—') + ' kg' + (p.breed ? ' · ' + p.breed : '');
            const total = (db.vaccines || []).length + (db.deworming || []).length + (db.controls || []).length;
            $('healthStatus').textContent = total > 0 ? 'Activo (' + total + ' registros)' : 'Sin datos';
            setVal('pName', p.name); setVal('pBirth', p.birth); setVal('pBreed', p.breed);
            setVal('pWeight', p.weight); setVal('pSex', p.sex); setVal('pColor', p.color);
            setVal('pVet', p.vet); setVal('pVetPhone', p.vetPhone); setVal('pRut', p.rut);
        });
    }

    function renderRecentActivity() {
        DB.get().then(db => {
            const el = $('recentActivity'); const items = [];
            (db.vaccines || []).forEach(v => items.push({ date: v.date, icon: '💉', text: v.type, cls: 'green' }));
            (db.deworming || []).forEach(d => items.push({ date: d.date, icon: '💊', text: d.type + ' - ' + (d.product || ''), cls: 'blue' }));
            (db.controls || []).forEach(c => items.push({ date: c.date, icon: '🏥', text: c.type + ' - ' + (c.reason || c.result || ''), cls: 'orange' }));
            items.sort((a, b) => String(b.date).localeCompare(a.date));
            if (!items.length) { el.innerHTML = '<li><div class="act-icon green">📋</div><div><small>Sin actividad registrada</small></div></li>'; return; }
            el.innerHTML = items.slice(0, 6).map(i =>
                '<li><div class="act-icon ' + i.cls + '">' + i.icon + '</div><div><strong>' + i.text + '</strong><br><span class="act-date">' + fmtDate(i.date) + '</span></div></li>'
            ).join('');
        });
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
                let title = '';
                if (vaxDates.includes(d)) title = '💉 Vacuna';
                if (despDates.includes(d)) title += (title ? ' · ' : '') + '💊 Desp.';
                h += '<div class="' + cls + '" title="' + title + '">' + d + (vaxDates.includes(d) ? '<span style="position:absolute;top:-2px;right:-2px;font-size:0.5rem">💉</span>' : '') + (despDates.includes(d) ? '<span style="position:absolute;bottom:-2px;left:-2px;font-size:0.5rem">💊</span>' : '') + '</div>';
            }
            h += '</div></div>';
            $('calendarWidget').innerHTML = h;
        });
    }

    async function renderAllVaccines() {
        const db = await DB.get();
        const el = $('vaxBody');
        renderCalendar();
        if (!(db.vaccines || []).length) { el.innerHTML = '<tr><td colspan="6" class="empty">Aún no hay vacunas registradas.</td></tr>'; renderVaccineCard(); return; }
        el.innerHTML = db.vaccines.map(vx => {
            const past = vx.next && new Date(vx.next) < new Date();
            const st = past ? '<span class="status status-danger">⚠ Vencido</span>' : (vx.next ? '<span class="status status-ok">✓ Al día</span>' : '<span class="status status-warn">Sin ref.</span>');
            return '<tr><td><input type="checkbox" class="checkbox" checked></td><td><strong>' + esc(vx.type) + '</strong></td><td>' + fmtDate(vx.date) + '</td><td>' + (vx.next ? fmtDate(vx.next) : '—') + '</td><td>' + st + '</td><td><button class="btn btn-danger btn-sm" onclick="APP.delVaccine(\'' + vx.id + '\')">✕</button></td></tr>';
        }).join('');
        renderVaccineCard(db);
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
        if (!vs.length && !p.name) { el.innerHTML = '<p class="empty">Sin vacunas registradas.</p>'; return; }
        let h = '<div style="border:2px solid #4CAF50;border-radius:10px;padding:1rem;text-align:center">';
        h += '<div style="font-size:1.5rem">🐱</div>';
        h += '<div style="font-weight:700;font-size:1rem;margin:0.3rem 0">' + esc(p.name || '—') + '</div>';
        h += '<div style="font-size:0.75rem;color:#777">' + (p.breed || '') + (p.sex ? ' · ' + p.sex : '') + (p.weight ? ' · ' + p.weight + ' kg' : '') + '</div>';
        if (p.rut) h += '<div style="font-size:0.7rem;color:#777">ID: ' + esc(p.rut) + '</div>';
        if (vs.length) {
            h += '<table style="width:100%;margin-top:0.8rem;font-size:0.75rem;border-collapse:collapse">';
            h += '<tr style="background:#4CAF50;color:white"><th style="padding:0.3rem;text-align:left">Vacuna</th><th style="padding:0.3rem;text-align:left">Fecha</th><th style="padding:0.3rem;text-align:left">Estado</th></tr>';
            vs.forEach(vx => {
                const past = vx.next && new Date(vx.next) < new Date();
                const sc = past ? 'background:#FFEBEE;color:#C62828' : 'background:#E8F5E9;color:#2E7D32';
                const st = past ? 'VENCIDO' : (vx.next ? 'OK' : 'SIN REF.');
                h += '<tr><td style="padding:0.3rem;border-bottom:1px solid #eee;font-size:0.8rem;text-align:left"><strong>' + esc(vx.type) + '</strong></td><td style="padding:0.3rem;border-bottom:1px solid #eee;font-size:0.8rem">' + fmtDate(vx.date) + '</td><td style="padding:0.3rem;border-bottom:1px solid #eee"><span style="' + sc + ';padding:0.15rem 0.5rem;border-radius:10px;font-size:0.7rem;font-weight:600">' + st + '</span></td></tr>';
            });
            h += '</table>';
        }
        h += '<div style="margin-top:0.5rem;font-size:0.7rem;color:#777">Generado por Abrilcita · ' + new Date().toLocaleDateString('es-CL') + '</div></div>';
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
        const el = $('despBody'); const recent = $('despRecent');
        if (!(db.deworming || []).length) { el.innerHTML = '<tr><td colspan="6" class="empty">Aún no hay registros.</td></tr>'; recent.innerHTML = '<p class="empty">Sin registros.</p>'; return; }
        el.innerHTML = db.deworming.map(dw => {
            const past = dw.next && new Date(dw.next) < new Date();
            const st = past ? '<span class="status status-danger">⚠ Vencido</span>' : (dw.next ? '<span class="status status-ok">✓ Al día</span>' : '<span class="status status-warn">Sin fecha</span>');
            return '<tr><td><input type="checkbox" class="checkbox" checked></td><td>' + fmtDate(dw.date) + '</td><td><strong>' + esc(dw.product || dw.type) + '</strong></td><td>' + esc(dw.dose || '—') + '</td><td>' + (dw.next ? fmtDate(dw.next) : '—') + '</td><td><button class="btn btn-danger btn-sm" onclick="APP.delDeworming(\'' + dw.id + '\')">✕</button></td></tr>';
        }).join('');
        recent.innerHTML = db.deworming.slice(-3).reverse().map(dw =>
            '<div class="record"><div class="record-content"><strong>' + esc(dw.type) + '</strong><small>' + fmtDate(dw.date) + ' · ' + esc(dw.product || '') + '</small></div></div>'
        ).join('');
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
        const data = {
            type: val('foodType'), brand: val('foodBrand'), amount: val('foodAmount'),
            cost: val('foodCost'), notes: val('foodNotes'), supplements: val('foodSupplements'),
            treats: val('foodTreats'), restrictions: val('foodRestrictions'),
            time1: val('foodTime1'), time2: val('foodTime2'), time3: val('foodTime3'), times: val('foodTimes')
        };
        const errors = VALIDATORS.validateFood(data);
        if (VALIDATORS.hasErrors(errors)) { toast('Corrige los campos.', 'error'); return; }

        const db = await DB.get();
        db.food = data;
        await DB.save(db);
        renderMealSchedule();
        toast('Alimentación guardada.');
    }

    function loadFoodForm() {
        DB.get().then(db => {
            const f = db.food || {};
            setVal('foodType', f.type); setVal('foodBrand', f.brand); setVal('foodAmount', f.amount);
            setVal('foodCost', f.cost); setVal('foodNotes', f.notes); setVal('foodSupplements', f.supplements);
            setVal('foodTreats', f.treats); setVal('foodRestrictions', f.restrictions);
            setVal('foodTime1', f.time1); setVal('foodTime2', f.time2);
            setVal('foodTime3', f.time3); setVal('foodTimes', f.times);
        });
    }

    async function renderWeightChart() {
        const db = await DB.get();
        const weights = db.weights || []; const el = $('weightChart');
        const last6 = weights.slice(-6);
        if (!last6.length) {
            el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;color:#777;font-size:0.85rem">Sin datos de peso. Guarda el perfil.</div>';
            $('chartWeight').textContent = (db.profile && db.profile.weight) || '—';
            return;
        }
        const max = Math.max(...last6.map(w => parseFloat(w.w)));
        el.innerHTML = last6.map(w => {
            const pct = (parseFloat(w.w) / max) * 80 + 20;
            let m = '—';
            try { m = new Date(w.d + 'T12:00:00').toLocaleDateString('es-CL', { month: 'short' }); } catch (e) {}
            return '<div class="chart-bar" style="height:' + pct + '%"><span class="bar-label">' + w.w + '</span><span class="bar-month">' + m + '</span></div>';
        }).join('');
        $('chartWeight').textContent = last6[last6.length - 1].w + ' kg';
    }

    function renderMealSchedule() {
        DB.get().then(db => {
            const f = db.food || {}; const el = $('mealSchedule');
            const meals = [];
            if (f.time1) meals.push({ time: f.time1, icon: '🌅', desc: 'Desayuno' });
            if (f.time2) meals.push({ time: f.time2, icon: '☀️', desc: 'Almuerzo' });
            if (f.time3) meals.push({ time: f.time3, icon: '🌙', desc: 'Cena' });
            if (!meals.length) { el.innerHTML = '<p class="empty" style="margin-top:0.5rem">Configura horarios arriba.</p>'; return; }
            el.innerHTML = '<div style="margin-top:1rem">' + meals.map(m => '<div class="meal-row"><span class="meal-time">' + m.time + '</span><span class="meal-icon">' + m.icon + '</span><span class="meal-desc">' + m.desc + '</span></div>').join('') + '</div>';
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
        if (!ch.length) { el.innerHTML = '<p class="empty">Sin cambios registrados.</p>'; return; }
        el.innerHTML = ch.sort((a, b) => String(b.date).localeCompare(a.date)).map(c =>
            '<div class="record"><div class="record-content"><strong>' + esc(c.desc) + '</strong><small>' + fmtDate(c.date) + (c.reason ? ' · ' + esc(c.reason) : '') + '</small></div><button class="btn btn-danger btn-sm" onclick="APP.delFoodChange(\'' + c.id + '\')">✕</button></div>'
        ).join('');
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

        if (fVax) (db.vaccines || []).forEach(v => items.push({ date: v.date, cat: '💉 Vacuna', desc: v.type + (v.lot ? ' · Lote: ' + v.lot : ''), status: 'Completado', id: v.id, type: 'vax' }));
        if (fDesp) (db.deworming || []).forEach(d => items.push({ date: d.date, cat: '💊 Desparasitación', desc: d.type + ' - ' + (d.product || ''), status: 'Completado', id: d.id, type: 'desp' }));
        if (fVis) (db.controls || []).forEach(c => items.push({ date: c.date, cat: '🏥 Control', desc: c.type + ' - ' + (c.reason || c.result || ''), status: c.type === 'Urgencia' ? 'Urgencia' : 'Completado', id: c.id, type: 'ctrl' }));
        if (fFood) (db.foodChanges || []).forEach(f => items.push({ date: f.date, cat: '🍽️ Alimentación', desc: f.desc, status: 'Cambio', id: f.id, type: 'fc' }));
        if (fNotes) (db.notes || []).forEach(n => items.push({ date: n.date, cat: '📝 Nota', desc: n.title + (n.desc ? ' · ' + n.desc : ''), status: 'Nota', id: n.id, type: 'note' }));

        items.sort((a, b) => String(b.date).localeCompare(a.date));

        if (!items.length) { el.innerHTML = '<tr><td colspan="5" class="empty">Sin eventos.</td></tr>'; }
        else {
            el.innerHTML = items.map(i => {
                const sc = i.status === 'Completado' ? 'status-ok' : i.status === 'Urgencia' ? 'status-danger' : i.status === 'Cambio' ? 'status-info' : 'status-warn';
                return '<tr><td>' + fmtDate(i.date) + '</td><td>' + i.cat + '</td><td><strong>' + esc(i.desc) + '</strong></td><td><span class="status ' + sc + '">' + i.status + '</span></td><td><button class="btn btn-danger btn-sm" onclick="APP.delHistoryItem(\'' + i.type + '\',\'' + i.id + '\')">✕</button></td></tr>';
            }).join('');
        }

        const sum = $('historySummary');
        const overdue = (db.vaccines || []).filter(v => v.next && new Date(v.next) < new Date()).length;
        sum.innerHTML = '<div style="font-size:0.85rem;display:grid;gap:0.4rem">' +
            '<div>💉 Vacunas: <strong>' + (db.vaccines || []).length + '</strong>' + (overdue ? ' <span style="color:#C62828">(' + overdue + ' vencidas)</span>' : '') + '</div>' +
            '<div>💊 Desparasitaciones: <strong>' + (db.deworming || []).length + '</strong></div>' +
            '<div>🏥 Controles: <strong>' + (db.controls || []).length + '</strong></div>' +
            '<div>📝 Notas: <strong>' + (db.notes || []).length + '</strong></div>' +
            '<div>⚖️ Peso: <strong>' + ((db.profile && db.profile.weight) || '—') + ' kg</strong></div>' +
            '</div>';
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
        if (!confirm('⚠️ Borrar TODOS los datos de Abrilcita?')) return;
        if (!confirm('¿Definitivamente?')) return;
        if (DB.isSupabase()) {
            // En modo Supabase borrar tablas
            await DB.save({ profile: {}, vaccines: [], deworming: [], controls: [], notes: [], food: {}, foodChanges: [], weights: [] });
            toast('Datos borrados de Supabase.');
        } else {
            localStorage.removeItem(DB.localStorageKey);
        }
        location.reload();
    }

    // ============ HELPERS ============
    function esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ============ EXPOSICIÓN PÚBLICA ============
    return {
        init, saveProfile, saveVaccine, delVaccine, saveDeworming, delDeworming,
        saveFood, saveFoodChange, delFoodChange, saveNote, delHistoryItem,
        renderApplyFilters, exportData, clearAllData
    };
})();

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => APP.init());
} else {
    APP.init();
}

window.APP = APP;

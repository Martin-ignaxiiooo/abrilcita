/* ==================================================
   Abrilcita - db.js
   Capa de datos: Supabase (persistencia única en la nube)
   ==================================================
   Cada tabla se guarda con su propia función para evitar
   reescrituras completas y mantener integridad de datos.
   Las listas se guardan por upsert (nunca se borra por
   comparación); el borrado de un registro puntual se hace
   con las funciones deleteXxx(id), para que un dispositivo
   con datos desactualizados nunca borre por error registros
   creados por otro dispositivo.
   ================================================== */

const DB = (function () {

    // ---------- SCHEMA ----------
    const defaultDoc = () => ({
        profile: {},
        vaccines: [],
        deworming: [],
        controls: [],
        notes: [],
        food: {},
        foodChanges: [],
        weights: [],
        medications: []
    });

    // ---------- SUPABASE CLIENT (caché: una sola instancia) ----------
    let supabaseClient = null;

    async function initSupabase() {
        if (supabaseClient) return supabaseClient;
        if (!window.supabase) throw new Error('Supabase client no cargado.');
        const cfg = window.APP_CONFIG.supabase;
        if (!cfg.url || !cfg.anonKey) throw new Error('Supabase config incompleta.');
        supabaseClient = window.supabase.createClient(cfg.url, cfg.anonKey);
        return supabaseClient;
    }

    function checkError(res, op) {
        if (res && res.error) {
            const msg = res.error.message || res.error.code || 'error desconocido';
            console.error('[Supabase] ' + op + ': ' + msg);
            throw new Error('Supabase: ' + op + ' falló (' + msg + ')');
        }
        return res;
    }

    // ---------- FIELD MAPS ----------
    const FIELD_MAPS = {
        profile: {
            name: 'name', birth: 'birth', breed: 'breed', weight: 'weight',
            sex: 'sex', color: 'color', vet: 'vet', vetPhone: 'vet_phone',
            rut: 'rut', photo: 'photo'
        },
        vaccines: {
            type: 'type', date: 'date', lot: 'lot', lab: 'lab', vet: 'vet',
            next: 'next', cost: 'cost', notes: 'notes'
        },
        deworming: {
            type: 'type', date: 'date', product: 'product', dose: 'dose',
            weight: 'weight', next: 'next', vet: 'vet', cost: 'cost', notes: 'notes'
        },
        controls: {
            date: 'date', type: 'type', vet: 'vet', vetName: 'vet_name',
            reason: 'reason', weight: 'weight', result: 'result', cost: 'cost', notes: 'notes'
        },
        notes: { date: 'date', title: 'title', desc: 'description' },
        food: {
            type: 'type', brand: 'brand', amount: 'amount', cost: 'cost',
            notes: 'notes', supplements: 'supplements', treats: 'treats',
            restrictions: 'restrictions', time1: 'time1', time2: 'time2',
            time3: 'time3', times: 'times'
        },
        foodChanges: { date: 'date', desc: 'description', reason: 'reason' },
        weights: { d: 'd', w: 'w' },
        medications: { name: 'name', dose: 'dose', inst: 'inst' }
    };

    // ---------- CONVERSORES ----------
    function rowToApp(map, row) {
        const out = { id: row.id };
        for (const [appKey, col] of Object.entries(map)) {
            if (row[col] !== undefined && row[col] !== null) out[appKey] = row[col];
        }
        return out;
    }

    function appToRow(map, obj) {
        const out = {};
        for (const [appKey, col] of Object.entries(map)) {
            if (obj[appKey] !== undefined && obj[appKey] !== null) {
                out[col] = obj[appKey] === '' ? null : obj[appKey];
            }
        }
        return out;
    }

    // Helper: tabla de config → nombre real
    function tableName(key) {
        return window.APP_CONFIG.supabase.tables[key] || key;
    }

    // ---------- GET ----------
    async function get() {
        await initSupabase();
        const doc = defaultDoc();

        const { data: profileRows } = checkError(
            await supabaseClient.from(tableName('profile')).select('*').limit(1), 'select profile'
        );
        doc.profile = profileRows && profileRows[0] ? rowToApp(FIELD_MAPS.profile, profileRows[0]) : {};

        const { data: foodRows } = checkError(
            await supabaseClient.from(tableName('food')).select('*').limit(1), 'select food'
        );
        doc.food = foodRows && foodRows[0] ? rowToApp(FIELD_MAPS.food, foodRows[0]) : {};

        const listKeys = ['vaccines', 'deworming', 'controls', 'notes', 'foodChanges', 'weights', 'medications'];
        for (const key of listKeys) {
            const { data } = checkError(
                await supabaseClient.from(tableName(key)).select('*'), 'select ' + key
            );
            doc[key] = (data || []).map(r => rowToApp(FIELD_MAPS[key], r));
        }

        return doc;
    }

    // ---------- SAVE POR SECCIÓN ----------

    // Tablas de una sola fila (profile, food)
    async function saveSingleRow(data, key) {
        await initSupabase();
        const map = FIELD_MAPS[key];
        const row = appToRow(map, data || {});
        const table = tableName(key);
        if (!Object.keys(row).length) return;

        const { data: existing } = checkError(await supabaseClient.from(table).select('id').limit(1), 'select ' + key + ' id');
        if (existing && existing[0]) {
            checkError(await supabaseClient.from(table).update(row).eq('id', existing[0].id), 'update ' + key);
        } else {
            checkError(await supabaseClient.from(table).insert(row), 'insert ' + key);
        }
    }

    // Tablas de lista (vaccines, deworming, controls, notes, foodChanges, weights, medications)
    // ---------------------------------------------------------------
    // IMPORTANTE (fix de integridad multi-dispositivo):
    // Antes esta función comparaba la lista local contra TODO lo que
    // hubiera en Supabase y borraba cualquier fila remota que el
    // dispositivo actual no conociera. Eso significaba que si el
    // Dispositivo A tenía la lista cargada en memoria y el Dispositivo B
    // agregaba un registro nuevo, al guardar A se borraba lo que B
    // acababa de crear (porque A no sabía que existía).
    //
    // Ahora la estrategia es "solo upsert, nunca borrar por comparación":
    // - Cada item local se guarda (insert si es nuevo, update si ya existe).
    // - El borrado de un registro específico se hace aparte, por id,
    //   con deleteById() en el momento exacto en que el usuario borra
    //   ese registro (ver delItem más abajo). Así nunca se borra algo
    //   que el dispositivo actual no pidió borrar explícitamente.
    // ---------------------------------------------------------------
    async function saveList(localItems, key) {
        await initSupabase();
        const map = FIELD_MAPS[key];
        const table = tableName(key);
        const items = localItems || [];
        if (!items.length) return;

        const toUpsert = items.map(item => ({ id: item.id, ...appToRow(map, item) }));
        for (let i = 0; i < toUpsert.length; i += 100) {
            checkError(await supabaseClient.from(table).upsert(toUpsert.slice(i, i + 100), { onConflict: 'id' }), 'upsert ' + key);
        }
    }

    // Borra un único registro por id de una tabla de lista.
    // Usar esto (en vez de saveList con el array filtrado) evita que un
    // dispositivo con datos desactualizados borre por error registros
    // nuevos creados por otro dispositivo.
    async function deleteById(id, key) {
        await initSupabase();
        const table = tableName(key);
        checkError(await supabaseClient.from(table).delete().eq('id', id), 'delete ' + key);
    }

    // ---------- SAVE PÚBLICO ----------
    // save(doc): guarda TODO el documento vía upsert (no borra nada que
    // el dispositivo no conozca; ver deleteAll() para el borrado total).
    async function save(doc) {
        await saveSingleRow(doc.profile, 'profile');
        await saveSingleRow(doc.food, 'food');
        const listKeys = ['vaccines', 'deworming', 'controls', 'notes', 'foodChanges', 'weights', 'medications'];
        for (const key of listKeys) {
            await saveList(doc[key] || [], key);
        }
        return true;
    }

    // deleteAll(): borra TODAS las filas de TODAS las tablas.
    // Es un borrado intencional y explícito (botón "Borrar Todo"),
    // a diferencia de saveList/save que nunca borran por comparación.
    async function deleteAll() {
        await initSupabase();
        const listKeys = ['vaccines', 'deworming', 'controls', 'notes', 'foodChanges', 'weights', 'medications'];
        for (const key of listKeys) {
            const table = tableName(key);
            checkError(await supabaseClient.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000'), 'delete all ' + key);
        }
        for (const key of ['profile', 'food']) {
            const table = tableName(key);
            checkError(await supabaseClient.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000'), 'delete all ' + key);
        }
        return true;
    }

    // saveProfile(data): guarda solo profile
    async function saveProfile(data) { return await saveSingleRow(data, 'profile'); }

    // uploadPhoto(file): sube foto a Supabase Storage y retorna la URL pública.
    // Si el bucket no existe o falla, convierte a base64 como fallback.
    async function uploadPhoto(file) {
        await initSupabase();
        const ext = file.name.split('.').pop() || 'jpg';
        const path = 'avatars/' + Date.now() + '.' + ext;
        try {
            const { error: upErr } = checkError(
                await supabaseClient.storage.from('avatars').upload(path, file, { upsert: true }),
                'upload photo'
            );
            if (upErr) throw upErr;
            const { data: urlData } = supabaseClient.storage.from('avatars').getPublicUrl(path);
            return urlData.publicUrl;
        } catch (e) {
            // Fallback: base64 data URL
            console.warn('Storage upload failed, using base64 fallback:', e.message);
            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => resolve(ev.target.result);
                reader.readAsDataURL(file);
            });
        }
    }

    // saveFoodData(data): guarda solo food
    async function saveFoodData(data) { return await saveSingleRow(data, 'food'); }

    // saveVaccines(items): guarda solo vaccines
    async function saveVaccines(items) { return await saveList(items, 'vaccines'); }

    // saveDeworming(items): guarda solo deworming
    async function saveDeworming(items) { return await saveList(items, 'deworming'); }

    // saveControls(items): guarda solo controls
    async function saveControls(items) { return await saveList(items, 'controls'); }

    // saveNotes(items): guarda solo notes
    async function saveNotes(items) { return await saveList(items, 'notes'); }

    // saveFoodChanges(items): guarda solo foodChanges
    async function saveFoodChanges(items) { return await saveList(items, 'foodChanges'); }

    // saveWeights(items): guarda solo weights
    async function saveWeights(items) { return await saveList(items, 'weights'); }

    // saveMedications(items): guarda solo medications
    async function saveMedications(items) { return await saveList(items, 'medications'); }

    // ---------- BORRADO POR ID (seguro para multi-dispositivo) ----------
    async function deleteWeight(id) { return await deleteById(id, 'weights'); }
    async function deleteVaccine(id) { return await deleteById(id, 'vaccines'); }
    async function deleteDeworming(id) { return await deleteById(id, 'deworming'); }
    async function deleteControl(id) { return await deleteById(id, 'controls'); }
    async function deleteNote(id) { return await deleteById(id, 'notes'); }
    async function deleteFoodChange(id) { return await deleteById(id, 'foodChanges'); }
    async function deleteMedication(id) { return await deleteById(id, 'medications'); }

    // ---------- UTILIDADES ----------
    function genId() {
        return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    return {
        get, save, deleteAll, genId, uploadPhoto,
        saveProfile, saveFoodData, saveVaccines, saveDeworming,
        saveControls, saveNotes, saveFoodChanges, saveWeights, saveMedications,
        deleteWeight, deleteVaccine, deleteDeworming, deleteControl,
        deleteNote, deleteFoodChange, deleteMedication
    };
})();

window.DB = DB;

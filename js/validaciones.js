/* ==================================================
   Abrilcita - validaciones.js
   Reglas de validación reutilizables
   ================================================== */

const VALIDATORS = (function () {
    const cfg = () => window.APP_CONFIG.validation;

    // ---------- HELPERS ----------
    function required(value, name) {
        if (!value || !String(value).trim()) {
            return name + ' es obligatorio.';
        }
        return null;
    }

    function email(value, name) {
        if (!value) return null; // opcional
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!re.test(value)) return name + ' no es un email válido.';
        return null;
    }

    function phoneCL(value, name) {
        if (!value) return null; // opcional
        // Permite +56 9 XXXX XXXX o 9XXXXXXXX con espacios/guiones
        const digits = String(value).replace(/\D/g, '');
        if (!/^56?9\d{8}$/.test(digits)) {
            return name + ' debe ser un teléfono chileno válido (ej: +56 9 1234 5678).';
        }
        return null;
    }

    function rut(value, name) {
        if (!value) return null; // opcional
        // Valida RUT chileno completo con dígito verificador
        const clean = String(value).replace(/[^0-9kK-]/g, '');
        if (!/^\d{7,8}-[kK0-9]$/.test(clean)) {
            return name + ' debe tener formato RUT (ej: 12.345.678-K).';
        }
        const [body, dv] = clean.split('-');
        let sum = 0, mult = 2;
        for (let i = body.length - 1; i >= 0; i--) {
            sum += parseInt(body[i], 10) * mult;
            mult = mult === 7 ? 2 : mult + 1;
        }
        const expected = 11 - (sum % 11);
        let expectedDv = expected === 11 ? '0' : (expected === 10 ? 'K' : String(expected));
        return expectedDv.toUpperCase() === dv.toUpperCase() ? null : name + ' no es un RUT válido.';
    }

    function date(value, name) {
        if (!value) return null; // opcional
        if (isNaN(Date.parse(value))) return name + ' no es una fecha válida.';
        return null;
    }

    function birthDate(value, name) {
        const err = date(value, name);
        if (err) return err;
        if (!value) return null;
        const y = new Date(value).getFullYear();
        if (y < cfg().minBirthYear) return 'La fecha de nacimiento debe ser posterior a ' + cfg().minBirthYear + '.';
        if (new Date(value) > new Date()) return 'La fecha de nacimiento no puede ser futura.';
        return null;
    }

    function weightKg(value, name) {
        if (!value) return required(value, name);
        const n = parseFloat(value);
        if (isNaN(n) || n < cfg().minWeightKg || n > cfg().maxWeightKg) {
            return name + ' debe estar entre ' + cfg().minWeightKg + ' y ' + cfg().maxWeightKg + ' kg.';
        }
        return null;
    }

    function costCLP(value, name) {
        if (!value) return null; // opcional
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0 || n > cfg().maxCostCLP) {
            return name + ' debe ser un costo válido en CLP.';
        }
        return null;
    }

    function lengthLimit(value, name, max) {
        if (value && String(value).length > max) {
            return name + ' no debe superar los ' + max + ' caracteres.';
        }
        return null;
    }

    function futureDate(value, name) {
        const err = date(value, name);
        if (err) return err;
        if (value && new Date(value) < new Date()) {
            return name + ' no puede estar en el pasado.';
        }
        return null;
    }

    // ---------- VALIDADORES DE ENTIDADES ----------

    // Perfil de la gatita
    function validateProfile(data) {
        const errors = {};
        const set = (field, msg) => { if (msg) errors[field] = msg; };

        set('name', required(data.name, 'El nombre'));
        set('name', lengthLimit(data.name, 'El nombre', cfg().maxNameLength));
        set('breed', lengthLimit(data.breed, 'La raza', cfg().maxBreedLength));
        set('birth', birthDate(data.birth, 'La fecha de nacimiento'));
        set('weight', weightKg(data.weight, 'El peso'));
        set('sex', (() => { if (data.sex && !['Hembra', 'Macho'].includes(data.sex)) return 'Sexo inválido.'; return null; })());
        set('rut', rut(data.rut, 'El RUT'));
        set('vetPhone', phoneCL(data.vetPhone, 'El teléfono'));
        set('vet', lengthLimit(data.vet, 'La veterinaria', 100));

        return errors;
    }

    // Vacuna
    function validateVaccine(data) {
        const errors = {};
        const set = (field, msg) => { if (msg) errors[field] = msg; };

        set('type', required(data.type, 'El tipo de vacuna'));
        set('date', required(data.date, 'La fecha'));
        set('date', date(data.date, 'La fecha'));
        set('next', (data.next ? (futureDate(data.next, 'El próximo refuerzo')) : null));
        set('cost', costCLP(data.cost, 'El costo'));
        set('lot', lengthLimit(data.lot, 'El lote', 30));
        set('lab', lengthLimit(data.lab, 'El laboratorio', 60));
        set('vet', lengthLimit(data.vet, 'La veterinaria', 100));
        set('notes', lengthLimit(data.notes, 'Las observaciones', 300));

        return errors;
    }

    // Desparasitación
    function validateDeworming(data) {
        const errors = {};
        const set = (field, msg) => { if (msg) errors[field] = msg; };

        set('type', required(data.type, 'El tipo'));
        set('date', required(data.date, 'La fecha'));
        set('date', date(data.date, 'La fecha'));
        set('next', (data.next ? (futureDate(data.next, 'La próxima aplicación')) : null));
        set('product', lengthLimit(data.product, 'El producto', 80));
        set('dose', lengthLimit(data.dose, 'La dosis', 80));
        set('weight', (data.weight ? weightKg(data.weight, 'El peso') : null));
        set('cost', costCLP(data.cost, 'El costo'));

        return errors;
    }

    // Control veterinario
    function validateControl(data) {
        const errors = {};
        const set = (field, msg) => { if (msg) errors[field] = msg; };

        set('type', required(data.type, 'El tipo de control'));
        set('date', required(data.date, 'La fecha'));
        set('date', date(data.date, 'La fecha'));
        set('weight', (data.weight ? weightKg(data.weight, 'El peso') : null));
        set('cost', costCLP(data.cost, 'El costo'));

        return errors;
    }

    // Nota
    function validateNote(data) {
        const errors = {};
        const set = (field, msg) => { if (msg) errors[field] = msg; };
        set('date', required(data.date, 'La fecha'));
        set('title', required(data.title, 'El título'));
        set('title', lengthLimit(data.title, 'El título', 120));
        return errors;
    }

    // Cambio de alimentación
    function validateFoodChange(data) {
        const errors = {};
        const set = (field, msg) => { if (msg) errors[field] = msg; };
        set('date', required(data.date, 'La fecha'));
        set('desc', required(data.desc, 'La descripción'));
        return errors;
    }

    function validateFood(data) {
        const errors = {};
        const set = (field, msg) => { if (msg) errors[field] = msg; };
        set('brand', lengthLimit(data.brand, 'La marca', 80));
        set('amount', lengthLimit(data.amount, 'La dosis', 80));
        return errors;
    }

    function hasErrors(errors) {
        return Object.keys(errors).length > 0;
    }

    function markFields(idPrefix, errors) {
        // Limpia errores previos
        document.querySelectorAll('.field-error').forEach(el => el.remove());
        document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));

        Object.keys(errors).forEach(field => {
            const el = document.getElementById(idPrefix + field);
            if (el) {
                el.classList.add('invalid');
                const err = document.createElement('small');
                err.className = 'field-error';
                err.textContent = errors[field];
                el.parentNode.appendChild(err);
            }
        });
    }

    return {
        validateProfile, validateVaccine, validateDeworming,
        validateControl, validateNote, validateFoodChange, validateFood,
        hasErrors, markFields, required, email, phoneCL, rut,
        date, weightKg, costCLP, futureDate, birthDate
    };
})();

window.VALIDATORS = VALIDATORS;

// ==UserScript==
// @name         CnC-TA-Umsiedlungsrechner-Harzi-Edition
// @namespace    Harzi
// @version      1.0.5
// @description  Berechnet Umsiedlungsstufe, nächste Verlegung und Stufenabbau
// @author       Harzi
// @match        https://*.alliances.commandandconquer.com/*/index.aspx*
// @downloadURL  https://raw.githubusercontent.com/Harzi66/CnC-TA-Umsiedlungsrechner-Harzi-Edition/main/CnC-TA-Umsiedlungsrechner%20-%20Harzi%20Edition.user.js
// @updateURL    https://raw.githubusercontent.com/Harzi66/CnC-TA-Umsiedlungsrechner-Harzi-Edition/main/CnC-TA-Umsiedlungsrechner%20-%20Harzi%20Edition.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = 'Umsiedlungsrechner';

    const LANG_KEY =
        'CnCTA_Umsiedlungsrechner_Language_' +
        window.location.hostname +
        window.location.pathname.split('/')[1];

    const LANGUAGES = {
        de: {
            name: 'Deutsch',
            title: 'Umsiedlungsrechner',
            info: 'Die letzten vier Sektorwechsel eingeben.',
            addJump: '+ Sektorwechsel',
            currentLevel: 'Aktuelle Umsiedlungsstufe:',
            lastJump: 'Letzter Sektorwechsel:',
            nextJump: 'Nächster Sektorwechsel möglich:',
            levelDown: 'Stufenabbau',
            levelChange: 'Stufe {from} → {to}:',
            noJumps: 'Noch keine Sprünge eingetragen.',
            invalidDate: 'Bitte ein gültiges Datum und eine gültige Uhrzeit eingeben.',
            gap: 'Sprung {n} ist leer. Bitte die Sprünge lückenlos eingeben.',
            beforePrevious: 'Dieser Sprung muss nach dem vorherigen Sektorwechsel am {date} liegen.',
            tooEarly: 'Dieser Sektorwechsel ist zu früh. Der nächste Sektorwechsel ist erst am {date} möglich.',
            status: 'SYSTEM STATUS • MANUELLE DATENERFASSUNG • TA'
        },
        en: {
            name: 'English',
            title: 'Relocation Calculator',
            info: 'Enter the last four sector changes.',
            addJump: '+ Sector Change',
            currentLevel: 'Current relocation level:',
            lastJump: 'Last sector change:',
            nextJump: 'Next sector change possible:',
            levelDown: 'Level decrease',
            levelChange: 'Level {from} → {to}:',
            noJumps: 'No sector changes entered yet.',
            invalidDate: 'Please enter a valid date and time.',
            gap: 'Sector change {n} is empty. Please enter the changes without gaps.',
            beforePrevious: 'This sector change must be after the previous sector change on {date}.',
            tooEarly: 'This sector change is too early. The next sector change is only possible on {date}.',
            status: 'SYSTEM STATUS • MANUAL DATA ENTRY • TA'
        },
        es: {
            name: 'Español',
            title: 'Calculadora de reubicación',
            info: 'Introduce los últimos cuatro cambios de sector.',
            addJump: '+ Cambio de sector',
            currentLevel: 'Nivel de reubicación actual:',
            lastJump: 'Último cambio de sector:',
            nextJump: 'Próximo cambio de sector posible:',
            levelDown: 'Descenso de nivel',
            levelChange: 'Nivel {from} → {to}:',
            noJumps: 'Todavía no hay cambios de sector introducidos.',
            invalidDate: 'Introduce una fecha y hora válidas.',
            gap: 'El cambio de sector {n} está vacío. Introduce los cambios sin espacios.',
            beforePrevious: 'Este cambio de sector debe ser posterior al cambio anterior del {date}.',
            tooEarly: 'Este cambio de sector es demasiado pronto. El próximo cambio solo es posible el {date}.',
            status: 'ESTADO DEL SISTEMA • ENTRADA MANUAL DE DATOS • TA'
        },
        fr: {
            name: 'Français',
            title: 'Calculateur de relocalisation',
            info: 'Saisissez les quatre derniers changements de secteur.',
            addJump: '+ Changement de secteur',
            currentLevel: 'Niveau de relocalisation actuel :',
            lastJump: 'Dernier changement de secteur :',
            nextJump: 'Prochain changement de secteur possible :',
            levelDown: 'Diminution du niveau',
            levelChange: 'Niveau {from} → {to} :',
            noJumps: 'Aucun changement de secteur saisi pour le moment.',
            invalidDate: 'Veuillez saisir une date et une heure valides.',
            gap: 'Le changement de secteur {n} est vide. Saisissez les changements sans interruption.',
            beforePrevious: 'Ce changement de secteur doit être postérieur au changement précédent du {date}.',
            tooEarly: 'Ce changement de secteur est trop tôt. Le prochain changement ne sera possible que le {date}.',
            status: 'ÉTAT DU SYSTÈME • SAISIE MANUELLE DES DONNÉES • TA'
        }
    };

    function getLanguage() {
        const saved = localStorage.getItem(LANG_KEY);
        return LANGUAGES[saved] ? saved : 'de';
    }

    function t(key, params = {}) {
        const lang = LANGUAGES[getLanguage()] || LANGUAGES.de;
        let text = lang[key] ?? LANGUAGES.de[key] ?? key;

        Object.keys(params).forEach(name => {
            text = text.replace(
                new RegExp('\\{' + name + '\\}', 'g'),
                String(params[name])
            );
        });

        return text;
    }

    function setLanguage(lang) {
        if (!LANGUAGES[lang]) return;
        localStorage.setItem(LANG_KEY, lang);
        refreshLanguageUI();
    }


    const MAX_LEVEL = 3;
    const LEVEL_DOWN_DAYS = 14;

    const COOLDOWN_DAYS = {
        1: 1,
        2: 3,
        3: 7
    };

    // Vier Sprünge bleiben sichtbar.
    // Ein fünfter darf vorübergehend eingegeben werden.
    // Erst wenn er gültig ist, verschwindet der älteste.
    const MAX_VISIBLE_JUMPS = 4;

    const STORAGE_KEY =
        'CnCTA_Umsiedlungsrechner_Jumps_' +
        window.location.hostname +
        window.location.pathname.split('/')[1];

    // =========================================================
    // HILFSFUNKTIONEN
    // =========================================================

    function formatDate(date) {
        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');

        return `${d}.${m}.${y} ${h}:${min}`;
    }

    function addDays(date, days) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    function parseDate(value) {
        if (!value) return null;

        const parts = value.split('T');
        if (parts.length !== 2) return null;

        const datePart = parts[0].split('-');
        const timePart = parts[1].split(':');

        if (datePart.length !== 3 || timePart.length < 2) {
            return null;
        }

        const date = new Date(
            Number(datePart[0]),
            Number(datePart[1]) - 1,
            Number(datePart[2]),
            Number(timePart[0]),
            Number(timePart[1])
        );

        if (isNaN(date.getTime())) return null;

        return date;
    }

    function dateToInputValue(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');

        return `${y}-${m}-${d}T${h}:${min}`;
    }

    // =========================================================
    // SPEICHERN / LADEN
    // =========================================================

    function loadJumps() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);

            if (!saved) return [];

            const values = JSON.parse(saved);

            if (!Array.isArray(values)) return [];

            return values
                .map(value => new Date(value))
                .filter(date => !isNaN(date.getTime()))
                .sort((a, b) => a - b);

        } catch (e) {
            console.error(
                '[Umsiedlungsrechner] Fehler beim Laden:',
                e
            );
            return [];
        }
    }

    function saveJumps(jumps) {
        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(
                    jumps.map(jump => jump.toISOString())
                )
            );
        } catch (e) {
            console.error(
                '[Umsiedlungsrechner] Fehler beim Speichern:',
                e
            );
        }
    }

    // =========================================================
    // STUFE BERECHNEN
    // =========================================================

    function calculate(jumps) {
        if (jumps.length === 0) {
            return {
                level: 0,
                lastJump: null,
                nextJump: null,
                levelChanges: []
            };
        }

        const sortedJumps = [...jumps].sort((a, b) => a - b);

        let level = 0;
        let lastJump = null;

        for (const jump of sortedJumps) {
            if (lastJump !== null) {
                const elapsed =
                    jump.getTime() - lastJump.getTime();

                const days = Math.floor(
                    elapsed / (1000 * 60 * 60 * 24)
                );

                const decayCount = Math.floor(
                    days / LEVEL_DOWN_DAYS
                );

                level = Math.max(
                    0,
                    level - decayCount
                );
            }

            level = Math.min(
                MAX_LEVEL,
                level + 1
            );

            lastJump = jump;
        }

        const cooldownDays =
            COOLDOWN_DAYS[level] || 0;

        const nextJump =
            addDays(lastJump, cooldownDays);

        const levelChanges = [];

        if (level > 0) {
            let tempLevel = level;
            let changeDate =
                addDays(lastJump, LEVEL_DOWN_DAYS);

            while (tempLevel > 0) {
                const from = tempLevel;
                tempLevel--;

                levelChanges.push({
                    from: from,
                    to: tempLevel,
                    date: new Date(changeDate)
                });

                changeDate =
                    addDays(changeDate, LEVEL_DOWN_DAYS);
            }
        }

        return {
            level: level,
            lastJump: lastJump,
            nextJump: nextJump,
            levelChanges: levelChanges
        };
    }

    // =========================================================
    // HISTORIE VORBEREITEN
    // =========================================================

    function getOldHistory() {
        const stored = loadJumps();

        // Die letzten vier gespeicherten Sprünge sind die,
        // die aktuell im Fenster angezeigt werden.
        // Sie werden bei einer neuen Eingabe komplett durch
        // die aktuelle Eingabe ersetzt.
        if (stored.length <= MAX_VISIBLE_JUMPS) {
            return [];
        }

        return stored.slice(
            0,
            stored.length - MAX_VISIBLE_JUMPS
        );
    }

    // =========================================================
    // EINGABEN LESEN
    // =========================================================

    function readRows() {
        const rows = [
            ...document.querySelectorAll(
                '#ur-jumps .ur-row'
            )
        ];

        return rows.map(row => {
            const input =
                row.querySelector('.ur-date');

            return {
                row: row,
                input: input,
                value: input.value,
                date: input.value
                    ? parseDate(input.value)
                    : null
            };
        });
    }

    // =========================================================
    // PRÜFUNG DER AKTUELLEN EINGABEN
    // =========================================================

    function validateRows(rows) {
        const entries = [];

        for (let i = 0; i < rows.length; i++) {
            const item = rows[i];

            // Leere Zeilen am Ende sind erlaubt.
            if (!item.value) {
                if (
                    rows
                        .slice(i + 1)
                        .some(row => row.value)
                ) {
                    return {
                        valid: false,
                        row: item.row,
                        message: t('gap', { n: i + 1 })
                    };
                }

                break;
            }

            if (!item.date) {
                return {
                    valid: false,
                    row: item.row,
                    message: t('invalidDate')
                };
            }

            entries.push({
                row: item.row,
                date: item.date
            });
        }

        if (entries.length === 0) {
            return {
                valid: true,
                complete: false,
                entries: []
            };
        }

        // -----------------------------------------------------
        // Alte Historie = alles VOR den aktuell sichtbaren
        // Sprüngen. Dadurch wird kein sichtbarer Sprung doppelt
        // als alte Historie verwendet.
        // -----------------------------------------------------

        const history = getOldHistory();

        const testHistory = [...history];

        // -----------------------------------------------------
        // Jeden sichtbaren Sprung nacheinander prüfen.
        // -----------------------------------------------------

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const newJump = entry.date;

            const state =
                calculate(testHistory);

            // Chronologie
            if (state.lastJump) {
                if (
                    newJump.getTime() <=
                    state.lastJump.getTime()
                ) {
                    return {
                        valid: false,
                        row: entry.row,
                        message: t('beforePrevious', { date: formatDate(state.lastJump) })
                    };
                }

                // Frühester möglicher neuer Sprung
                if (
                    state.nextJump &&
                    newJump.getTime() <
                    state.nextJump.getTime()
                ) {
                    return {
                        valid: false,
                        row: entry.row,
                        message: t('tooEarly', { date: formatDate(state.nextJump) })
                    };
                }
            }

            // Der geprüfte Sprung wird jetzt Bestandteil
            // der Prüfung des nächsten Sprunges.
            testHistory.push(newJump);
            testHistory.sort((a, b) => a - b);
        }

        return {
            valid: true,
            complete:
                entries.length >= MAX_VISIBLE_JUMPS ||
                rows.length <= MAX_VISIBLE_JUMPS,
            entries: entries
        };
    }

    // =========================================================
    // WARNUNG
    // =========================================================

    function showWarning(message, row = null) {
        const warning =
            document.getElementById('ur-warning');

        if (!warning) return;

        warning.textContent = message;
        warning.style.display = 'block';

        document
            .querySelectorAll('.ur-date-error')
            .forEach(input =>
                input.classList.remove(
                    'ur-date-error'
                )
            );

        if (row) {
            const input =
                row.querySelector('.ur-date');

            if (input) {
                input.classList.add(
                    'ur-date-error'
                );
            }
        }
    }

    function hideWarning() {
        const warning =
            document.getElementById('ur-warning');

        if (!warning) return;

        warning.textContent = '';
        warning.style.display = 'none';

        document
            .querySelectorAll('.ur-date-error')
            .forEach(input =>
                input.classList.remove(
                    'ur-date-error'
                )
            );
    }

    // =========================================================
    // EINGABEN VERARBEITEN
    // =========================================================

    function processInput() {
        const rows = readRows();
        const validation = validateRows(rows);

        if (!validation.valid) {
            showWarning(
                validation.message,
                validation.row
            );

            return;
        }

        hideWarning();

        const entries = validation.entries;

        if (entries.length === 0) {
            showResult({
                level: 0,
                lastJump: null,
                nextJump: null,
                levelChanges: []
            });

            return;
        }

        // -----------------------------------------------------
        // Die aktuell sichtbaren Eingaben werden IMMER
        // gespeichert, sobald sie gültig sind.
        //
        // Dadurch bleibt z.B. auch ein einzelner neu
        // eingetragener Sprung nach dem erneuten Öffnen erhalten.
        //
        // Ausnahme:
        // Wenn bereits 4 Zeilen vorhanden sind und mit
        // "+ Sektorwechsel" eine 5. leere Zeile angelegt wurde,
        // warten wir natürlich auf deren Eingabe.
        // -----------------------------------------------------

        if (
            rows.length > MAX_VISIBLE_JUMPS &&
            entries.length <= MAX_VISIBLE_JUMPS
        ) {
            const history = getOldHistory();

            showResult(
                calculate(
                    history.concat(
                        entries.map(
                            entry => entry.date
                        )
                    )
                )
            );

            return;
        }

        // -----------------------------------------------------
        // Gültige aktuelle Eingaben speichern.
        //
        // getOldHistory() enthält ausschließlich die älteren
        // Sprünge, die NICHT mehr in den aktuell sichtbaren
        // vier Zeilen stehen.
        //
        // Bei 1, 2, 3 oder 4 sichtbaren Sprüngen werden diese
        // deshalb jetzt ebenfalls sofort gespeichert.
        //
        // Erst bei einem gültigen 5. Sprung wird anschließend
        // die Anzeige auf die letzten 4 reduziert.
        // -----------------------------------------------------

        const history = getOldHistory();

        let allJumps =
            history.concat(
                entries.map(
                    entry => entry.date
                )
            );

        allJumps.sort(
            (a, b) => a - b
        );

        // Doppelte Einträge entfernen
        allJumps = allJumps.filter(
            (date, index, array) =>
                index === 0 ||
                date.getTime() !==
                array[index - 1].getTime()
        );

        saveJumps(allJumps);

        // Nach erfolgreicher Speicherung nur die letzten
        // vier Sprünge anzeigen.
        renderVisibleJumps(
            allJumps.slice(-MAX_VISIBLE_JUMPS)
        );

        showResult(
            calculate(allJumps)
        );
    }

    // =========================================================
    // SICHTBARE SPRÜNGE NEU ZEICHNEN
    // =========================================================

    function renderVisibleJumps(jumps) {
        const container =
            document.getElementById('ur-jumps');

        if (!container) return;

        container.innerHTML = '';

        jumps.forEach(jump =>
            addJumpRow(jump)
        );

        renumberRows();
    }

    // =========================================================
    // FENSTER
    // =========================================================

    function createWindow() {
        const old =
            document.getElementById(
                'harzi-umsiedlungsrechner'
            );

        if (old) {
            old.remove();
            return;
        }

        const overlay =
            document.createElement('div');

        overlay.id =
            'harzi-umsiedlungsrechner';

        overlay.innerHTML = `
            <div class="ur-window">

                <div class="ur-header">
                    <span id="ur-title">Umsiedlungsrechner</span>

                    <select
                        id="ur-language"
                        class="ur-language"
                        title="Language"
                    >
                        <option value="de">DE</option>
                        <option value="en">EN</option>
                        <option value="es">ES</option>
                        <option value="fr">FR</option>
                    </select>

                    <button id="ur-close">
                        ×
                    </button>
                </div>

                <div class="ur-content">

                    <div
                        id="ur-info"
                        class="ur-info"
                    ></div>

                    <div
                        id="ur-warning"
                        class="ur-warning"
                        style="display:none;"
                    ></div>

                    <div
                        id="ur-jumps"
                        class="ur-jumps"
                    ></div>

                    <button
                        id="ur-add"
                        class="ur-button"
                    ></button>

                    <div id="ur-result"></div>

                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        addStyles();

        document.getElementById(
            'ur-close'
        ).onclick = () => overlay.remove();

        document.getElementById(
            'ur-add'
        ).onclick = () => addJumpRow();

        document.getElementById(
            'ur-language'
        ).value = getLanguage();

        document.getElementById(
            'ur-language'
        ).onchange = function () {
            setLanguage(this.value);
        };

        const jumps = loadJumps();

        const visible =
            jumps.slice(-MAX_VISIBLE_JUMPS);

        if (visible.length === 0) {
            addJumpRow();
        } else {
            visible.forEach(jump =>
                addJumpRow(jump)
            );
        }

        showResult(
            calculate(jumps)
        );

        refreshLanguageUI();
    }

    // =========================================================
    // SPRACHE AKTUALISIEREN
    // =========================================================

    function refreshLanguageUI() {
        const windowElement =
            document.getElementById('harzi-umsiedlungsrechner');

        if (!windowElement) return;

        const title =
            document.getElementById('ur-title');

        const info =
            document.getElementById('ur-info');

        const addButton =
            document.getElementById('ur-add');

        const content =
            windowElement.querySelector('.ur-content');

        if (content) {
            content.setAttribute(
                'data-status',
                t('status')
            );
        }

        const language =
            document.getElementById('ur-language');

        if (title) {
            title.textContent = (LANGUAGES[getLanguage()] || LANGUAGES.de).title;
        }

        if (info) {
            info.textContent = t('info');
        }

        if (addButton) {
            addButton.textContent = t('addJump');
        }

        if (language) {
            language.value = getLanguage();
        }

        const rows = readRows();
        rows.forEach((item, index) => {
            const label =
                item.row.querySelector('.ur-jump-number');

            if (label) {
                label.textContent =
                    `${getLanguage() === 'de' ? 'Sprung' :
                      getLanguage() === 'en' ? 'Change' :
                      getLanguage() === 'es' ? 'Cambio' : 'Changement'} ${index + 1}:`;
            }
        });

        const footer =
            windowElement.querySelector('.ur-content::after');

        showResult(calculate(loadJumps()));
    }

    // =========================================================
    // EINGABEZEILE
    // =========================================================

    function addJumpRow(existingDate = null) {
        const container =
            document.getElementById('ur-jumps');

        if (!container) return;

        const row =
            document.createElement('div');

        row.className = 'ur-row';

        row.innerHTML = `
            <span class="ur-jump-number">
                Sprung
            </span>

            <input
                type="datetime-local"
                class="ur-date"
            >

            <button
                class="ur-delete"
                title="Eintrag löschen"
            >
                ×
            </button>
        `;

        const input =
            row.querySelector('.ur-date');

        if (existingDate) {
            input.value =
                dateToInputValue(existingDate);
        }

        input.addEventListener(
            'change',
            processInput
        );

        row.querySelector(
            '.ur-delete'
        ).onclick = () => {
            row.remove();
            renumberRows();
            processInput();
        };

        container.appendChild(row);

        renumberRows();
    }

    // =========================================================
    // NUMMERIERUNG
    // =========================================================

    function renumberRows() {
        const rows = [
            ...document.querySelectorAll(
                '#ur-jumps .ur-row'
            )
        ];

        rows.forEach((row, index) => {
            const label =
                row.querySelector(
                    '.ur-jump-number'
                );

            const prefix =
                getLanguage() === 'de' ? 'Sprung' :
                getLanguage() === 'en' ? 'Change' :
                getLanguage() === 'es' ? 'Cambio' :
                'Changement';

            label.textContent =
                `${prefix} ${index + 1}:`;
        });
    }

    // =========================================================
    // ERGEBNIS
    // =========================================================

    function showResult(result) {
        const output =
            document.getElementById(
                'ur-result'
            );

        if (!output) return;

        if (!result.lastJump) {
            output.innerHTML = `
                <div class="ur-result-box">
                    <div class="ur-level">
                        ${t('currentLevel')}
                        <b>0</b>
                    </div>

                    <div>
                        ${t('noJumps')}
                    </div>
                </div>
            `;
            return;
        }

        let html = `
            <div class="ur-result-box">

                <div class="ur-level">
                    ${t('currentLevel')}
                    <b>${result.level}</b>
                </div>

                <div class="ur-line">
                    ${t('lastJump')}
                    <b>
                        ${formatDate(result.lastJump)}
                    </b>
                </div>
        `;

        if (result.nextJump) {
            html += `
                <div class="ur-line ur-highlight">
                    Nächster Sektorwechsel möglich:
                    <b>
                        ${formatDate(result.nextJump)}
                    </b>
                </div>
            `;
        }

        if (result.levelChanges.length > 0) {
            html += `
                <div class="ur-subtitle">
                    ${t('levelDown')}
                </div>
            `;

            result.levelChanges.forEach(change => {
                html += `
                    <div class="ur-line">
                        ${t('levelChange', {
                            from: change.from,
                            to: change.to
                        })}
                        <b>
                            ${formatDate(change.date)}
                        </b>
                    </div>
                `;
            });
        }

        html += `</div>`;

        output.innerHTML = html;
    }

    // =========================================================
    // CSS
    // =========================================================

    function addStyles() {
        if (document.getElementById('ur-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'ur-styles';

        style.textContent = `
            /* =================================================
               C&C TA / TIBERIUM STYLE
               ================================================= */

            #harzi-umsiedlungsrechner {
                position: fixed;
                inset: 0;
                z-index: 999999;
                background:
                    radial-gradient(
                        circle at 50% 30%,
                        rgba(38, 95, 45, 0.16),
                        rgba(0, 0, 0, 0.72) 62%
                    );
                font-family:
                    "Trebuchet MS",
                    Arial,
                    sans-serif;
                color: #d7e2d8;
            }

            .ur-window {
                position: absolute;
                width: 620px;
                max-width: calc(100vw - 30px);
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);

                background:
                    linear-gradient(
                        145deg,
                        #17201c 0%,
                        #0b1110 48%,
                        #151d19 100%
                    );

                border: 1px solid #42684a;
                outline: 1px solid #101612;

                box-shadow:
                    0 0 0 2px rgba(0,0,0,0.75),
                    0 0 28px rgba(72, 190, 78, 0.18),
                    0 18px 60px rgba(0,0,0,0.75);

                overflow: hidden;
            }

            /* obere technische Leiste */
            .ur-window::before {
                content: "";
                display: block;
                height: 3px;
                background:
                    linear-gradient(
                        90deg,
                        #1b5426,
                        #72d34d,
                        #1b5426
                    );
                box-shadow:
                    0 0 10px rgba(94, 215, 80, 0.45);
            }

            .ur-header {
                height: 54px;
                line-height: 54px;
                padding-left: 66px;

                position: relative;

                background:
                    linear-gradient(
                        180deg,
                        #202a26,
                        #111714
                    );

                border-bottom:
                    1px solid #35523b;

                color: #8ee96b;

                font-size: 22px;
                letter-spacing: 1.4px;
                font-weight: bold;
                text-transform: uppercase;

                text-shadow:
                    0 0 8px rgba(91, 229, 76, 0.45);
            }

            /* kleines Tiberium-Emblem */
            .ur-header::before {
                content: "◆";
                position: absolute;
                left: 20px;
                top: 6px;

                width: 34px;
                height: 42px;

                color: #75dc5b;
                font-size: 34px;
                line-height: 42px;
                text-align: center;

                text-shadow:
                    0 0 5px #62d34f,
                    0 0 14px rgba(86, 224, 75, 0.65);
            }

            .ur-language {
                position: absolute;
                right: 54px;
                top: 0;

                width: 86px;
                height: 54px;

                padding: 0 10px;

                border: 0;
                border-left: 1px solid #304a36;
                border-right: 1px solid #304a36;

                background:
                    linear-gradient(
                        180deg,
                        #1b2521,
                        #101613
                    );

                color: #8fe96d;

                font-family: Arial, sans-serif;
                font-size: 12px;
                font-weight: bold;
                letter-spacing: 1px;

                text-align: center;

                outline: none;
                cursor: pointer;
            }

            .ur-language:hover,
            .ur-language:focus {
                background: #26382c;
                color: #b2ff92;
            }

            .ur-language option {
                background: #101613;
                color: #d7e2d8;
            }

            .ur-header button {
                float: right;
                width: 54px;
                height: 54px;

                border: 0;
                border-left: 1px solid #304a36;

                background:
                    linear-gradient(
                        180deg,
                        #1b2521,
                        #101613
                    );

                color: #7fe05e;
                font-size: 25px;
                font-weight: bold;

                cursor: pointer;

                text-shadow:
                    0 0 8px rgba(91, 229, 76, 0.55);
            }

            .ur-header button:hover {
                background: #26382c;
                color: #b2ff92;
            }

            .ur-content {
                padding: 20px 22px 22px;
            }

            .ur-info {
                margin-bottom: 16px;

                color: #aab8ad;
                font-size: 14px;
                letter-spacing: 0.4px;
            }

            /* Eingabezeilen */
            .ur-row {
                display: flex;
                align-items: center;
                gap: 8px;

                margin-bottom: 9px;
                padding: 6px 7px 6px 10px;

                background:
                    linear-gradient(
                        90deg,
                        rgba(40, 66, 47, 0.58),
                        rgba(13, 21, 17, 0.72)
                    );

                border: 1px solid #294331;
                border-left: 3px solid #3d7d47;

                box-shadow:
                    inset 0 1px rgba(255,255,255,0.025);
            }

            .ur-row:hover {
                border-left-color: #75dc5b;
                box-shadow:
                    0 0 10px rgba(83, 190, 78, 0.08);
            }

            .ur-jump-number {
                width: 82px;
                flex: 0 0 82px;

                color: #8de66e;
                font-size: 14px;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ur-date {
                flex: 1;
                min-width: 0;
                height: 36px;
                box-sizing: border-box;

                padding: 0 9px;

                color: #d9e6da;

                background:
                    linear-gradient(
                        180deg,
                        #111915,
                        #080d0b
                    );

                border: 1px solid #45624b;

                font-family:
                    Consolas,
                    "Courier New",
                    monospace;

                font-size: 14px;

                outline: none;
            }

            .ur-date:focus {
                border-color: #6bc45a;
                box-shadow:
                    0 0 0 1px #294d2d,
                    0 0 10px rgba(91, 219, 80, 0.18);
            }

            /* Kalender-Button des nativen Datumsfeldes */
            .ur-date::-webkit-calendar-picker-indicator {
                filter:
                    invert(72%)
                    sepia(35%)
                    saturate(700%)
                    hue-rotate(65deg);
                cursor: pointer;
            }

            .ur-date-error {
                border: 2px solid #d9574e !important;
                background:
                    linear-gradient(
                        180deg,
                        #291513,
                        #160b0a
                    ) !important;
                box-shadow:
                    0 0 10px rgba(210, 70, 60, 0.22);
            }

            .ur-delete {
                width: 36px;
                height: 36px;
                flex: 0 0 36px;

                border: 1px solid #4b5c51;

                background:
                    linear-gradient(
                        180deg,
                        #242d29,
                        #111613
                    );

                color: #b9c5bc;
                font-size: 17px;
                cursor: pointer;
            }

            .ur-delete:hover {
                color: #ff766b;
                border-color: #a84b45;
                background: #301815;
            }

            /* Hauptbutton */
            .ur-button {
                width: 100%;
                height: 42px;

                margin-top: 7px;

                border: 1px solid #4d9655;

                background:
                    linear-gradient(
                        180deg,
                        #1b3b22,
                        #102417
                    );

                color: #8eea6c;

                font-size: 14px;
                font-weight: bold;
                letter-spacing: 1px;
                text-transform: uppercase;

                cursor: pointer;

                text-shadow:
                    0 0 6px rgba(91, 229, 76, 0.35);

                box-shadow:
                    inset 0 1px rgba(142, 234, 108, 0.08),
                    0 0 8px rgba(72, 190, 78, 0.06);
            }

            .ur-button:hover {
                border-color: #7bd968;
                background:
                    linear-gradient(
                        180deg,
                        #28582f,
                        #17381e
                    );
                box-shadow:
                    0 0 14px rgba(91, 229, 76, 0.18);
            }

            /* Warnung */
            .ur-warning {
                margin-bottom: 13px;
                padding: 11px 13px;

                background:
                    linear-gradient(
                        90deg,
                        #321817,
                        #1d100f
                    );

                border: 1px solid #a84c45;
                border-left: 4px solid #e05b51;

                color: #ff9b91;

                font-size: 13px;
                font-weight: bold;
                line-height: 1.45;

                box-shadow:
                    inset 0 0 15px rgba(150, 45, 40, 0.08);
            }

            /* Ergebnisbereich */
            .ur-result-box {
                margin-top: 18px;
                padding: 17px;

                background:
                    linear-gradient(
                        145deg,
                        #111a15,
                        #0a100d
                    );

                border: 1px solid #3c5d43;

                box-shadow:
                    inset 0 0 22px rgba(57, 133, 63, 0.045);
            }

            .ur-level {
                position: relative;

                margin-bottom: 14px;
                padding-bottom: 12px;

                border-bottom:
                    1px solid #2b4431;

                color: #8fe96d;

                font-size: 18px;
                font-weight: bold;
                letter-spacing: 0.4px;
                text-transform: uppercase;

                text-shadow:
                    0 0 7px rgba(91, 229, 76, 0.22);
            }

            .ur-level b {
                display: inline-block;

                min-width: 34px;
                margin-left: 7px;
                padding: 3px 9px;

                text-align: center;

                color: #0a120b;

                background:
                    linear-gradient(
                        180deg,
                        #9cf278,
                        #55bd48
                    );

                border: 1px solid #a8ff91;

                box-shadow:
                    0 0 10px rgba(91, 229, 76, 0.28);
            }

            .ur-line {
                padding: 6px 0;

                color: #aebbb1;
                font-size: 14px;
            }

            .ur-line b {
                color: #dbe8dc;
                font-family:
                    Consolas,
                    "Courier New",
                    monospace;
            }

            .ur-highlight {
                margin-top: 8px;
                padding: 11px 12px;

                background:
                    linear-gradient(
                        90deg,
                        rgba(35, 91, 42, 0.72),
                        rgba(22, 54, 28, 0.42)
                    );

                border: 1px solid #3c7443;
                border-left: 3px solid #70d65b;

                color: #c3d7c6;
            }

            .ur-highlight b {
                color: #91ed70;
                text-shadow:
                    0 0 7px rgba(91, 229, 76, 0.25);
            }

            .ur-subtitle {
                margin-top: 15px;
                padding: 11px 0 9px;

                border-top: 1px solid #304a35;

                color: #8fe96d;

                font-size: 14px;
                font-weight: bold;
                letter-spacing: 1px;
                text-transform: uppercase;
            }

            /* Kleine Timeline-Anmutung */
            .ur-subtitle + .ur-line {
                border-left: 2px solid #4d9655;
                padding-left: 10px;
            }

            .ur-subtitle ~ .ur-line {
                position: relative;
            }

            /* dezente technische Fußnote */
            .ur-content::after {
                content:
                    "SYSTEM STATUS  •  MANUELLE DATENERFASSUNG  •  TA";
                display: block;

                margin-top: 18px;
                padding-top: 10px;

                border-top: 1px solid #203526;

                color: #52675a;
                font-size: 9px;
                letter-spacing: 1.4px;
                text-align: right;
            }

            @media (max-width: 680px) {
                .ur-window {
                    width: calc(100vw - 20px);
                }

                .ur-content {
                    padding: 15px;
                }

                .ur-header {
                    font-size: 18px;
                    padding-left: 55px;
                }

                .ur-language {
                    width: 68px;
                    right: 42px;
                }

                .ur-jump-number {
                    width: 68px;
                    flex-basis: 68px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    // =========================================================
    // SCRIPTE-MENÜ
    // =========================================================

    const SCRIPT_ICON =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    let qxApp = null;

    function addScriptsMenuEntry() {
        try {
            const scriptsButton =
                qxApp
                    .getMenuBar()
                    .getScriptsButton();

            scriptsButton.Add(
                SCRIPT_NAME,
                SCRIPT_ICON
            );

            const menu =
                scriptsButton.getMenu();

            if (!menu) {
                console.log(
                    '[Umsiedlungsrechner] Scripte-Menü nicht gefunden.'
                );
                return;
            }

            const menuItem =
                menu.getChildren().find(
                    item =>
                        item.getLabel &&
                        item.getLabel() ===
                        SCRIPT_NAME
                );

            if (!menuItem) {
                console.log(
                    '[Umsiedlungsrechner] Menüeintrag nicht gefunden.'
                );
                return;
            }

            menuItem.addListener(
                'execute',
                function () {
                    createWindow();
                },
                this
            );

            console.log(
                '[Umsiedlungsrechner] Menüeintrag erfolgreich hinzugefügt.'
            );

        } catch (e) {
            console.error(
                '[Umsiedlungsrechner] Fehler beim Scripte-Menü:',
                e
            );
        }
    }

    // =========================================================
    // AUF SPIEL WARTEN
    // =========================================================

    function waitForGame() {
        try {
            if (
                typeof qx === 'undefined' ||
                typeof ClientLib === 'undefined'
            ) {
                setTimeout(waitForGame, 1000);
                return;
            }

            if (
                !qx.core ||
                !qx.core.Init ||
                !qx.core.Init.getApplication
            ) {
                setTimeout(waitForGame, 1000);
                return;
            }

            qxApp =
                qx.core.Init.getApplication();

            if (!qxApp) {
                setTimeout(waitForGame, 1000);
                return;
            }

            if (
                !qxApp.getMenuBar ||
                !qxApp.getMenuBar()
            ) {
                setTimeout(waitForGame, 1000);
                return;
            }

            if (
                !qxApp
                    .getMenuBar()
                    .getScriptsButton()
            ) {
                setTimeout(waitForGame, 1000);
                return;
            }

            addScriptsMenuEntry();

        } catch (e) {
            console.error(
                '[Umsiedlungsrechner] Initialisierungsfehler:',
                e
            );

            setTimeout(waitForGame, 1000);
        }
    }

    // =========================================================
    // START
    // =========================================================

    waitForGame();

})();

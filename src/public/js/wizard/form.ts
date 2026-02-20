/**
 * Wizard form page - Step navigation, validation, draft persistence,
 * game metadata search, and Select2 initialization.
 *
 * Server data is passed via data-attributes on #wizardForm:
 *   data-steps     – JSON array of { id, optional } objects
 *   data-entity    – entity type string (e.g. "location", "item", "game")
 *   data-is-game   – "true" when entity type is game
 */

import {setCurrentNavLocation} from '../core/navigation';
import {get} from '../core/http';

declare const $: any;

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

interface StepDef {
    id: string;
    optional: boolean;
}

interface MetadataOption {
    provider: string;
    externalId: string;
    name: string;
    coverImageUrl?: string;
    releaseDate?: string;
}

interface MetadataDetail {
    description?: string;
    playerInfo?: {
        overallMinPlayers?: number;
        overallMaxPlayers?: number;
        supportsOnline?: boolean;
        supportsLocalCouch?: boolean;
        supportsLocalLAN?: boolean;
        supportsPhysical?: boolean;
        onlineMinPlayers?: number;
        onlineMaxPlayers?: number;
        couchMinPlayers?: number;
        couchMaxPlayers?: number;
        lanMinPlayers?: number;
        lanMaxPlayers?: number;
        physicalMinPlayers?: number;
        physicalMaxPlayers?: number;
    };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function qs<T extends HTMLElement>(sel: string): T | null {
    return document.querySelector<T>(sel);
}

function qsAll<T extends HTMLElement>(sel: string): NodeListOf<T> {
    return document.querySelectorAll<T>(sel);
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  Core wizard engine                                                 */
/* ------------------------------------------------------------------ */

function initWizard(steps: StepDef[], entityType: string, isGame: boolean): void {
    const form = qs<HTMLFormElement>('#wizardForm');
    const btnNext = qs<HTMLButtonElement>('#btnNext');
    const btnBack = qs<HTMLButtonElement>('#btnBack');
    const btnSkip = qs<HTMLButtonElement>('#btnSkip');
    const btnSubmit = qs<HTMLButtonElement>('#btnSubmit');
    if (!form || !btnNext || !btnBack || !btnSkip || !btnSubmit) return;

    const allStepEls = qsAll<HTMLElement>('.wizard-step');
    const indicators = qsAll<HTMLElement>('.wizard-step-indicator');
    let currentStep = 0;

    /* -- step navigation ------------------------------------------ */

    function showStep(idx: number): void {
        currentStep = idx;
        allStepEls.forEach((el, i) => el.classList.toggle('d-none', i !== idx));

        indicators.forEach((ind, i) => {
            const badge = ind.querySelector('[data-badge]');
            const label = ind.querySelector('[data-label]');
            if (!badge || !label) return;
            if (i < idx) {
                badge.className = 'badge rounded-pill me-1 bg-success';
                label.className = 'small text-white';
            } else if (i === idx) {
                badge.className = 'badge rounded-pill me-1 bg-primary';
                label.className = 'small text-white';
            } else {
                badge.className = 'badge rounded-pill me-1 bg-secondary';
                label.className = 'small text-white-50';
            }
        });

        btnBack.classList.toggle('d-none', idx === 0);
        const isLast = idx === steps.length - 1;
        btnNext.classList.toggle('d-none', isLast);
        btnSkip.classList.toggle('d-none', isLast || !steps[idx].optional);
        btnSubmit.classList.toggle('d-none', !isLast);
        if (isLast) buildReview();
    }

    /* -- validation ------------------------------------------------ */

    function validateCurrentStep(): boolean {
        const stepEl = allStepEls[currentStep];
        const required = stepEl.querySelectorAll<HTMLInputElement>('[required]');
        for (const el of required) {
            if (!el.value || !el.value.trim()) {
                el.focus();
                el.classList.add('is-invalid');
                return false;
            }
            el.classList.remove('is-invalid');
        }
        return true;
    }

    /* -- review ---------------------------------------------------- */

    function buildReview(): void {
        const tbody = qs<HTMLElement>('#reviewContent');
        if (!tbody) return;
        tbody.innerHTML = '';

        const copyTypeEl = qs<HTMLSelectElement>('#copyType');
        const isPhysicalCopy = copyTypeEl ? copyTypeEl.value === 'physical_copy' : true;

        const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input:not([type=radio]):not([type=checkbox]):not([type=hidden]), select, textarea'
        );
        inputs.forEach(input => {
            let val = input.value;
            if (!val || !val.trim()) return;
            // Skip hidden inline fields if not applicable
            if (input.name === 'newLocationName' || input.name === 'newLocationKind') {
                const radio = form.querySelector<HTMLInputElement>('input[name="locationChoice"]:checked');
                if (!radio || radio.value !== 'new') return;
            }
            if (input.name === 'locationId') {
                const radio = form.querySelector<HTMLInputElement>('input[name="locationChoice"]:checked');
                if (radio && radio.value !== 'existing') return;
                if (copyTypeEl && !isPhysicalCopy) return;
            }
            if (input.name === 'locationChoice') return;
            if (input.id === 'metadataSearchQuery') return;
            if (input.name === 'externalAccountId' && isPhysicalCopy) return;
            if (input.name === 'condition' && !isPhysicalCopy) return;
            if ((input.name === 'barcode' || input.name === 'barcodeSymbology') && !isPhysicalCopy) return;

            const label = form.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
            let labelText = label ? label.textContent!.replace(/\*/g, '').trim() : input.name;

            if (input.tagName === 'SELECT') {
                const sel = input as HTMLSelectElement;
                if (sel.selectedIndex >= 0) val = sel.options[sel.selectedIndex].text;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="text-white-50">${labelText}</td><td class="text-white">${escapeHtml(val)}</td>`;
            tbody.appendChild(tr);
        });

        // Checked checkboxes
        form.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked').forEach(cb => {
            const label = form.querySelector<HTMLLabelElement>(`label[for="${cb.id}"]`);
            const labelText = label ? label.textContent!.trim() : cb.name;
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="text-white-50">${escapeHtml(labelText)}</td><td class="text-white">Yes</td>`;
            tbody.appendChild(tr);
        });

        // Metadata source
        const metaProviderVal = qs<HTMLInputElement>('#metadataProviderId');
        if (metaProviderVal && metaProviderVal.value) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td class="text-white-50">Metadata Source</td><td class="text-white">${escapeHtml(metaProviderVal.value)}</td>`;
            tbody.appendChild(tr);
        }

        if (!tbody.children.length) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td class="text-white-50" colspan="2">No data entered yet.</td>';
            tbody.appendChild(tr);
        }
    }

    /* -- button handlers ------------------------------------------- */

    btnNext.addEventListener('click', () => {
        if (!validateCurrentStep()) return;
        if (currentStep < steps.length - 1) showStep(currentStep + 1);
    });
    btnBack.addEventListener('click', () => { if (currentStep > 0) showStep(currentStep - 1); });
    btnSkip.addEventListener('click', () => { if (currentStep < steps.length - 1) showStep(currentStep + 1); });

    /* -- item wizard: location choice toggle ----------------------- */

    qsAll<HTMLInputElement>('input[name="locationChoice"]').forEach(r => {
        r.addEventListener('change', () => {
            const existSec = qs<HTMLElement>('#existingLocationSection');
            const newSec = qs<HTMLElement>('#newLocationSection');
            if (existSec) existSec.classList.toggle('d-none', r.value !== 'existing');
            if (newSec) newSec.classList.toggle('d-none', r.value !== 'new');
        });
    });

    /* -- draft persistence ---------------------------------------- */

    const draftKey = `wizard_draft_${entityType}`;

    function saveDraft(): void {
        const data: Record<string, unknown> = {};
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(el => {
            if ((el as HTMLInputElement).type === 'checkbox') data[el.name] = (el as HTMLInputElement).checked;
            else if ((el as HTMLInputElement).type === 'radio') { if ((el as HTMLInputElement).checked) data[el.name] = el.value; }
            else data[el.name] = el.value;
        });
        data._step = currentStep;
        try { localStorage.setItem(draftKey, JSON.stringify(data)); } catch { /* ignore */ }
    }

    function loadDraft(): void {
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return;
            const data = JSON.parse(raw);
            form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea').forEach(el => {
                if (el.name in data) {
                    if ((el as HTMLInputElement).type === 'checkbox') (el as HTMLInputElement).checked = !!data[el.name];
                    else if ((el as HTMLInputElement).type === 'radio') (el as HTMLInputElement).checked = (el.value === data[el.name]);
                    else el.value = data[el.name];
                }
            });
            const checked = form.querySelector<HTMLInputElement>('input[name="locationChoice"]:checked');
            if (checked) checked.dispatchEvent(new Event('change'));
            if (typeof data._step === 'number' && data._step > 0 && data._step < steps.length) {
                showStep(data._step);
            }
        } catch { /* ignore */ }
    }

    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);
    form.addEventListener('submit', () => {
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    });

    /* -- game wizard: copy type toggle ----------------------------- */

    if (isGame) {
        const copyTypeSelect = qs<HTMLSelectElement>('#copyType');
        const physicalFields = qs<HTMLElement>('#physicalCopyFields');
        const digitalFields = qs<HTMLElement>('#digitalCopyFields');
        if (copyTypeSelect) {
            copyTypeSelect.addEventListener('change', () => {
                const isPhysical = copyTypeSelect.value === 'physical_copy';
                if (physicalFields) physicalFields.classList.toggle('d-none', !isPhysical);
                if (digitalFields) digitalFields.classList.toggle('d-none', isPhysical);
            });
        }
        initGameMetadataSearch();
    }

    /* -- Select2 -------------------------------------------------- */

    initSelect2();

    /* -- boot ----------------------------------------------------- */

    loadDraft();
    showStep(currentStep);
}

/* ------------------------------------------------------------------ */
/*  Game metadata search                                               */
/* ------------------------------------------------------------------ */

function initGameMetadataSearch(): void {
    const btnSearchMeta = qs<HTMLButtonElement>('#btnSearchMetadata');
    const metaSearchInput = qs<HTMLInputElement>('#metadataSearchQuery');
    const metaResults = qs<HTMLElement>('#metadataResults');
    const metaSpinner = qs<HTMLElement>('#metadataSearchSpinner');
    const metaSelected = qs<HTMLElement>('#metadataSelected');
    const metaSelectedName = qs<HTMLElement>('#metadataSelectedName');
    const metaProviderInput = qs<HTMLInputElement>('#metadataProviderId');
    const metaExternalInput = qs<HTMLInputElement>('#metadataExternalId');
    const btnClearMeta = qs<HTMLButtonElement>('#btnClearMetadata');

    // Pre-fill search query from game name when entering metadata step.
    // Observe class changes on step containers to detect when the metadata step becomes visible.
    const observer = new MutationObserver(() => {
        const metaStep = document.querySelector<HTMLElement>('.wizard-step[data-step="metadata"]');
        if (metaStep && !metaStep.classList.contains('d-none') && metaSearchInput) {
            const nameInput = qs<HTMLInputElement>('#name');
            if (nameInput && nameInput.value && !metaSearchInput.value) {
                metaSearchInput.value = nameInput.value;
            }
        }
    });
    const stepsContainer = document.querySelector('.wizard-step[data-step="metadata"]')?.parentElement;
    if (stepsContainer) {
        observer.observe(stepsContainer, {childList: false, subtree: true, attributes: true, attributeFilter: ['class']});
        // Disconnect observer on page unload to prevent memory leaks
        window.addEventListener('beforeunload', () => observer.disconnect());
    }

    async function doMetadataSearch(): Promise<void> {
        const query = metaSearchInput ? metaSearchInput.value.trim() : '';
        if (!query) return;
        const typeSelect = qs<HTMLSelectElement>('#type');
        const gameType = typeSelect ? typeSelect.value : '';
        if (metaSpinner) metaSpinner.classList.remove('d-none');
        if (metaResults) metaResults.innerHTML = '';

        try {
            const options = await get(`/wizard/api/search-metadata?q=${encodeURIComponent(query)}&type=${encodeURIComponent(gameType)}`) as MetadataOption[];
            if (metaSpinner) metaSpinner.classList.add('d-none');
            if (!metaResults) return;
            if (!options || options.length === 0) {
                metaResults.innerHTML = '<div class="alert alert-warning"><i class="bi bi-exclamation-triangle me-2"></i>No results found. Try a different search or skip this step.</div>';
                return;
            }
            let html = '<div class="list-group list-group-flush">';
            for (const opt of options) {
                const img = opt.coverImageUrl
                    ? `<img src="${escapeHtml(opt.coverImageUrl)}" alt="" style="width:50px;height:50px;object-fit:cover;border-radius:4px" class="me-3">`
                    : '<div class="me-3 d-flex align-items-center justify-content-center bg-secondary" style="width:50px;height:50px;border-radius:4px"><i class="bi bi-image text-muted"></i></div>';
                html += `<button type="button" class="list-group-item list-group-item-action text-bg-dark border-secondary d-flex align-items-center metadata-option"`
                    + ` data-provider="${escapeHtml(opt.provider)}"`
                    + ` data-external-id="${escapeHtml(opt.externalId)}"`
                    + ` data-name="${escapeHtml(opt.name)}">`
                    + img
                    + `<div><div class="text-white">${escapeHtml(opt.name)}</div>`
                    + `<small class="text-white-50">`;
                if (opt.releaseDate) html += `<i class="bi bi-calendar me-1"></i>${escapeHtml(opt.releaseDate)} `;
                html += `<span class="badge text-bg-secondary">${escapeHtml(opt.provider)}</span>`
                    + `</small></div></button>`;
            }
            html += '</div>';
            metaResults.innerHTML = html;

            metaResults.querySelectorAll<HTMLElement>('.metadata-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectMetadata(btn.dataset.provider!, btn.dataset.externalId!, btn.dataset.name!);
                });
            });
        } catch {
            if (metaSpinner) metaSpinner.classList.add('d-none');
            if (metaResults) metaResults.innerHTML = '<div class="alert alert-danger">Search failed. Skip this step or try again.</div>';
        }
    }

    async function selectMetadata(provider: string, externalId: string, name: string): Promise<void> {
        if (metaProviderInput) metaProviderInput.value = provider;
        if (metaExternalInput) metaExternalInput.value = externalId;
        if (metaResults) metaResults.innerHTML = '';
        if (metaSelected) metaSelected.classList.remove('d-none');
        if (metaSelectedName) metaSelectedName.textContent = `Selected: ${name} (${provider})`;

        try {
            const meta = await get(`/wizard/api/fetch-metadata?provider=${encodeURIComponent(provider)}&externalId=${encodeURIComponent(externalId)}`) as MetadataDetail;
            if (!meta) return;
            const descEl = qs<HTMLTextAreaElement>('#description');
            if (descEl && meta.description && !descEl.value) descEl.value = meta.description;
            if (meta.playerInfo) {
                const pi = meta.playerInfo;
                const minEl = qs<HTMLInputElement>('#overallMinPlayers');
                const maxEl = qs<HTMLInputElement>('#overallMaxPlayers');
                if (minEl && pi.overallMinPlayers && !minEl.value) minEl.value = String(pi.overallMinPlayers);
                if (maxEl && pi.overallMaxPlayers && !maxEl.value) maxEl.value = String(pi.overallMaxPlayers);
                if (pi.supportsOnline) { const el = qs<HTMLInputElement>('#supportsOnline'); if (el) el.checked = true; }
                if (pi.supportsLocalCouch) { const el = qs<HTMLInputElement>('#supportsLocalCouch'); if (el) el.checked = true; }
                if (pi.supportsLocalLAN) { const el = qs<HTMLInputElement>('#supportsLocalLAN'); if (el) el.checked = true; }
                if (pi.supportsPhysical) { const el = qs<HTMLInputElement>('#supportsPhysical'); if (el) el.checked = true; }
                const modeFields: [string, number | undefined][] = [
                    ['onlineMinPlayers', pi.onlineMinPlayers], ['onlineMaxPlayers', pi.onlineMaxPlayers],
                    ['couchMinPlayers', pi.couchMinPlayers], ['couchMaxPlayers', pi.couchMaxPlayers],
                    ['lanMinPlayers', pi.lanMinPlayers], ['lanMaxPlayers', pi.lanMaxPlayers],
                    ['physicalMinPlayers', pi.physicalMinPlayers], ['physicalMaxPlayers', pi.physicalMaxPlayers],
                ];
                for (const [id, val] of modeFields) {
                    const el = qs<HTMLInputElement>(`#${id}`);
                    if (el && val && !el.value) el.value = String(val);
                }
            }
        } catch { /* metadata prefill failure is non-critical */ }
    }

    if (btnSearchMeta) {
        btnSearchMeta.addEventListener('click', () => doMetadataSearch());
    }
    if (metaSearchInput) {
        metaSearchInput.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') { e.preventDefault(); doMetadataSearch(); }
        });
    }
    if (btnClearMeta) {
        btnClearMeta.addEventListener('click', () => {
            if (metaProviderInput) metaProviderInput.value = '';
            if (metaExternalInput) metaExternalInput.value = '';
            if (metaSelected) metaSelected.classList.add('d-none');
            const descEl = qs<HTMLTextAreaElement>('#description');
            if (descEl) descEl.value = '';
            const minEl = qs<HTMLInputElement>('#overallMinPlayers');
            if (minEl) minEl.value = '';
            const maxEl = qs<HTMLInputElement>('#overallMaxPlayers');
            if (maxEl) maxEl.value = '';
            ['supportsOnline', 'supportsLocalCouch', 'supportsLocalLAN', 'supportsPhysical'].forEach(id => {
                const el = qs<HTMLInputElement>(`#${id}`);
                if (el) el.checked = false;
            });
            ['onlineMinPlayers', 'onlineMaxPlayers', 'couchMinPlayers', 'couchMaxPlayers',
             'lanMinPlayers', 'lanMaxPlayers', 'physicalMinPlayers', 'physicalMaxPlayers'].forEach(id => {
                const el = qs<HTMLInputElement>(`#${id}`);
                if (el) el.value = '';
            });
        });
    }
}

/* ------------------------------------------------------------------ */
/*  Select2 searchable dropdowns                                       */
/* ------------------------------------------------------------------ */

function initSelect2(): void {
    if (typeof $ === 'undefined' || !$.fn.select2) return;

    $('select.form-select').each(function (this: HTMLSelectElement) {
        if (this.options.length < 6) return;
        $(this).select2({
            theme: 'bootstrap-5',
            allowClear: true,
            width: '100%',
        });
    });

    // Dark theme styling for Select2
    const s2style = document.createElement('style');
    s2style.textContent = [
        '.select2-container--bootstrap-5 .select2-selection { background-color: #212529 !important; border-color: #495057 !important; color: #fff !important; }',
        '.select2-container--bootstrap-5 .select2-dropdown { background-color: #212529 !important; border-color: #495057 !important; }',
        '.select2-container--bootstrap-5 .select2-results__option { color: #fff !important; }',
        '.select2-container--bootstrap-5 .select2-results__option--highlighted { background-color: #0d6efd !important; color: #fff !important; }',
        '.select2-container--bootstrap-5 .select2-search__field { background-color: #212529 !important; border-color: #495057 !important; color: #fff !important; }',
    ].join('\n');
    document.head.appendChild(s2style);
}

/* ------------------------------------------------------------------ */
/*  Module init                                                        */
/* ------------------------------------------------------------------ */

export function init(): void {
    setCurrentNavLocation();

    const form = qs<HTMLFormElement>('#wizardForm');
    if (!form) return;

    const steps: StepDef[] = JSON.parse(form.dataset.steps || '[]');
    const entityType = form.dataset.entity || '';
    const isGame = form.dataset.isGame === 'true';

    initWizard(steps, entityType, isGame);
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;

import {setupTest} from '../helpers/testSetup';

const mockGet = jest.fn();

jest.mock('../../../src/public/js/core/navigation', () => ({
    setCurrentNavLocation: jest.fn(),
}));

jest.mock('../../../src/public/js/core/http', () => ({
    get: (...args: unknown[]) => mockGet(...args),
}));

import {init as initWizardForm} from '../../../src/public/js/wizard/form';

function waitForAsyncTasks(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe('wizard form keyboard and metadata behavior', () => {
    setupTest();

    test('pressing Enter advances to next step instead of submitting form', () => {
        document.body.innerHTML = `
            <form id="wizardForm" data-steps='[{"id":"basics","optional":false},{"id":"review","optional":false}]' data-entity="item" data-is-game="false">
                <div class="wizard-step" data-step="basics">
                    <input id="name" name="name" required value="Test Item" />
                </div>
                <div class="wizard-step d-none" data-step="review"></div>
                <button id="btnBack" type="button" class="d-none"></button>
                <button id="btnSkip" type="button" class="d-none"></button>
                <button id="btnNext" type="button"></button>
                <button id="btnSubmit" type="submit" class="d-none"></button>
                <table><tbody id="reviewContent"></tbody></table>
            </form>
            <div class="wizard-step-indicator"><span data-badge="true"></span><span data-label="true"></span></div>
            <div class="wizard-step-indicator"><span data-badge="true"></span><span data-label="true"></span></div>
        `;

        const form = document.getElementById('wizardForm') as HTMLFormElement;
        const submitListener = jest.fn((e: SubmitEvent) => e.preventDefault());
        form.addEventListener('submit', submitListener);

        initWizardForm();

        const nameInput = document.getElementById('name') as HTMLInputElement;
        const enterEvent = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
        nameInput.dispatchEvent(enterEvent);

        const steps = document.querySelectorAll<HTMLElement>('.wizard-step');
        expect(enterEvent.defaultPrevented).toBe(true);
        expect(submitListener).not.toHaveBeenCalled();
        expect(steps[0].classList.contains('d-none')).toBe(true);
        expect(steps[1].classList.contains('d-none')).toBe(false);
    });

    test('pressing Enter in barcode fields is ignored and does not advance steps', () => {
        document.body.innerHTML = `
            <form id="wizardForm" data-steps='[{"id":"copy","optional":false},{"id":"review","optional":false}]' data-entity="game" data-is-game="true">
                <input id="metadataProviderId" type="hidden" name="metadataProviderId" />
                <input id="metadataExternalId" type="hidden" name="metadataExternalId" />
                <div class="wizard-step" data-step="copy">
                    <input id="barcode" name="barcode" value="123456" data-ignore-enter="true" />
                    <select id="barcodeSymbology" name="barcodeSymbology" data-ignore-enter="true"><option value="EAN13" selected>EAN13</option></select>
                    <select id="copyType" name="copyType"><option value="physical_copy" selected>Physical</option></select>
                    <div id="physicalCopyFields"></div>
                    <div id="digitalCopyFields" class="d-none"></div>
                </div>
                <div class="wizard-step d-none" data-step="review"></div>
                <button id="btnBack" type="button" class="d-none"></button>
                <button id="btnSkip" type="button" class="d-none"></button>
                <button id="btnNext" type="button"></button>
                <button id="btnSubmit" type="submit" class="d-none"></button>
                <table><tbody id="reviewContent"></tbody></table>
            </form>
            <div class="wizard-step-indicator"><span data-badge="true"></span><span data-label="true"></span></div>
            <div class="wizard-step-indicator"><span data-badge="true"></span><span data-label="true"></span></div>
            <button id="btnSearchMetadata" type="button"></button>
            <input id="metadataSearchQuery" />
            <div id="metadataResults"></div>
            <div id="metadataSearchSpinner" class="d-none"></div>
            <div id="metadataSelected" class="d-none"></div>
            <span id="metadataSelectedName"></span>
            <button id="btnClearMetadata" type="button"></button>
        `;

        initWizardForm();

        const barcodeInput = document.getElementById('barcode') as HTMLInputElement;
        const enterEvent = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true});
        barcodeInput.dispatchEvent(enterEvent);

        const steps = document.querySelectorAll<HTMLElement>('.wizard-step');
        expect(enterEvent.defaultPrevented).toBe(true);
        expect(steps[0].classList.contains('d-none')).toBe(false);
        expect(steps[1].classList.contains('d-none')).toBe(true);
    });

    test('selected metadata player modes and counts are available on the next step', async () => {
        mockGet.mockImplementation((url: string) => {
            if (url.startsWith('/wizard/api/search-metadata')) {
                return Promise.resolve([{provider: 'igdb', externalId: '42', name: 'Overcooked'}]);
            }
            if (url.startsWith('/wizard/api/fetch-metadata')) {
                return Promise.resolve({
                    description: 'Party cooking chaos',
                    playerInfo: {
                        overallMinPlayers: 1,
                        overallMaxPlayers: 4,
                        supportsOnline: true,
                        supportsLocalCouch: true,
                        onlineMaxPlayers: 4,
                        couchMaxPlayers: 4,
                    },
                });
            }
            return Promise.resolve([]);
        });

        document.body.innerHTML = `
            <form id="wizardForm" data-steps='[{"id":"metadata","optional":true},{"id":"details","optional":true},{"id":"review","optional":false}]' data-entity="game" data-is-game="true">
                <input id="metadataProviderId" type="hidden" name="metadataProviderId" />
                <input id="metadataExternalId" type="hidden" name="metadataExternalId" />
                <div class="wizard-step" data-step="metadata">
                    <input id="metadataSearchQuery" value="Overcooked" data-allow-enter="true" />
                    <button id="btnSearchMetadata" type="button">Search</button>
                    <div id="metadataSearchSpinner" class="d-none"></div>
                    <div id="metadataResults"></div>
                    <div id="metadataSelected" class="d-none"></div>
                    <span id="metadataSelectedName"></span>
                    <button id="btnClearMetadata" type="button">Clear</button>
                </div>
                <div class="wizard-step d-none" data-step="details">
                    <textarea id="description" name="description"></textarea>
                    <input id="overallMinPlayers" name="overallMinPlayers" />
                    <input id="overallMaxPlayers" name="overallMaxPlayers" />
                    <input id="supportsOnline" type="checkbox" name="supportsOnline" />
                    <input id="supportsLocalCouch" type="checkbox" name="supportsLocalCouch" />
                    <input id="supportsLocalLAN" type="checkbox" name="supportsLocalLAN" />
                    <input id="supportsPhysical" type="checkbox" name="supportsPhysical" />
                    <input id="onlineMinPlayers" name="onlineMinPlayers" />
                    <input id="onlineMaxPlayers" name="onlineMaxPlayers" />
                    <input id="couchMinPlayers" name="couchMinPlayers" />
                    <input id="couchMaxPlayers" name="couchMaxPlayers" />
                    <input id="lanMinPlayers" name="lanMinPlayers" />
                    <input id="lanMaxPlayers" name="lanMaxPlayers" />
                    <input id="physicalMinPlayers" name="physicalMinPlayers" />
                    <input id="physicalMaxPlayers" name="physicalMaxPlayers" />
                </div>
                <div class="wizard-step d-none" data-step="review"></div>
                <select id="copyType" name="copyType"><option value="physical_copy" selected>Physical</option></select>
                <div id="physicalCopyFields"></div>
                <div id="digitalCopyFields" class="d-none"></div>
                <button id="btnBack" type="button" class="d-none"></button>
                <button id="btnSkip" type="button" class="d-none"></button>
                <button id="btnNext" type="button">Next</button>
                <button id="btnSubmit" type="submit" class="d-none"></button>
                <table><tbody id="reviewContent"></tbody></table>
            </form>
            <div class="wizard-step-indicator"><span data-badge="true"></span><span data-label="true"></span></div>
            <div class="wizard-step-indicator"><span data-badge="true"></span><span data-label="true"></span></div>
            <div class="wizard-step-indicator"><span data-badge="true"></span><span data-label="true"></span></div>
        `;

        initWizardForm();

        (document.getElementById('btnSearchMetadata') as HTMLButtonElement).click();
        await waitForAsyncTasks();

        const option = document.querySelector('.metadata-option') as HTMLElement;
        option.click();
        await waitForAsyncTasks();

        (document.getElementById('btnNext') as HTMLButtonElement).click();

        expect((document.getElementById('overallMinPlayers') as HTMLInputElement).value).toBe('1');
        expect((document.getElementById('overallMaxPlayers') as HTMLInputElement).value).toBe('4');
        expect((document.getElementById('onlineMaxPlayers') as HTMLInputElement).value).toBe('4');
        expect((document.getElementById('couchMaxPlayers') as HTMLInputElement).value).toBe('4');
        expect((document.getElementById('supportsOnline') as HTMLInputElement).checked).toBe(true);
        expect((document.getElementById('supportsLocalCouch') as HTMLInputElement).checked).toBe(true);
    });
});

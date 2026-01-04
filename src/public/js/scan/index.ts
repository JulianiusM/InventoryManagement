/**
 * Scan page - Barcode scanning and resolution functionality
 */

import {setCurrentNavLocation} from '../core/navigation';
import {post} from '../core/http';

interface ScanResult {
    type: 'item' | 'location' | 'unknown';
    code: string;
    item?: { id: string; name: string; type: string };
    location?: { id: string; name: string; kind: string };
    message?: string;
}

let videoStream: MediaStream | null = null;

/**
 * Initialize camera scanner
 */
function initCamera(): void {
    const video = document.getElementById('scanVideo') as HTMLVideoElement | null;
    const startBtn = document.getElementById('scanStart') as HTMLButtonElement | null;
    const stopBtn = document.getElementById('scanStop') as HTMLButtonElement | null;
    const statusDiv = document.getElementById('scanStatus') as HTMLElement | null;

    if (!video || !startBtn || !stopBtn || !statusDiv) return;

    startBtn.addEventListener('click', async () => {
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            video.srcObject = videoStream;
            await video.play();

            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusDiv.innerHTML = '<div class="alert alert-info">Camera active. Point at a barcode.</div>';
        } catch (err) {
            statusDiv.innerHTML = '<div class="alert alert-danger">Could not access camera. Please allow camera permissions.</div>';
        }
    });

    stopBtn.addEventListener('click', () => {
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        video.srcObject = null;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusDiv.innerHTML = '';
    });
}

/**
 * Initialize manual entry form
 */
function initManualForm(): void {
    const form = document.getElementById('manualForm') as HTMLFormElement | null;
    const input = document.getElementById('manualCode') as HTMLInputElement | null;
    const msgDiv = document.getElementById('manualMsg') as HTMLElement | null;
    const resultDiv = document.getElementById('scanResult') as HTMLElement | null;

    if (!form || !input || !msgDiv || !resultDiv) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = input.value.trim();
        if (!code) {
            msgDiv.innerHTML = '<div class="alert alert-warning">Please enter a code</div>';
            return;
        }

        await resolveCode(code, msgDiv, resultDiv);
    });
}

/**
 * Resolve a code via API
 */
async function resolveCode(code: string, msgDiv: HTMLElement, resultDiv: HTMLElement): Promise<void> {
    try {
        msgDiv.innerHTML = '<div class="text-muted">Resolving...</div>';
        
        const response = await post('/api/scan/resolve', { code });
        
        if (response.status !== 'success') {
            msgDiv.innerHTML = `<div class="alert alert-danger">${response.message || 'Error resolving code'}</div>`;
            return;
        }

        const result = response.data as ScanResult;
        msgDiv.innerHTML = '';

        if (result.type === 'item' && result.item) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <strong>Item found!</strong><br>
                    <a href="/items/${result.item.id}" class="alert-link">${result.item.name}</a>
                    <span class="badge text-bg-secondary ms-2">${result.item.type}</span>
                </div>
            `;
        } else if (result.type === 'location' && result.location) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <strong>Location found!</strong><br>
                    <a href="/locations/${result.location.id}" class="alert-link">${result.location.name}</a>
                    <span class="badge text-bg-secondary ms-2">${result.location.kind}</span>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="alert alert-warning">
                    <strong>Unknown code</strong><br>
                    ${result.message || 'Code not found in database'}
                    <hr>
                    <p class="mb-0">Would you like to <a href="/items" class="alert-link">create a new item</a> with this code?</p>
                </div>
            `;
        }
    } catch (err) {
        msgDiv.innerHTML = '<div class="alert alert-danger">Error resolving code</div>';
    }
}

/**
 * Initialize scan page
 */
export function init(): void {
    setCurrentNavLocation();
    initCamera();
    initManualForm();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;

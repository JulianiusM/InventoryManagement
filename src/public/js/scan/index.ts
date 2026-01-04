/**
 * Scan page - Barcode scanning and resolution functionality
 * Uses ZXing library for client-side barcode detection
 */

import {setCurrentNavLocation} from '../core/navigation';
import {post} from '../core/http';
import {showInlineAlert} from '../shared/alerts';

interface ScanResult {
    type: 'item' | 'location' | 'unknown';
    code: string;
    item?: { id: string; name: string; type: string };
    location?: { id: string; name: string; kind: string };
    message?: string;
}

let videoStream: MediaStream | null = null;
let scannerInterval: number | null = null;

// ZXing browser library types
declare global {
    interface Window {
        ZXing?: {
            BrowserMultiFormatReader: new () => BrowserMultiFormatReader;
        };
    }
}

interface BrowserMultiFormatReader {
    decodeFromVideoDevice(
        deviceId: string | null,
        videoElement: HTMLVideoElement,
        callback: (result: { getText(): string } | null, error?: Error) => void
    ): Promise<void>;
    reset(): void;
}

let codeReader: BrowserMultiFormatReader | null = null;

/**
 * Load ZXing library dynamically
 */
async function loadZXing(): Promise<void> {
    if (window.ZXing) return;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/@zxing/library@0.19.1/umd/index.min.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load ZXing library'));
        document.head.appendChild(script);
    });
}

/**
 * Initialize camera scanner with ZXing
 */
async function initCamera(): Promise<void> {
    const video = document.getElementById('scanVideo') as HTMLVideoElement | null;
    const startBtn = document.getElementById('scanStart') as HTMLButtonElement | null;
    const stopBtn = document.getElementById('scanStop') as HTMLButtonElement | null;
    const statusDiv = document.getElementById('scanStatus') as HTMLElement | null;
    const resultDiv = document.getElementById('scanResult') as HTMLElement | null;
    const msgDiv = document.getElementById('manualMsg') as HTMLElement | null;

    if (!video || !startBtn || !stopBtn || !statusDiv) return;

    startBtn.addEventListener('click', async () => {
        try {
            // Load ZXing library
            await loadZXing();
            
            if (!window.ZXing) {
                showInlineAlert('error', 'Could not load barcode scanner library', statusDiv);
                return;
            }
            
            codeReader = new window.ZXing.BrowserMultiFormatReader();
            
            startBtn.disabled = true;
            stopBtn.disabled = false;
            showInlineAlert('info', 'Camera active. Point at a barcode.', statusDiv);

            // Start continuous scanning
            await codeReader.decodeFromVideoDevice(null, video, async (result, error) => {
                if (result) {
                    const code = result.getText();
                    // Stop scanning temporarily to process
                    if (codeReader) {
                        codeReader.reset();
                    }
                    
                    showInlineAlert('info', `Detected: ${code}`, statusDiv);
                    
                    // Resolve the code
                    if (resultDiv && msgDiv) {
                        await resolveCode(code, msgDiv, resultDiv);
                    }
                    
                    // Resume scanning after a delay
                    setTimeout(async () => {
                        if (startBtn.disabled && codeReader && window.ZXing) {
                            codeReader = new window.ZXing.BrowserMultiFormatReader();
                            await codeReader.decodeFromVideoDevice(null, video, () => {});
                        }
                    }, 3000);
                }
            });
            
        } catch (err) {
            showInlineAlert('error', 'Could not access camera. Please allow camera permissions.', statusDiv);
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    });

    stopBtn.addEventListener('click', () => {
        if (codeReader) {
            codeReader.reset();
            codeReader = null;
        }
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
            showInlineAlert('info', 'Please enter a code', msgDiv);
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
            showInlineAlert('error', response.message || 'Error resolving code', msgDiv);
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
        showInlineAlert('error', 'Error resolving code', msgDiv);
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

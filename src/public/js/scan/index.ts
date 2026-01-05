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
let isScanning = false;
let scanCount = 0;

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
 * Update status message with icon
 */
function updateStatus(statusDiv: HTMLElement, type: 'info' | 'success' | 'warning' | 'error' | 'scanning', message: string): void {
    const icons = {
        info: 'bi-info-circle',
        success: 'bi-check-circle',
        warning: 'bi-exclamation-triangle',
        error: 'bi-x-circle',
        scanning: 'bi-camera-video'
    };
    const alertClass = {
        info: 'alert-secondary',
        success: 'alert-success',
        warning: 'alert-warning',
        error: 'alert-danger',
        scanning: 'alert-primary'
    };
    
    statusDiv.innerHTML = `
        <div class="alert ${alertClass[type]} py-2 mb-0 d-flex align-items-center">
            <i class="bi ${icons[type]} me-2"></i>
            <span>${message}</span>
        </div>
    `;
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
    const overlay = document.getElementById('scanOverlay') as HTMLElement | null;

    if (!video || !startBtn || !stopBtn || !statusDiv) return;

    /**
     * Handle barcode detection result
     */
    const handleScanResult = async (result: { getText(): string } | null, error?: Error): Promise<void> => {
        if (!isScanning) return;
        
        // Handle errors/no detection
        if (error) {
            // NotFoundException is normal - just means no barcode in frame
            if (error.name !== 'NotFoundException') {
                updateStatus(statusDiv, 'warning', `Scanner issue: ${error.message}`);
            }
            return;
        }
        
        if (!result) {
            // Increment scan count to show activity
            scanCount++;
            if (scanCount % 30 === 0) {
                updateStatus(statusDiv, 'scanning', `Scanning... (${Math.floor(scanCount / 30)}s) - Hold barcode steady in view`);
            }
            return;
        }
        
        const code = result.getText();
        scanCount = 0;
        
        // Stop scanning temporarily to process
        if (codeReader) {
            codeReader.reset();
        }
        
        updateStatus(statusDiv, 'success', `Detected: <code class="text-dark">${code}</code>`);
        
        // Show overlay during lookup
        if (overlay) overlay.classList.remove('d-none');
        
        // Resolve the code
        if (resultDiv && msgDiv) {
            await resolveCode(code, msgDiv, resultDiv);
        }
        
        // Hide overlay
        if (overlay) overlay.classList.add('d-none');
        
        // Resume scanning after a delay
        setTimeout(async () => {
            if (isScanning && window.ZXing) {
                updateStatus(statusDiv, 'scanning', 'Scanning active - point at next barcode...');
                codeReader = new window.ZXing.BrowserMultiFormatReader();
                await codeReader.decodeFromVideoDevice(null, video, handleScanResult);
            }
        }, 3000);
    };

    startBtn.addEventListener('click', async () => {
        try {
            updateStatus(statusDiv, 'info', 'Loading scanner library...');
            
            // Load ZXing library
            await loadZXing();
            
            if (!window.ZXing) {
                updateStatus(statusDiv, 'error', 'Could not load barcode scanner library. Please refresh and try again.');
                return;
            }
            
            updateStatus(statusDiv, 'info', 'Requesting camera access...');
            
            codeReader = new window.ZXing.BrowserMultiFormatReader();
            isScanning = true;
            scanCount = 0;
            
            startBtn.disabled = true;
            stopBtn.disabled = false;
            
            updateStatus(statusDiv, 'scanning', 'Camera active - point at a barcode to scan');

            // Start continuous scanning
            await codeReader.decodeFromVideoDevice(null, video, handleScanResult);
            
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
                updateStatus(statusDiv, 'error', 'Camera access denied. Please allow camera permissions in your browser settings.');
            } else if (errorMessage.includes('NotFoundError')) {
                updateStatus(statusDiv, 'error', 'No camera found. Please connect a camera and try again.');
            } else {
                updateStatus(statusDiv, 'error', `Camera error: ${errorMessage}`);
            }
            isScanning = false;
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    });

    stopBtn.addEventListener('click', () => {
        isScanning = false;
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
        updateStatus(statusDiv, 'info', 'Camera stopped. Click "Start Scanning" to begin again.');
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
            showInlineAlert('warning', 'Please enter a code to look up', msgDiv);
            return;
        }

        msgDiv.innerHTML = '<div class="text-muted"><i class="bi bi-hourglass-split me-1"></i>Looking up...</div>';
        await resolveCode(code, msgDiv, resultDiv);
    });
}

/**
 * Resolve a code via API
 */
async function resolveCode(code: string, msgDiv: HTMLElement, resultDiv: HTMLElement): Promise<void> {
    try {
        const response = await post('/api/scan/resolve', { code });
        
        if (response.status !== 'success') {
            showInlineAlert('error', response.message || 'Error resolving code', msgDiv);
            return;
        }

        const result = response.data as ScanResult;
        msgDiv.innerHTML = '';

        if (result.type === 'item' && result.item) {
            resultDiv.innerHTML = `
                <div class="alert alert-success mb-3">
                    <div class="d-flex align-items-center mb-2">
                        <i class="bi bi-check-circle-fill fs-4 me-2"></i>
                        <strong>Item Found!</strong>
                    </div>
                    <hr>
                    <h5 class="mb-2">
                        <a href="/items/${result.item.id}" class="alert-link text-decoration-none">
                            <i class="bi bi-box me-2"></i>${result.item.name}
                        </a>
                    </h5>
                    <span class="badge bg-info">${result.item.type}</span>
                </div>
                <div class="d-grid gap-2">
                    <a href="/items/${result.item.id}" class="btn btn-primary">
                        <i class="bi bi-eye me-1"></i>View Item Details
                    </a>
                    <a href="/items/${result.item.id}#move" class="btn btn-outline-light">
                        <i class="bi bi-arrow-right-square me-1"></i>Move Item
                    </a>
                    <a href="/loans" class="btn btn-outline-light">
                        <i class="bi bi-arrow-left-right me-1"></i>Create Loan
                    </a>
                </div>
            `;
        } else if (result.type === 'location' && result.location) {
            resultDiv.innerHTML = `
                <div class="alert alert-success mb-3">
                    <div class="d-flex align-items-center mb-2">
                        <i class="bi bi-check-circle-fill fs-4 me-2"></i>
                        <strong>Location Found!</strong>
                    </div>
                    <hr>
                    <h5 class="mb-2">
                        <a href="/locations/${result.location.id}" class="alert-link text-decoration-none">
                            <i class="bi bi-geo-alt me-2"></i>${result.location.name}
                        </a>
                    </h5>
                    <span class="badge bg-secondary">${result.location.kind}</span>
                </div>
                <div class="d-grid gap-2">
                    <a href="/locations/${result.location.id}" class="btn btn-primary">
                        <i class="bi bi-eye me-1"></i>View Location
                    </a>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="alert alert-warning mb-3">
                    <div class="d-flex align-items-center mb-2">
                        <i class="bi bi-question-circle-fill fs-4 me-2"></i>
                        <strong>Unknown Code</strong>
                    </div>
                    <hr>
                    <p class="mb-2"><code class="text-dark">${result.code}</code></p>
                    <p class="mb-0 small">${result.message || 'This code is not mapped to any item or location.'}</p>
                </div>
                <div class="d-grid gap-2">
                    <a href="/items" class="btn btn-primary">
                        <i class="bi bi-plus-lg me-1"></i>Create New Item
                    </a>
                    <p class="text-muted small text-center mb-0">
                        Create an item first, then map this barcode to it from the item detail page.
                    </p>
                </div>
            `;
        }
    } catch (err) {
        showInlineAlert('error', 'Error resolving code. Please try again.', msgDiv);
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

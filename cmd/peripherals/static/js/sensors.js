// Sensors page functionality

async function loadSensorInfo() {
    const card = document.querySelector('.sensor-card');
    if (!card) return;

    try {
        const data = await apiCall('/sensor/capabilities');
        const capabilities = data.capabilities || [];
        const element = document.getElementById('sensor-info-detailed');
        if (!element) return;
        
        // Hide card if no sensors available
        if (!capabilities || capabilities.length === 0) {
            card.style.display = 'none';
            return;
        }

        // Show card and render sensors
        card.style.display = 'block';
        let html = '<div class="info-item"><span class="info-label">Available Sensors:</span></div>';
        capabilities.forEach(sensor => {
            html += `
                <div class="info-item">
                    <span class="info-value">${sensor}</span>
                </div>
            `;
        });
        
        element.innerHTML = html;
    } catch (error) {
        // Hide card if service is not implemented (501) or unavailable
        if (error.status === 501 || error.status === 503) {
            card.style.display = 'none';
            return;
        }
        // For other errors, show error message
        const element = document.getElementById('sensor-info-detailed');
        if (element) {
            element.innerHTML = `<div class="loading" style="color: var(--danger);">Error loading: ${error.message}</div>`;
        }
    }
}

function refreshCurrentPage() {
    loadSensorInfo();
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    loadSensorInfo();
});

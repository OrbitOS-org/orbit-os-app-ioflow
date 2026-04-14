// Power page functionality

async function rebootSystem() {
    const confirmed = await showConfirm('Are you sure you want to reboot the system?', 'Reboot System');
    if (!confirmed) return;
    
    try {
        const result = await apiCall('/power/reboot', 'POST', { force: false, reason: 'Web interface' });
        if (result.success) {
            showNotification('System will be rebooted...', 'warning');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

async function shutdownSystem() {
    const confirmed = await showConfirm('Are you sure you want to shutdown the system?', 'Shutdown System');
    if (!confirmed) return;
    
    try {
        const result = await apiCall('/power/shutdown', 'POST', { force: false, reason: 'Web interface' });
        if (result.success) {
            showNotification('System will be shut down...', 'warning');
        }
    } catch (error) {
        showNotification(`Error: ${error.message}`, 'error');
    }
}

function refreshCurrentPage() {
    // Power page doesn't need refresh
}

// Developer page — logs and other dev-only tools (tabs)

function switchDeveloperTab(tabName, buttonElement) {
    document.querySelectorAll('#developer-page .tabs-content .tab-pane').forEach(function(pane) {
        pane.classList.remove('active');
    });
    const selected = document.getElementById('tab-developer-' + tabName);
    if (selected) {
        selected.classList.add('active');
    }

    document.querySelectorAll('#developer-tabs .tab-button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    if (buttonElement) {
        buttonElement.classList.add('active');
    }

    if (tabName === 'logs') {
        initLogViewer();
    } else {
        disconnectSSE();
    }
}

function refreshCurrentPage() {
    const logsPane = document.getElementById('tab-developer-logs');
    if (logsPane && logsPane.classList.contains('active')) {
        refreshLogViewer();
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const toolsBtn = document.querySelector('#developer-tabs [data-dev-tab="tools"]');
    switchDeveloperTab('tools', toolsBtn);
});

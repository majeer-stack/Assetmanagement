document.addEventListener('DOMContentLoaded', async () => {
    const store = window.Store; // From dataStore.js
    const params = new URLSearchParams(window.location.search);
    const auditId = params.get('audit');

    // Wait for the store to pull latest data from Supabase
    await store.init();

    const loadingDiv = document.getElementById('loading');
    const contentDiv = document.getElementById('report-content');

    // Apply Settings
    const settings = store.getSettings();
    const orgName = settings.orgName || 'AssetFlow';
    document.getElementById('report-org-name').innerText = orgName;
    document.title = `${orgName} - Audit Report`;
    document.getElementById('report-date').innerText = new Date().toLocaleString();

    const check = store.getInventoryChecks().find(c => c.id === auditId);

    if (!check) {
        loadingDiv.innerHTML = `<span style="color: red;"><i class="fas fa-exclamation-triangle"></i> Invalid audit ID. Cannot load report.</span>`;
        return;
    }

    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'block';

    document.getElementById('report-audit-name').innerText = check.name;
    document.getElementById('report-audit-status').innerText = check.status;

    // Colorize status
    document.getElementById('report-audit-status').style.color = check.status === 'Active' ? '#10b981' : '#f59e0b';
    document.getElementById('report-audit-status').style.fontWeight = 'bold';

    const tbody = document.querySelector('#report-table tbody');
    tbody.innerHTML = '';

    const users = store.getUsers();
    const assets = store.getAssets();
    const responses = check.responses || [];

    if (responses.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 20px; color: #666;">No responses received yet.</td></tr>`;
    } else {
        // Sort responses by date (newest first)
        const sortedResponses = responses.sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedResponses.forEach(r => {
            const user = users.find(u => u.id === r.userId);
            const userName = user ? user.name : 'Unknown User';
            const userEmail = user ? user.email : 'Unknown Email';
            const dateStr = new Date(r.date).toLocaleString();

            const userAssets = assets.filter(a => a.assignedToUserId === r.userId);
            const assetStrings = userAssets.length > 0
                ? userAssets.map(a => `${a.type} [${a.tag}]`).join('<br>')
                : '<span style="color:#999;font-style:italic;">No assets assigned</span>';

            let statusCls = 'status-pending';
            if (r.status === 'Confirmed') statusCls = 'status-confirmed';
            else if (r.status === 'Declined') statusCls = 'status-declined';

            const conditionStr = r.condition || 'Not Specified';

            tbody.innerHTML += `<tr>
                <td style="color: #666; font-size: 13px; white-space: nowrap;">${dateStr}</td>
                <td><strong>${userName}</strong></td>
                <td style="color: #3b82f6; font-size: 13px;">${userEmail}</td>
                <td style="font-size: 13px; line-height: 1.4;">${assetStrings}</td>
                <td class="${statusCls}">${r.status || 'Confirmed'}</td>
                <td>${conditionStr}</td>
                <td style="color: #555;">${r.notes || '-'}</td>
            </tr>`;
        });
    }
});

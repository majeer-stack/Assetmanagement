document.addEventListener('DOMContentLoaded', async () => {
    const store = window.Store; // From dataStore.js
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('user');

    // Wait for the store to pull latest data from Supabase
    await store.init();

    const loadingDiv = document.getElementById('loading');
    const contentDiv = document.getElementById('profile-content');

    // Check if valid user
    const users = store.getUsers();
    const targetUser = users.find(u => u.id === userId);

    if (!targetUser) {
        loadingDiv.innerHTML = `<span style="color: var(--danger);"><i class="fas fa-exclamation-triangle"></i> Invalid user ID. Cannot load profile.</span>`;
        return;
    }

    // Apply Settings for Title
    const settings = store.getSettings();
    document.title = `${targetUser.name} - ${settings.orgName || 'AssetFlow'} Dashboard`;

    // Populate Header Info
    document.getElementById('user-name-display').innerText = targetUser.name;
    document.getElementById('user-emp-id').innerText = targetUser.empId || 'N/A';
    document.getElementById('user-email').innerText = targetUser.email || 'N/A';

    const depts = store.getDepartments();
    const dept = depts.find(d => d.id === targetUser.departmentId);
    document.getElementById('user-department').innerText = dept ? dept.name : 'Unassigned';

    const roleSpan = document.getElementById('user-role');
    roleSpan.innerText = targetUser.role || 'User';
    roleSpan.className = targetUser.role === 'Admin' ? 'badge badge-assigned' : 'badge badge-available';

    if (targetUser.image) {
        document.getElementById('user-avatar-container').innerHTML = `<img src="${targetUser.image}" alt="Profile Image" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }

    // Get Application Data
    const assets = store.getAssets();
    const reports = store.getReports().filter(r => r.userId === userId || r.user === targetUser.name); // Filter reports relevant to this user

    /* 1. CURRENTLY ASSIGNED ASSETS */
    const currentAssetsList = assets.filter(a => a.assignedToUserId === userId);
    const assetsContainer = document.getElementById('current-assets-container');

    if (currentAssetsList.length === 0) {
        assetsContainer.innerHTML = '<div class="empty-state">No devices currently assigned to this user.</div>';
    } else {
        assetsContainer.innerHTML = '';
        currentAssetsList.forEach(asset => {
            const imgHtml = asset.image
                ? `<img src="${asset.image}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; border:1px solid var(--glass-border);">`
                : `<div style="width:40px; height:40px; border-radius:4px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; border:1px solid var(--glass-border);"><i class="fas fa-laptop" style="font-size:16px; color:var(--text-muted)"></i></div>`;

            assetsContainer.innerHTML += `
                <div class="list-item">
                    <div style="display:flex; align-items:center; gap:12px;">
                        ${imgHtml}
                        <div>
                            <strong style="display:block; font-size:15px;">${asset.type} ${asset.model}</strong>
                            <span style="color:var(--text-muted); font-size:13px; font-family:monospace;">Tag: ${asset.tag}</span>
                        </div>
                    </div>
                    <span class="badge badge-assigned">${asset.status}</span>
                </div>
            `;
        });
    }

    /* 2. CONSUMABLES DRAWN (Historical) */
    const consumablesContainer = document.getElementById('consumables-container');
    const consumableReports = reports.filter(r => r.action === 'Issue Consumable');

    if (consumableReports.length === 0) {
        consumablesContainer.innerHTML = '<div class="empty-state">No consumables drawn by this user.</div>';
    } else {
        consumablesContainer.innerHTML = '';

        // Group by item name
        const consumedTotals = {};
        consumableReports.forEach(r => {
            const match = r.details.match(/Issued (\d+)/);
            const qty = match ? parseInt(match[1]) : 1;

            if (!consumedTotals[r.item]) consumedTotals[r.item] = { qty: 0, lastDate: r.date };
            consumedTotals[r.item].qty += qty;
            if (new Date(r.date) > new Date(consumedTotals[r.item].lastDate)) {
                consumedTotals[r.item].lastDate = r.date;
            }
        });

        Object.keys(consumedTotals).forEach(itemName => {
            const data = consumedTotals[itemName];
            const dateStr = new Date(data.lastDate).toLocaleDateString();
            consumablesContainer.innerHTML += `
                <div class="list-item">
                    <div>
                        <strong style="display:block; font-size:15px;">${itemName}</strong>
                        <span style="color:var(--text-muted); font-size:13px;">Last drawn: ${dateStr}</span>
                    </div>
                    <span class="badge badge-available" style="font-size: 14px; padding: 6px 10px;">${data.qty} Drawn</span>
                </div>
            `;
        });
    }

    /* 3. FULL HISTORY */
    const historyTbody = document.querySelector('#history-table tbody');
    if (reports.length === 0) {
        historyTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-muted); font-style:italic;">No history records found for this user.</td></tr>`;
    } else {
        // Sort newest first
        const sortedReports = reports.sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedReports.forEach(r => {
            const dateStr = new Date(r.date).toLocaleString();
            let actionBadgeStyle = 'color: var(--text-main); font-weight: 500;';
            if (r.action.includes('Assign')) actionBadgeStyle = 'color: var(--primary); font-weight: 600;';
            if (r.action.includes('Return')) actionBadgeStyle = 'color: var(--warning); font-weight: 600;';
            if (r.action.includes('Issue')) actionBadgeStyle = 'color: var(--secondary); font-weight: 600;';

            historyTbody.innerHTML += `
                <tr>
                    <td style="color: var(--text-muted); font-size: 13px; white-space: nowrap;">${dateStr}</td>
                    <td style="${actionBadgeStyle}">${r.action}</td>
                    <td><strong>${r.item || '-'}</strong></td>
                    <td style="color: var(--text-muted); font-size: 13px;">${r.details}</td>
                </tr>
            `;
        });
    }

    loadingDiv.style.display = 'none';
    contentDiv.style.display = 'block';
});

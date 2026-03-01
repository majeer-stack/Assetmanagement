document.addEventListener('DOMContentLoaded', async () => {
    const store = window.Store;
    const params = new URLSearchParams(window.location.search);
    const auditId = params.get('audit');
    let userId = params.get('user');

    const loadingView = document.getElementById('loading-view');
    const errorView = document.getElementById('error-view');
    const authView = document.getElementById('auth-view');
    const portalContent = document.getElementById('portal-content');
    const successView = document.getElementById('success-view');

    let selectedStatus = null;
    let currentUser = null;

    // Wait for the store to pull latest data from Supabase or Node server
    await store.init();

    // Apply Settings
    const settings = store.getSettings();
    const orgName = settings.orgName || 'AssetFlow';
    document.getElementById('portal-org-name').innerText = orgName;
    document.title = `${orgName} - IT Asset Portal`;

    if (settings.orgLogo) {
        document.getElementById('portal-org-logo').src = settings.orgLogo;
        document.getElementById('portal-org-logo').style.display = 'block';
        document.getElementById('portal-org-icon').style.display = 'none';
    }

    loadingView.style.display = 'none';

    // Standard Database Path
    const check = store.getInventoryChecks().find(c => c.id === auditId);

    if (!check) {
        showError("Invalid audit ID. Please check the link.");
        return;
    }

    if (check.status !== 'Active') {
        showError("This inventory audit is closed.");
        return;
    }

    if (userId) {
        // Try to find by direct generic id or by empId (in case it was typed)
        currentUser = store.getUsers().find(u => u.id === userId || u.empId === userId);
        if (currentUser) {
            loadPortalForUser(currentUser);
        } else {
            authView.style.display = 'block'; // Fallback to auth
        }
    } else {
        // No user in URL, require manual authentication
        authView.style.display = 'block';
    }

    // Manual Authentication Logic (Only works efficiently with DB sync)
    const authBtn = document.getElementById('auth-btn');
    const authEmail = document.getElementById('auth-email');
    const authEmpId = document.getElementById('auth-emp-id');
    const authError = document.getElementById('auth-error');

    authBtn.addEventListener('click', () => {
        const emailInput = authEmail.value.trim().toLowerCase();
        const empIdInput = authEmpId.value.trim().toLowerCase();

        if (!emailInput || !empIdInput) {
            authError.innerText = "Please enter both Email and Employee ID.";
            authError.style.display = 'block';
            return;
        }

        currentUser = store.getUsers().find(u =>
            u.email && u.email.toLowerCase() === emailInput &&
            u.empId && u.empId.toLowerCase() === empIdInput
        );

        if (currentUser) {
            authError.style.display = 'none';
            authView.style.display = 'none';
            userId = currentUser.id;
            loadPortalForUser(currentUser);
        } else {
            authError.innerText = "Invalid Email or Employee ID, or no assets assigned to you.";
            authError.style.display = 'block';
        }
    });

    function showError(msg) {
        errorView.style.display = 'block';
        const msgEl = document.querySelector('#error-view p');
        if (msgEl) msgEl.innerText = msg;
    }

    // Render for Offline / Payload-based
    function loadPortalFromPayload(pLoad) {
        portalContent.style.display = 'block';
        document.getElementById('portal-audit-name').innerText = pLoad.auditName || 'Asset Check';
        document.getElementById('portal-user-name').innerText = pLoad.userName || 'Employee';

        renderAssetList(pLoad.assets || []);
    }

    // Render for Standard Database
    function loadPortalForUser(user) {
        portalContent.style.display = 'block';
        const check = store.getInventoryChecks().find(c => c.id === auditId);
        document.getElementById('portal-audit-name').innerText = check ? check.name : 'Asset Check';
        document.getElementById('portal-user-name').innerText = user.name;

        const userAssets = store.getAssets().filter(a => a.assignedToUserId === user.id);
        renderAssetList(userAssets);
    }

    function renderAssetList(assetsToRender) {
        const listContainer = document.getElementById('portal-asset-list');
        listContainer.innerHTML = '';

        if (assetsToRender.length === 0) {
            listContainer.innerHTML = `
                <div class="asset-card" style="justify-content: center; padding: 20px;">
                    <span style="color:var(--text-muted);">You currently have no hardware assets assigned to you.</span>
                </div>`;
        } else {
            assetsToRender.forEach(a => {
                const imgHtml = a.image
                    ? `<img src="${a.image}" class="asset-img">`
                    : `<div class="asset-img"><i class="fas fa-laptop" style="font-size:20px; color:var(--text-muted)"></i></div>`;

                listContainer.innerHTML += `
                    <div class="asset-card">
                        ${imgHtml}
                        <div>
                            <strong style="display:block; font-size:16px; color: white;">${a.type} ${a.model}</strong>
                            <span style="font-size: 13px; color: var(--text-muted); font-family: monospace;">Tag: ${a.tag}</span>
                        </div>
                    </div>`;
            });
        }
    }

    // Form Interactions
    const btnConfirm = document.getElementById('btn-confirm');
    const btnDecline = document.getElementById('btn-decline');
    const conditionSection = document.getElementById('condition-section');
    const conditionSelect = document.getElementById('portal-condition');
    const submitBtn = document.getElementById('submit-btn');
    const form = document.getElementById('audit-form');

    function checkFormValidity() {
        if (!selectedStatus) {
            submitBtn.disabled = true;
            return;
        }
        if (selectedStatus === 'Confirmed' && !conditionSelect.value) {
            submitBtn.disabled = true;
            return;
        }
        submitBtn.disabled = false;
    }

    btnConfirm.addEventListener('click', () => {
        selectedStatus = 'Confirmed';
        btnConfirm.classList.add('active');
        btnDecline.classList.remove('active');
        conditionSection.style.display = 'block';
        checkFormValidity();
    });

    btnDecline.addEventListener('click', () => {
        selectedStatus = 'Declined';
        btnDecline.classList.add('active');
        btnConfirm.classList.remove('active');
        conditionSection.style.display = 'none';
        conditionSelect.value = ''; // reset
        checkFormValidity();
    });

    conditionSelect.addEventListener('change', checkFormValidity);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!selectedStatus || (selectedStatus === 'Confirmed' && !conditionSelect.value)) return;

        const notes = document.getElementById('portal-notes').value.trim();
        const condition = selectedStatus === 'Confirmed' ? conditionSelect.value : 'N/A';

        // Standard Store Flow (Local Storage or Node Server Connected)
        const success = store.submitAuditResponse(auditId, userId, selectedStatus, condition, notes);

        if (success) {
            portalContent.style.display = 'none';
            successView.style.display = 'block';
        } else {
            alert('This audit is no longer active and cannot accept responses.');
            window.location.reload();
        }
    });
});

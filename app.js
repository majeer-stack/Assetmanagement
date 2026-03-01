class AssetFlowApp {
    constructor() {
        this.store = window.Store;
        this.currentUser = null;
        this.dbReady = false;

        // Wait for store to initialize before rendering
        this.initApp();
    }

    async initApp() {
        await this.store.init();
        this.dbReady = true;

        this.applyOrgSettings(); // Apply branding early for generic pages

        this.checkAuth();
        this.setupNavigation();
        this.setupForms();
    }

    checkAuth() {
        const activeUserId = sessionStorage.getItem('activeUserId');
        if (activeUserId) {
            this.currentUser = this.store.getUsers().find(u => u.id === activeUserId);
            if (!this.currentUser) {
                this.handleLogout(); // Session invalid
                return;
            }

            // Show app, hide login
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'flex'; // app-container is a flex layout

            // Set User Profile UI
            document.getElementById('nav-username').innerText = this.currentUser.name;
            document.getElementById('nav-avatar').innerText = this.currentUser.name.charAt(0).toUpperCase();

            // Apply Role Restrictions
            this.applyRoleRestrictions();

            // Render data
            this.renderAll();
        } else {
            // Show login, hide app
            document.getElementById('login-container').style.display = 'flex';
            document.getElementById('app-container').style.display = 'none';
        }
    }

    handleLogout() {
        sessionStorage.removeItem('activeUserId');
        this.currentUser = null;
        window.location.reload();
    }

    applyRoleRestrictions() {
        const isAdmin = this.currentUser.role === 'Admin';

        // Hide Admin-only fields in modals (e.g., password, role selection)
        document.querySelectorAll('.admin-only-field').forEach(el => {
            el.style.display = isAdmin ? 'block' : 'none';
        });

        // Hide specific navigation items or buttons if needed
        // For example, maybe standard users shouldn't see 'Settings'
        const settingsNav = document.querySelector('[data-target="settings-view"]');
        if (settingsNav) settingsNav.style.display = isAdmin ? 'flex' : 'none';

        const deptsNav = document.querySelector('[data-target="departments-view"]');
        if (deptsNav) deptsNav.style.display = isAdmin ? 'flex' : 'none';

        // Hide Admin tabs from generic users
        if (!isAdmin) {
            const adminTabs = ['departments-view', 'users-view', 'settings-view', 'reports-view'];
            adminTabs.forEach(id => {
                const nav = document.querySelector(`[data-target="${id}"]`);
                if (nav) nav.style.display = 'none';
            });
        }
    }



    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        const views = document.querySelectorAll('.view');
        const pageTitle = document.getElementById('page-title');

        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Update active button
                navItems.forEach(nav => nav.classList.remove('active'));
                const btn = e.currentTarget;
                btn.classList.add('active');

                // Update view
                const targetId = btn.getAttribute('data-target');
                views.forEach(v => v.classList.remove('active'));
                document.getElementById(targetId).classList.add('active');

                // Update Title
                pageTitle.textContent = btn.innerText.trim();

                // Re-render data for the newly opened view just in case
                this.renderAll();
            });
        });
    }

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
        // Reset titles to 'Add' by default when opening plain add modals
        if (modalId === 'user-modal') {
            document.getElementById('edit-user-id').value = '';
            document.getElementById('user-modal-title').innerText = 'Add User';
            document.getElementById('user-password-group').style.display = 'block'; // Show for new users
            document.getElementById('user-password').setAttribute('required', 'true'); // Require pass for new

            const dp = document.getElementById('user-image-preview');
            if (dp) dp.style.display = 'none';

            const select = document.getElementById('user-department');
            select.innerHTML = '<option value="">Select Department...</option>';
            this.store.getDepartments().forEach(d => {
                select.innerHTML += `<option value="${d.id}">${d.name}</option>`;
            });
        } else if (modalId === 'asset-types-modal') {
            this.renderAssetTypesList();
        } else if (modalId === 'consumable-types-modal') {
            this.renderConsumableTypesList();
        } else if (modalId === 'asset-modal') {
            document.getElementById('edit-asset-id').value = '';
            document.getElementById('asset-modal-title').innerText = 'Add IT Asset';
            const dp = document.getElementById('asset-image-preview');
            if (dp) dp.style.display = 'none';
        } else if (modalId === 'consumable-modal') {
            document.getElementById('edit-consumable-id').value = '';
            document.getElementById('consumable-modal-title').innerText = 'Add Consumable Stock';
            document.getElementById('consumable-qty-group').style.display = 'block';
            document.getElementById('consumable-qty').setAttribute('required', 'true');
            const dp = document.getElementById('consumable-image-preview');
            if (dp) dp.style.display = 'none';
        }
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        // Try to find the form inside and reset it
        const modal = document.getElementById(modalId);
        const form = modal.querySelector('form');
        if (form) form.reset();
    }

    setupForms() {
        // Login Form
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value.trim();
                const password = document.getElementById('login-password').value.trim();
                const errorDiv = document.getElementById('login-error');

                const user = this.store.authenticateUser(email, password);
                if (user) {
                    errorDiv.style.display = 'none';
                    sessionStorage.setItem('activeUserId', user.id);
                    this.checkAuth();
                } else {
                    errorDiv.style.display = 'block';
                }
            });
        }

        // Forgot Password Form
        const forgotPasswordForm = document.getElementById('forgot-password-form');
        if (forgotPasswordForm) {
            forgotPasswordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('forgot-password-email').value.trim();

                const user = this.store.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
                if (user) {
                    const tempPassword = Math.random().toString(36).slice(-8);

                    user.password = tempPassword;
                    this.store.saveData();

                    await this.sendEmailNotification(
                        user.email,
                        'Password Reset Request',
                        `Hello ${user.name},\n\nYour temporary password is: ${tempPassword}\n\nPlease login and change your password in the Users section immediately.\n\nThank you.`
                    );

                    this.showToast('Temporary password sent to email.');
                } else {
                    this.showToast('If the email exists, a password reset link has been sent.');
                }

                this.closeModal('forgot-password-modal');
                forgotPasswordForm.reset();
            });
        }

        // Image Preview Handler helper
        const setupImagePreview = (inputId, previewId) => {
            const input = document.getElementById(inputId);
            const preview = document.getElementById(previewId);
            if (input && preview) {
                input.addEventListener('change', async (e) => {
                    if (e.target.files && e.target.files[0]) {
                        try {
                            const base64 = await this.compressImage(e.target.files[0]);
                            preview.src = base64;
                            preview.style.display = 'block';
                            preview.setAttribute('data-base64', base64);
                        } catch (err) {
                            console.error("Image compression failed", err);
                            this.showToast('Failed to process image');
                        }
                    } else {
                        preview.style.display = 'none';
                        preview.removeAttribute('data-base64');
                    }
                });
            }
        };

        setupImagePreview('user-image-upload', 'user-image-preview');
        setupImagePreview('asset-image-upload', 'asset-image-preview');
        setupImagePreview('consumable-image-upload', 'consumable-image-preview');

        // Departments
        document.getElementById('department-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.store.addDepartment(document.getElementById('dept-name').value);
            this.closeModal('department-modal');
            this.renderAll();
        });

        // Users
        document.getElementById('user-form').addEventListener('submit', (e) => {
            e.preventDefault();

            // Only admins can change roles and passwords of others freely here,
            // but the form holds the values. Keep fallback for non-admins if UI allows.
            let role = document.getElementById('user-role').value;
            let password = document.getElementById('user-password').value;

            if (this.currentUser.role !== 'Admin') {
                role = 'User'; // Restrict non-admins from assigning Admin
                password = ''; // Don't let non-admins change passwords here
            }

            const imgPreview = document.getElementById('user-image-preview');
            const imageStr = imgPreview.style.display === 'block' ? imgPreview.getAttribute('data-base64') : null;

            const editId = document.getElementById('edit-user-id').value;
            if (editId) {
                this.store.editUser(
                    editId,
                    document.getElementById('user-emp-id').value,
                    document.getElementById('user-name').value,
                    document.getElementById('user-email').value,
                    document.getElementById('user-department').value,
                    role,
                    password,
                    imageStr
                );
                this.showToast('User updated successfully.');
            } else {
                this.store.addUser(
                    document.getElementById('user-emp-id').value,
                    document.getElementById('user-name').value,
                    document.getElementById('user-email').value,
                    document.getElementById('user-department').value,
                    role,
                    password,
                    imageStr
                );
                this.showToast('User added successfully.');
            }
            this.closeModal('user-modal');
            this.renderAll();
        });

        // Assets
        document.getElementById('asset-form').addEventListener('submit', (e) => {
            e.preventDefault();

            const imgPreview = document.getElementById('asset-image-preview');
            const imageStr = imgPreview.style.display === 'block' ? imgPreview.getAttribute('data-base64') : null;

            const editId = document.getElementById('edit-asset-id').value;
            if (editId) {
                this.store.editAsset(
                    editId,
                    document.getElementById('asset-type').value,
                    document.getElementById('asset-tag').value,
                    document.getElementById('asset-model').value,
                    imageStr
                );
                this.showToast('Asset updated successfully.');
            } else {
                this.store.addAsset(
                    document.getElementById('asset-type').value,
                    document.getElementById('asset-tag').value,
                    document.getElementById('asset-model').value,
                    imageStr
                );
                this.showToast('Asset added successfully.');
            }
            this.closeModal('asset-modal');
            this.renderAll();
        });

        // Consumables (New Stock Type)
        document.getElementById('consumable-form').addEventListener('submit', (e) => {
            e.preventDefault();

            const imgPreview = document.getElementById('consumable-image-preview');
            const imageStr = imgPreview.style.display === 'block' ? imgPreview.getAttribute('data-base64') : null;

            const editId = document.getElementById('edit-consumable-id').value;
            if (editId) {
                this.store.editConsumableTypeRecord(
                    editId,
                    document.getElementById('consumable-name').value,
                    document.getElementById('consumable-type').value,
                    imageStr
                );
                this.showToast('Consumable details updated successfully.');
            } else {
                this.store.addConsumableTypeRecord(
                    document.getElementById('consumable-name').value,
                    document.getElementById('consumable-type').value,
                    document.getElementById('consumable-qty').value,
                    imageStr
                );
                this.showToast('Consumable added successfully.');
            }
            this.closeModal('consumable-modal');
            this.renderAll();
        });

        // Assign Asset
        document.getElementById('assign-asset-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const assetId = document.getElementById('assign-asset-id').value;
            const userId = document.getElementById('assign-user-id').value;
            const assetDisplay = document.getElementById('assign-asset-display').innerText;

            const result = this.store.assignAsset(assetId, userId);
            this.closeModal('assign-asset-modal');
            this.renderAll();

            if (result && result.user && result.asset) {
                const { user, asset } = result;
                this.showToast(`Hardware assigned to ${user.name}.`);

                const plainText = `Hello ${user.name},\n\nYou have been directly assigned the following IT hardware: ${asset.type} [${asset.tag}] - ${asset.model}.\n\nPlease contact IT if you have any questions.\n\nThank you.`;

                let htmlBody = `
                    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">IT Asset Assigned</h2>
                        </div>
                        <div style="padding: 24px;">
                            <p style="font-size: 16px;">Hello <strong>${user.name}</strong>,</p>
                            <p>You have been directly assigned the following IT hardware:</p>
                            <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
                                <h3 style="margin-top: 0; color: #111; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">${asset.type}</h3>
                                <p style="margin: 8px 0;"><strong>Asset Tag:</strong> <span style="font-family: monospace;">${asset.tag}</span></p>
                                <p style="margin: 8px 0;"><strong>Model Details:</strong> ${asset.model}</p>
                            </div>
                            ${asset.image ? `<div style="text-align: center; margin: 20px 0;"><img src="${asset.image}" alt="Asset Image" style="max-width: 100%; border-radius: 8px; max-height: 250px; object-fit: contain; border: 1px solid #e5e7eb;"></div>` : ''}
                            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Please contact IT if you have any questions or if you did not receive this item.</p>
                            <p style="color: #6b7280; font-size: 14px;">Thank you.</p>
                        </div>
                    </div>
                `;

                await this.sendEmailNotification(user.email, 'New IT Hardware Assigned', plainText, htmlBody);
            }
        });

        // Issue Consumable
        document.getElementById('issue-consumable-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const conId = document.getElementById('issue-consumable-id').value;
            const userId = document.getElementById('issue-user-id').value;
            const qty = document.getElementById('issue-qty').value;
            const conDisplay = document.getElementById('issue-consumable-display').innerText;

            const result = this.store.issueConsumable(conId, userId, qty);
            if (result && result.user && result.item) {
                const { user, item } = result;
                this.closeModal('issue-consumable-modal');
                this.renderAll();
                this.showToast(`Consumable issued to ${user.name}.`);

                const plainText = `Hello ${user.name},\n\nYou have been issued: ${qty}x ${item.name} (${item.type}).\n\nPlease contact IT if you have any questions.\n\nThank you.`;

                let htmlBody = `
                    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #10b981; color: white; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">IT Consumable Issued</h2>
                        </div>
                        <div style="padding: 24px;">
                            <p style="font-size: 16px;">Hello <strong>${user.name}</strong>,</p>
                            <p>Your request has been processed. You have been issued the following items:</p>
                            <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 20px 0;">
                                <h3 style="margin-top: 0; color: #111; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">${item.type}</h3>
                                <p style="margin: 8px 0; font-size: 18px;"><strong>Item:</strong> ${item.name}</p>
                                <p style="margin: 8px 0; font-size: 18px; color: #10b981;"><strong>Quantity Issued:</strong> ${qty}</p>
                            </div>
                            ${item.image ? `<div style="text-align: center; margin: 20px 0;"><img src="${item.image}" alt="Item Image" style="max-width: 100%; border-radius: 8px; max-height: 250px; object-fit: contain; border: 1px solid #e5e7eb;"></div>` : ''}
                            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Please contact IT if you have any questions regarding these supplies.</p>
                            <p style="color: #6b7280; font-size: 14px;">Thank you.</p>
                        </div>
                    </div>
                `;

                await this.sendEmailNotification(user.email, 'IT Consumable Issued', plainText, htmlBody);
            } else {
                alert('Not enough stock to issue this quantity!');
            }
        });

        // Add Stock
        document.getElementById('add-stock-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const itemClassId = document.getElementById('add-stock-id').value;
            const qty = document.getElementById('add-stock-qty').value;
            this.store.addStock(itemClassId, qty);
            this.closeModal('add-stock-modal');
            this.renderAll();
        });

        // Add New Asset Type
        document.getElementById('asset-types-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('new-asset-type');
            if (input.value.trim()) {
                this.store.addAssetType(input.value.trim());
                input.value = '';
                this.renderAssetTypesList();
                this.populateAssetTypesDropdown();
            }
        });

        // Add New Consumable Type
        document.getElementById('consumable-types-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('new-consumable-type');
            if (input.value.trim()) {
                this.store.addConsumableType(input.value.trim());
                input.value = '';
                this.renderConsumableTypesList();
                this.populateConsumableTypesDropdown();
            }
        });

        // Settings Form
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();

            const logoPreview = document.getElementById('setting-org-logo-preview');
            const logoStr = logoPreview && logoPreview.style.display === 'block' ? logoPreview.getAttribute('data-base64') : null;

            const newStorageMode = document.getElementById('setting-storage-mode').value;
            const newLocalPath = document.getElementById('setting-local-path').value.trim();
            const newSupabaseUrl = document.getElementById('setting-supabase-url').value.trim();
            const newSupabaseKey = document.getElementById('setting-supabase-key').value.trim();

            const oldSettings = this.store.getSettings();
            const supabaseChanged = (oldSettings.supabaseUrl !== newSupabaseUrl || oldSettings.supabaseKey !== newSupabaseKey || oldSettings.storageMode !== newStorageMode);

            this.store.updateSettings({
                orgName: document.getElementById('setting-org-name').value.trim() || 'AssetFlow',
                orgLogo: logoStr,
                logoWidth: document.getElementById('setting-logo-width').value || '40px',
                logoHeight: document.getElementById('setting-logo-height').value || '40px',
                publicUrl: document.getElementById('setting-public-url') ? document.getElementById('setting-public-url').value.trim() : '',
                webhookUrl: document.getElementById('setting-webhook-url').value.trim(),
                webhookAuth: document.getElementById('setting-webhook-auth').value.trim(),
                theme: document.getElementById('setting-theme').value,
                font: document.getElementById('setting-font').value,
                storageMode: newStorageMode,
                localPath: newLocalPath,
                supabaseUrl: newSupabaseUrl,
                supabaseKey: newSupabaseKey
            });
            this.showToast('Settings saved successfully.');
            this.applyOrgSettings();

            if (supabaseChanged) {
                this.showToast('Supabase settings changed. Reloading page to apply...', 'var(--warning)');
                setTimeout(() => window.location.reload(), 1500);
            }
        });

        // Setup Image Previews
        setupImagePreview('setting-org-logo-upload', 'setting-org-logo-preview');

        // New Inventory Audit
        const newAuditForm = document.getElementById('new-audit-form');
        if (newAuditForm) {
            newAuditForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const name = document.getElementById('audit-name').value.trim();
                if (name) {
                    this.store.addInventoryCheck(name);
                    this.closeModal('new-audit-modal');
                    document.getElementById('audit-name').value = '';
                    this.renderAll();
                    this.showToast('New Inventory Audit Started.');
                }
            });
        }

        // Scrap Asset
        const scrapAssetForm = document.getElementById('scrap-asset-form');
        if (scrapAssetForm) {
            scrapAssetForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const id = document.getElementById('scrap-asset-id').value;
                const reason = document.getElementById('scrap-reason').value.trim();
                const year = document.getElementById('scrap-year').value;

                this.store.scrapAsset(id, reason, year);
                this.closeModal('scrap-asset-modal');
                this.renderAll();
                this.showToast('Asset Successfully Scrapped.');
            });
        }
    }

    async sendEmailNotification(toAddress, subject, message, htmlBody = null) {
        const settings = this.store.getSettings();

        if (!settings.webhookUrl) {
            console.log('Skipping email notification: Webhook URL not configured.');
            this.showToast('Email skipped: Webhook URL not configured in Settings.');
            return;
        }

        try {
            // Prepare the base payload
            const payload = {
                to: toAddress,
                subject: `[${settings.orgName || 'AssetFlow'}] ${subject}`,
                body: message,
                event: 'asset_management_notification',
                orgName: settings.orgName || 'AssetFlow'
            };

            if (htmlBody) {
                payload.htmlBody = htmlBody;
            }

            let fetchOptions;

            // If using Google Apps Script webhook, use standard Web Forms to avoid ALL CORS / JSON parse issues
            if (settings.webhookUrl.includes('script.google.com')) {
                const formData = new URLSearchParams();
                for (const key in payload) {
                    formData.append(key, payload[key]);
                }

                fetchOptions = {
                    method: 'POST',
                    mode: 'no-cors',
                    body: formData
                };
            } else {
                // For other generic webhooks, use standard JSON POST
                let headers = { 'Content-Type': 'application/json' };
                if (settings.webhookAuth) {
                    headers['Authorization'] = settings.webhookAuth;
                }
                fetchOptions = {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                };
            }

            const response = await fetch(settings.webhookUrl, fetchOptions);

            // With no-cors, response is opaque and status is 0, so we treat it as success if no error was thrown
            if (response.ok || response.type === 'opaque') {
                this.showToast('Email sent successfully.');
                this.store.addEmailLog(toAddress, subject, 'Success', `Delivered via Webhook (HTTP ${response.status || 'Opaque'})`);
            } else {
                console.error("Webhook Error", response.statusText);
                this.showToast('Webhook Error. Check logs/console.');
                this.store.addEmailLog(toAddress, subject, 'Failed', `HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to send email:', error);
            this.showToast('Failed to send email. Ensure CORS allows requests to your Webhook.');
            this.store.addEmailLog(toAddress, subject, 'Failed', error.toString());
        }
    }

    showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'glass-panel';
        toast.style.padding = '12px 20px';
        toast.style.borderLeft = '4px solid var(--success)';
        toast.style.display = 'flex';
        toast.style.alignItems = 'center';
        toast.style.gap = '10px';
        toast.style.animation = 'fadeIn 0.3s ease forwards';

        toast.innerHTML = `<i class="fas fa-check-circle" style="color: var(--success)"></i> ${message}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeIn 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    applyOrgSettings() {
        const settings = this.store.getSettings();
        const orgName = settings.orgName || 'AssetFlow';
        const orgLogo = settings.orgLogo;
        const theme = settings.theme || 'solid-dark';
        const font = settings.font || "'Inter', sans-serif";

        document.body.className = theme;
        document.body.style.fontFamily = font;

        const setOrgUI = (nameId, iconId, logoId) => {
            const nameEl = document.getElementById(nameId);
            const iconEl = document.getElementById(iconId);
            const logoEl = document.getElementById(logoId);

            if (nameEl) nameEl.innerText = orgName;

            if (orgLogo) {
                if (iconEl) iconEl.style.display = 'none';
                if (logoEl) {
                    logoEl.src = orgLogo;

                    // Apply explicit custom logo dimensions if provided
                    logoEl.style.width = settings.logoWidth || '40px';
                    logoEl.style.height = settings.logoHeight || '40px';

                    logoEl.style.display = 'block';
                }
            } else {
                if (iconEl) iconEl.style.display = 'inline-block';
                if (logoEl) logoEl.style.display = 'none';
            }
        };

        setOrgUI('sidebar-org-name', 'sidebar-org-icon', 'sidebar-org-logo');
        setOrgUI('login-org-name', 'login-org-icon', 'login-org-logo');

        // Print Header
        const printOrg = document.getElementById('print-org-name');
        if (printOrg) printOrg.innerText = orgName;

        const printDate = document.getElementById('print-date');
        if (printDate) printDate.innerText = new Date().toLocaleDateString();

        // Ensure browser title reflects org name dynamically
        document.title = `${orgName} - IT Asset Manager`;
    }

    /**
     * Compresses user-uploaded images to small thumbnails via an offscreen canvas.
     * Required to prevent throwing localStorage QUOTA_EXCEEDED errors.
     */
    compressImage(file, maxSize = 200) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxSize) {
                            height *= maxSize / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width *= maxSize / height;
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Output as heavily compressed JPEG
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                    resolve(dataUrl);
                };
                img.onerror = err => reject(err);
            };
            reader.onerror = err => reject(err);
        });
    }

    renderAll() {
        this.renderDepartments();
        this.renderUsers();
        this.renderAssets();
        this.renderConsumables();
        this.renderReports();
        this.renderDashboard();
        this.populateAssetTypesDropdown();
        this.populateConsumableTypesDropdown();
        this.renderSettings();
    }

    renderSettings() {
        const settings = this.store.getSettings();
        document.getElementById('setting-org-name').value = settings.orgName || 'AssetFlow';

        const logoPreview = document.getElementById('setting-org-logo-preview');
        if (settings.orgLogo && logoPreview) {
            logoPreview.src = settings.orgLogo;
            logoPreview.style.display = 'block';
            logoPreview.setAttribute('data-base64', settings.orgLogo);
        } else if (logoPreview) {
            logoPreview.style.display = 'none';
            logoPreview.removeAttribute('data-base64');
        }

        if (document.getElementById('setting-public-url')) {
            document.getElementById('setting-public-url').value = settings.publicUrl || '';
        }
        document.getElementById('setting-webhook-url').value = settings.webhookUrl || '';
        document.getElementById('setting-webhook-auth').value = settings.webhookAuth || '';

        const themeSelect = document.getElementById('setting-theme');
        if (themeSelect) themeSelect.value = settings.theme || 'solid-dark';

        const fontSelect = document.getElementById('setting-font');
        if (fontSelect) fontSelect.value = settings.font || "'Inter', sans-serif";

        const logoWidthInput = document.getElementById('setting-logo-width');
        if (logoWidthInput) logoWidthInput.value = settings.logoWidth || '40px';
        const logoHeightInput = document.getElementById('setting-logo-height');
        if (logoHeightInput) logoHeightInput.value = settings.logoHeight || '40px';

        const sbUrl = document.getElementById('setting-supabase-url');
        if (sbUrl) sbUrl.value = settings.supabaseUrl || '';

        const sbKey = document.getElementById('setting-supabase-key');
        if (sbKey) sbKey.value = settings.supabaseKey || '';

        const storageModeSelect = document.getElementById('setting-storage-mode');
        if (storageModeSelect) storageModeSelect.value = settings.storageMode || 'local';

        const localPathInput = document.getElementById('setting-local-path');
        if (localPathInput) localPathInput.value = settings.localPath || '';

        this.toggleStorageUI();
    }

    toggleStorageUI() {
        const mode = document.getElementById('setting-storage-mode')?.value || 'local';
        const localBlock = document.getElementById('storage-local-block');
        const cloudBlock = document.getElementById('storage-cloud-block');
        if (localBlock && cloudBlock) {
            if (mode === 'cloud') {
                localBlock.style.display = 'none';
                cloudBlock.style.display = 'block';
            } else {
                localBlock.style.display = 'block';
                cloudBlock.style.display = 'none';
            }
        }
    }

    renderDepartments() {
        const tbody = document.querySelector('#departments-table tbody');
        tbody.innerHTML = '';
        const deps = this.store.getDepartments();
        const users = this.store.getUsers();

        deps.forEach(dept => {
            const userCount = users.filter(u => u.departmentId === dept.id).length;
            const row = `<tr>
                <td style="color: var(--text-muted); font-family: monospace;">${dept.id}</td>
                <td><strong>${dept.name}</strong></td>
                <td><span class="badge ${userCount > 0 ? 'badge-available' : 'badge-assigned'}">${userCount} Users</span></td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="window.app.deleteDepartment('${dept.id}')"><i class="fas fa-trash"></i> Delete</button>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    renderUsers() {
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';
        const rawUsers = this.store.getUsers();
        const deps = this.store.getDepartments();

        const searchInput = document.getElementById('search-users');
        const clearBtn = document.getElementById('clear-search-users');
        const filterDept = document.getElementById('filter-users-dept');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedDept = filterDept ? filterDept.value : '';

        // Safely add listeners if they don't exist
        if (searchInput && !searchInput.hasAttribute('data-bound')) {
            searchInput.addEventListener('input', () => this.renderUsers());
            searchInput.setAttribute('data-bound', 'true');
        }
        if (clearBtn && !clearBtn.hasAttribute('data-bound')) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.renderUsers();
            });
            clearBtn.setAttribute('data-bound', 'true');
        }
        if (filterDept && !filterDept.hasAttribute('data-bound')) {
            filterDept.addEventListener('change', () => this.renderUsers());
            filterDept.setAttribute('data-bound', 'true');
        }

        const users = rawUsers.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(searchTerm) || user.email.toLowerCase().includes(searchTerm) || (user.empId && user.empId.toLowerCase().includes(searchTerm));
            const matchesDept = selectedDept === '' || user.departmentId === selectedDept;
            return matchesSearch && matchesDept;
        });

        users.forEach(user => {
            const dept = deps.find(d => d.id === user.departmentId)?.name || 'Unknown';
            const roleBadge = user.role === 'Admin' ? 'badge-assigned' : 'badge-available';

            // Disable all actions if not admin
            let actions = `
                <button class="btn btn-sm btn-primary" onclick="window.app.openUserProfile('${user.id}')" title="View Dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
                <button class="btn btn-sm btn-secondary" onclick="window.app.openEditUserModal('${user.id}')" ${this.currentUser.role !== 'Admin' ? 'disabled' : ''}><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="window.app.deleteUser('${user.id}')" ${this.currentUser.role !== 'Admin' || user.id === this.currentUser.id ? 'disabled' : ''}><i class="fas fa-trash"></i></button>
            `;

            const imgHtml = user.image ? `<img src="${user.image}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border:1px solid var(--glass-border);">` : `<div style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; border:1px solid var(--glass-border);"><i class="fas fa-user" style="font-size:12px; color:var(--text-muted)"></i></div>`;

            const row = `<tr>
                <td style="color: var(--text-muted); font-family: monospace;">${user.empId || '-'}</td>
                <td style="display:flex; align-items:center; gap:10px;">${imgHtml} <strong>${user.name}</strong></td>
                <td>${user.email}</td>
                <td>${dept}</td>
                <td><span class="badge ${roleBadge}" style="background: ${user.role === 'Admin' ? 'rgba(255, 193, 7, 0.1)' : ''}; color: ${user.role === 'Admin' ? 'var(--warning)' : ''}">${user.role}</span></td>
                <td>
                    <div style="display:flex; gap:8px;">
                        ${actions}
                    </div>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    renderAssets() {
        const tbody = document.querySelector('#assets-table tbody');
        tbody.innerHTML = '';
        const rawAssets = this.store.getAssets();
        const users = this.store.getUsers();

        const searchInput = document.getElementById('search-assets');
        const clearBtn = document.getElementById('clear-search-assets');
        const filterType = document.getElementById('filter-assets-type');
        const filterStatus = document.getElementById('filter-assets-status');

        if (filterType && filterType.options.length <= 1) {
            const types = this.store.getAssetTypes();
            types.forEach(t => {
                filterType.innerHTML += `<option value="${t}">${t}</option>`;
            });
        }

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const typeFilter = filterType ? filterType.value : '';
        const statusFilter = filterStatus ? filterStatus.value : '';

        if (searchInput && !searchInput.hasAttribute('data-bound')) {
            searchInput.addEventListener('input', () => this.renderAssets());
            searchInput.setAttribute('data-bound', 'true');
        }
        if (clearBtn && !clearBtn.hasAttribute('data-bound')) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.renderAssets();
            });
            clearBtn.setAttribute('data-bound', 'true');
        }
        if (filterType && !filterType.hasAttribute('data-bound')) {
            filterType.addEventListener('change', () => this.renderAssets());
            filterType.setAttribute('data-bound', 'true');
        }
        if (filterStatus && !filterStatus.hasAttribute('data-bound')) {
            filterStatus.addEventListener('change', () => this.renderAssets());
            filterStatus.setAttribute('data-bound', 'true');
        }

        const assets = rawAssets.filter(asset => {
            const matchesSearch = asset.tag.toLowerCase().includes(searchTerm) || asset.model.toLowerCase().includes(searchTerm);
            const matchesType = typeFilter === '' || asset.type === typeFilter;
            const matchesStatus = statusFilter === '' || asset.status === statusFilter;
            return matchesSearch && matchesType && matchesStatus;
        });

        assets.forEach(asset => {
            let assignedStr = '<span style="color:var(--text-muted)">Unassigned</span>';
            let actionBtn = `<button class="btn btn-sm btn-primary" onclick="window.app.openAssignAssetModal('${asset.id}', '${asset.type} - ${asset.model}')"><i class="fas fa-user-plus"></i> Assign</button>`;

            if (asset.status === 'Assigned' && asset.assignedToUserId) {
                const user = users.find(u => u.id === asset.assignedToUserId);
                assignedStr = `<strong>${user ? user.name : 'Unknown User'}</strong>`;
                actionBtn = `<button class="btn btn-sm btn-warning" style="color: #000; background: var(--warning);" onclick="window.app.unassignAsset('${asset.id}')"><i class="fas fa-undo"></i> Return</button>`;
            }

            const badgeCls = asset.status === 'Available' ? 'badge-available' : 'badge-assigned';

            const imgHtml = asset.image ? `<img src="${asset.image}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; border:1px solid var(--glass-border);">` : `<div style="width:40px; height:40px; border-radius:4px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; border:1px solid var(--glass-border);"><i class="fas fa-laptop" style="font-size:16px; color:var(--text-muted)"></i></div>`;

            const row = `<tr>
                <td>${imgHtml}</td>
                <td><strong>${asset.tag}</strong></td>
                <td>${asset.type}</td>
                <td>${asset.model}</td>
                <td><span class="badge ${badgeCls}">${asset.status}</span></td>
                <td>${assignedStr}</td>
                <td>
                    <div style="display:flex; gap:8px; align-items:center;">
                        ${actionBtn}
                        <button class="btn btn-sm btn-secondary" onclick="window.app.openEditAssetModal('${asset.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="window.app.openScrapModal('${asset.id}', '${asset.tag}', '${asset.model}')"><i class="fas fa-hammer"></i> Scrap</button>
                    </div>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    renderConsumables() {
        const tbody = document.querySelector('#consumables-table tbody');
        tbody.innerHTML = '';
        const rawItems = this.store.getConsumables();

        const searchInput = document.getElementById('search-consumables');
        const clearBtn = document.getElementById('clear-search-consumables');
        const filterType = document.getElementById('filter-consumables-type');

        if (filterType && filterType.options.length <= 1) {
            const types = this.store.getConsumableTypes();
            types.forEach(t => {
                filterType.innerHTML += `<option value="${t}">${t}</option>`;
            });
        }

        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const typeFilter = filterType ? filterType.value : '';

        if (searchInput && !searchInput.hasAttribute('data-bound')) {
            searchInput.addEventListener('input', () => this.renderConsumables());
            searchInput.setAttribute('data-bound', 'true');
        }
        if (clearBtn && !clearBtn.hasAttribute('data-bound')) {
            clearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.renderConsumables();
            });
            clearBtn.setAttribute('data-bound', 'true');
        }
        if (filterType && !filterType.hasAttribute('data-bound')) {
            filterType.addEventListener('change', () => this.renderConsumables());
            filterType.setAttribute('data-bound', 'true');
        }

        const items = rawItems.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm);
            const matchesType = typeFilter === '' || item.type === typeFilter;
            return matchesSearch && matchesType;
        });

        items.forEach(item => {
            const badgeCls = item.qty < 5 ? 'badge-low-stock' : 'badge-available';

            const imgHtml = item.image ? `<img src="${item.image}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; border:1px solid var(--glass-border);">` : `<div style="width:40px; height:40px; border-radius:4px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; border:1px solid var(--glass-border);"><i class="fas fa-box" style="font-size:16px; color:var(--text-muted)"></i></div>`;

            const row = `<tr>
                <td>${imgHtml}</td>
                <td><strong>${item.name}</strong></td>
                <td>${item.type}</td>
                <td><span class="badge ${badgeCls}">${item.qty} Unit(s)</span></td>
                <td>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button class="btn btn-sm btn-success" onclick="window.app.openAddStockModal('${item.id}', '${item.name}')"><i class="fas fa-plus"></i></button>
                        <button class="btn btn-sm btn-primary" onclick="window.app.openIssueConsumableModal('${item.id}', '${item.name}')" ${item.qty === 0 ? 'disabled' : ''}><i class="fas fa-user-minus"></i></button>
                        <button class="btn btn-sm btn-secondary" onclick="window.app.openEditConsumableModal('${item.id}')"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger" onclick="window.app.deleteConsumable('${item.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }

    renderReports() {
        // Full History
        const tbodyHistory = document.querySelector('#reports-table tbody');
        tbodyHistory.innerHTML = '';
        const reports = this.store.getReports();

        reports.forEach(r => {
            if (r.action === 'Scrap Asset') return;

            const dateStr = new Date(r.date).toLocaleString();
            const row = `<tr>
                <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                <td><strong>${r.action}</strong></td>
                <td>${r.item || '-'}</td>
                <td>${r.user || '-'}</td>
                <td style="color: var(--text-muted);">${r.details}</td>
            </tr>`;
            tbodyHistory.innerHTML += row;
        });

        // Assets List
        const tbodyAssets = document.querySelector('#report-assets-table tbody');
        tbodyAssets.innerHTML = '';
        this.store.getAssets().forEach(a => {
            tbodyAssets.innerHTML += `<tr>
                <td><strong>${a.tag}</strong></td>
                <td>${a.type}</td>
                <td>${a.model}</td>
                <td><span class="badge ${a.status === 'Available' ? 'badge-available' : 'badge-assigned'}">${a.status}</span></td>
            </tr>`;
        });

        // Custodians List
        const tbodyCustodians = document.querySelector('#report-custodians-table tbody');
        tbodyCustodians.innerHTML = '';
        const users = this.store.getUsers();
        const depts = this.store.getDepartments();
        const assets = this.store.getAssets();

        users.forEach(u => {
            const userAssets = assets.filter(a => a.assignedToUserId === u.id);
            if (userAssets.length > 0) {
                const dept = depts.find(d => d.id === u.departmentId)?.name || 'Unknown';
                const assetStrings = userAssets.map(a => `${a.type} [${a.tag}]`).join(', ');
                tbodyCustodians.innerHTML += `<tr>
                    <td><strong>${u.name}</strong> (${u.empId || u.id})</td>
                    <td>${dept}</td>
                    <td style="color: var(--text-muted); font-size: 13px;">${assetStrings}</td>
                </tr>`;
            }
        });

        // Toners / Consumable Consumers
        const tbodyToners = document.querySelector('#report-toners-table tbody');
        tbodyToners.innerHTML = '';
        // Find issue actions from history
        const tonerIssues = reports.filter(r => r.action === 'Issue Consumable');
        tonerIssues.forEach(r => {
            const dateStr = new Date(r.date).toLocaleDateString();
            // Extract qty from "Issued X to User. Remaining: Y"
            const match = r.details.match(/Issued (\d+)/);
            const qty = match ? match[1] : '1';

            tbodyToners.innerHTML += `<tr>
                <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                <td><strong>${r.user}</strong></td>
                <td>${r.item}</td>
                <td>${qty} Units</td>
            </tr>`;
        });

        // Email Logs
        const tbodyEmails = document.querySelector('#report-emails-table tbody');
        tbodyEmails.innerHTML = '';
        const emailLogs = this.store.getEmailLogs();
        emailLogs.forEach(r => {
            const dateStr = new Date(r.date).toLocaleString();
            let badgeCls = r.status === 'Success' ? 'badge-available' : 'badge-low-stock';

            tbodyEmails.innerHTML += `<tr>
                <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                <td><strong>${r.to}</strong></td>
                <td>${r.subject}</td>
                <td><span class="badge ${badgeCls}">${r.status}</span></td>
                <td style="color: var(--text-muted); font-size: 13px;">${r.details}</td>
            </tr>`;
        });

        // Login Logs
        const tbodyLoginLogs = document.querySelector('#report-login-logs-table tbody');
        if (tbodyLoginLogs) {
            tbodyLoginLogs.innerHTML = '';
            const loginLogs = this.store.getLoginLogs();
            loginLogs.forEach(r => {
                const dateStr = new Date(r.date).toLocaleString();
                const isSuccess = r.status === 'Success';

                tbodyLoginLogs.innerHTML += `<tr>
                    <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                    <td style="font-family: monospace;">${r.userId || '-'}</td>
                    <td><strong>${r.name}</strong></td>
                    <td><span class="badge ${isSuccess ? 'badge-available' : 'badge-low-stock'}">${r.status}</span></td>
                </tr>`;
            });
        }

        this.renderScrapReport();
        this.renderInventoryAudits();
    }

    renderScrapReport() {
        const tbodyScrap = document.querySelector('#report-scrapped-table tbody');
        if (!tbodyScrap) return;
        tbodyScrap.innerHTML = '';

        const scrapped = this.store.data.scrappedAssets || [];
        const filterYear = document.getElementById('filter-scrap-year');

        // Populate year filter dropdown dynamically
        if (filterYear && filterYear.options.length <= 1) {
            const years = [...new Set(scrapped.map(a => a.scrapYear))].sort((a, b) => b - a);
            years.forEach(y => {
                if (y) filterYear.innerHTML += `<option value="${y}">${y}</option>`;
            });
            filterYear.addEventListener('change', () => this.renderScrapReport());
        }

        const selectedYear = filterYear ? filterYear.value : '';

        const filteredScrap = scrapped.filter(a => selectedYear === '' || String(a.scrapYear) === selectedYear);

        filteredScrap.forEach(a => {
            const dateStr = a.scrapDate ? new Date(a.scrapDate).toLocaleDateString() : '-';
            tbodyScrap.innerHTML += `<tr>
                <td><strong>${a.scrapYear || '-'}</strong></td>
                <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                <td><span style="font-family: monospace;">${a.tag}</span></td>
                <td>${a.type}</td>
                <td>${a.model}</td>
                <td style="color: var(--warning);">${a.scrapReason || '-'}</td>
            </tr>`;
        });
    }

    switchReportTab(targetId) {
        // Reset buttons
        const buttons = document.querySelectorAll('.report-tabs button');
        buttons.forEach(b => {
            b.classList.remove('active-tab', 'btn-primary');
            b.classList.add('btn-secondary');
            if (b.getAttribute('onclick').includes(targetId)) {
                b.classList.remove('btn-secondary');
                b.classList.add('btn-primary', 'active-tab');
            }
        });

        // Reset Views
        document.querySelectorAll('.report-content-tab').forEach(c => c.style.display = 'none');
        document.getElementById(targetId).style.display = 'block';
    }

    renderInventoryAudits() {
        const tbody = document.querySelector('#inventory-audits-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const checks = this.store.getInventoryChecks();
        checks.forEach(check => {
            const dateStr = new Date(check.date).toLocaleDateString();
            const badgeCls = check.status === 'Active' ? 'badge-available' : 'badge-assigned';

            let actionBtn = '';
            if (check.status === 'Active') {
                actionBtn = `<button class="btn btn-sm btn-primary" onclick="window.app.emailCustodians('${check.id}')"><i class="fas fa-envelope"></i> Email Custodians</button>
                             <button class="btn btn-sm btn-secondary" onclick="window.app.closeInventoryCheck('${check.id}')"><i class="fas fa-check"></i> Close Audit</button>
                             <button class="btn btn-sm btn-secondary" onclick="window.app.openViewAuditModal('${check.id}')"><i class="fas fa-eye"></i> View Responses (${check.responses ? check.responses.length : 0})</button>`;
            } else {
                actionBtn = `<span style="color:var(--text-muted); font-size:13px; margin-right: 12px;">Audit Closed</span>
                             <button class="btn btn-sm btn-secondary" onclick="window.app.openViewAuditModal('${check.id}')"><i class="fas fa-eye"></i> View Responses (${check.responses ? check.responses.length : 0})</button>`;
            }

            tbody.innerHTML += `<tr>
                <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                <td><strong>${check.name}</strong></td>
                <td><span class="badge ${badgeCls}">${check.status}</span></td>
                <td style="display:flex; gap:8px;">${actionBtn}</td>
            </tr>`;
        });
    }

    closeInventoryCheck(id) {
        if (confirm("Are you sure you want to close this audit? You won't be able to trigger bulk emails for it anymore.")) {
            this.store.closeInventoryCheck(id);
            this.renderAll();
            this.showToast('Inventory Audit Closed.');
        }
    }

    openViewAuditModal(auditId) {
        // Construct link for the standalone printable report
        let currentUrl = window.location.href.split('?')[0].split('#')[0];
        if (currentUrl.endsWith('index.html')) {
            currentUrl = currentUrl.replace('index.html', 'audit-report.html');
        } else if (currentUrl.endsWith('/')) {
            currentUrl += 'audit-report.html';
        } else {
            currentUrl += '/audit-report.html';
        }

        const reportUrl = `${currentUrl}?audit=${auditId}`;
        window.open(reportUrl, '_blank');
    }

    async emailCustodians(auditId) {
        const settings = this.store.getSettings();
        if (!settings.webhookUrl) {
            alert("Warning: Cannot send emails because no Webhook URL is configured in Settings.");
            return;
        }

        if (!confirm("This will email ALL custodians with a list of their assigned assets asking for condition confirmation. Continue?")) return;

        this.showToast('Initiating bulk email drop... Please wait.');

        const users = this.store.getUsers();
        const assets = this.store.getAssets();
        let sentCount = 0;

        for (const user of users) {
            const userAssets = assets.filter(a => a.assignedToUserId === user.id);
            if (userAssets.length > 0) {
                const assetListStr = userAssets.map(a => `- ${a.type} ${a.model} (Tag: ${a.tag})`).join('\n');

                // Construct magic link for Custodian Portal
                // Default to GitHub Pages domain if no public URL is defined, so magic links always work globally
                let currentUrl = window.location.href.split('?')[0].split('#')[0];
                let publicSetting = settings.publicUrl ? settings.publicUrl.trim().replace(/\/$/, '').replace(/\/index\.html$/i, '').replace(/\/portal\.html$/i, '') : 'https://majeer-stack.github.io/Assetmanagement';
                let portalBase = publicSetting;

                try {
                    if (portalBase && (portalBase.includes('localhost') || portalBase.includes('127.0.0.1'))) {
                        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                            portalBase = '';
                        }
                    }
                } catch (e) { }

                if (portalBase) {
                    currentUrl = `${portalBase}/portal.html`;
                } else {
                    if (currentUrl.endsWith('index.html')) {
                        currentUrl = currentUrl.replace('index.html', 'portal.html');
                    } else if (currentUrl.endsWith('/')) {
                        currentUrl += 'portal.html';
                    } else {
                        currentUrl += '/portal.html';
                    }
                }

                const magicLink = `${currentUrl}?audit=${auditId}&user=${user.id}`;

                const subject = `ACTION REQUIRED: Annual IT Inventory Check Confirmation`;
                const message = `Hello ${user.name},\n\nAs part of our standard IT Inventory check, please review your assigned assets and confirm you are still in possession of them.\n\nYOUR ASSETS:\n${assetListStr}\n\nPlease click the secure link below to submit your confirmation directly into the IT portal:\n${magicLink}\n\nThis link is valid for 24 hours.\n\nThank you,\nIT Department`;

                await this.sendEmailNotification(user.email, subject, message);
                sentCount++;

                // artificial delay to prevent rate limits
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        this.showToast(`Completed. Dispatched ${sentCount} inventory confirmation emails.`);
    }

    renderDashboard() {
        const assets = this.store.getAssets();
        const users = this.store.getUsers();
        const depts = this.store.getDepartments();
        const cons = this.store.getConsumables();
        const reports = this.store.getReports();

        document.getElementById('stat-total-assets').innerText = assets.length;
        document.getElementById('stat-total-users').innerText = users.length;
        document.getElementById('stat-total-departments').innerText = depts.length;

        const lowStockCount = cons.filter(c => c.qty < 5).length;
        document.getElementById('stat-low-stock').innerText = lowStockCount;

        // Recent assignments (last 5 assign actions)
        const recentTbody = document.querySelector('#recent-assignments-table tbody');
        recentTbody.innerHTML = '';

        const recentAssigns = reports.filter(r => r.action === 'Assign Asset' || r.action === 'Issue Consumable').slice(0, 5);
        if (recentAssigns.length === 0) {
            recentTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No recent assignments</td></tr>';
        } else {
            recentAssigns.forEach(r => {
                const row = `<tr>
                    <td style="color: var(--text-muted);">${new Date(r.date).toLocaleDateString()}</td>
                    <td><strong>${r.user}</strong></td>
                    <td>${r.action === 'Assign Asset' ? 'Hardware' : 'Consumable'}</td>
                    <td>${r.item}</td>
                </tr>`;
                recentTbody.innerHTML += row;
            });
        }
    }

    openUserProfile(userId) {
        let currentUrl = window.location.href.split('?')[0].split('#')[0];
        if (currentUrl.endsWith('index.html')) {
            currentUrl = currentUrl.replace('index.html', 'user-profile.html');
        } else if (currentUrl.endsWith('/')) {
            currentUrl += 'user-profile.html';
        } else {
            currentUrl += '/user-profile.html';
        }

        const profileUrl = `${currentUrl}?user=${userId}`;
        window.open(profileUrl, '_blank');
    }

    confirmAction(title, message, callback) {
        document.getElementById('confirm-modal-title').innerText = title;
        document.getElementById('confirm-modal-message').innerText = message;

        const yesBtn = document.getElementById('confirm-modal-yes');
        const newYesBtn = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

        newYesBtn.addEventListener('click', () => {
            this.closeModal('confirm-modal');
            callback();
        });

        this.openModal('confirm-modal');
    }

    // --- Action Wrappers for UI Buttons ---
    deleteDepartment(id) {
        this.confirmAction('Delete Department', 'Are you sure you want to delete this department?', () => {
            this.store.deleteDepartment(id);
            this.renderAll();
        });
    }
    deleteUser(id) {
        this.confirmAction('Delete User', 'Are you sure you want to delete this user? It will return assigned assets to available.', () => {
            this.store.deleteUser(id);
            this.renderAll();
        });
    }
    deleteAsset(id) {
        this.confirmAction('Delete Asset', 'Are you sure you want to permanently delete this asset?', () => {
            this.store.deleteAsset(id);
            this.renderAll();
        });
    }
    async unassignAsset(id) {
        this.confirmAction('Return Asset', 'Return asset to available inventory?', async () => {
            const result = this.store.unassignAsset(id);
            this.renderAll();
            if (result && result.user) {
                const { user, asset } = result;
                this.showToast(`Asset returned by ${user.name}.`);
                await this.sendEmailNotification(
                    user.email,
                    'IT Hardware Returned',
                    `Hello ${user.name},\n\nWe confirm the successful return of the following IT hardware:\n${asset.type} (Tag: ${asset.tag})\n\nThank you for returning it to the IT department.`
                );
            }
        });
    }
    deleteConsumable(id) {
        this.confirmAction('Delete Consumable', 'Remove this consumable item category completely?', () => {
            this.store.deleteConsumable(id);
            this.renderAll();
        });
    }

    // Modal Helpers
    populateAssetTypesDropdown() {
        const select = document.getElementById('asset-type');
        select.innerHTML = '';
        this.store.getAssetTypes().forEach(t => {
            select.innerHTML += `<option value="${t}">${t}</option>`;
        });
    }

    renderAssetTypesList() {
        const list = document.getElementById('asset-types-list');
        list.innerHTML = '';
        this.store.getAssetTypes().forEach(t => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '8px';
            li.style.background = 'rgba(255,255,255,0.05)';
            li.style.borderRadius = '4px';

            li.innerHTML = `<span>${t}</span>
                <button type="button" class="btn btn-sm btn-danger" onclick="window.app.deleteAssetType('${t}')">
                    <i class="fas fa-trash"></i>
                </button>`;
            list.appendChild(li);
        });
    }

    deleteAssetType(type) {
        this.confirmAction('Delete Asset Type', `Remove asset type '${type}'?`, () => {
            this.store.deleteAssetType(type);
            this.renderAssetTypesList();
            this.populateAssetTypesDropdown();
        });
    }

    // Consumable Types Dropdown Logic
    populateConsumableTypesDropdown() {
        const select = document.getElementById('consumable-type');
        if (!select) return;
        select.innerHTML = '';
        this.store.getConsumableTypes().forEach(t => {
            select.innerHTML += `<option value="${t}">${t}</option>`;
        });
    }

    renderConsumableTypesList() {
        const list = document.getElementById('consumable-types-list');
        if (!list) return;
        list.innerHTML = '';
        this.store.getConsumableTypes().forEach(t => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '8px';
            li.style.background = 'rgba(255,255,255,0.05)';
            li.style.borderRadius = '4px';

            li.innerHTML = `<span>${t}</span>
                <button type="button" class="btn btn-sm btn-danger" onclick="window.app.deleteConsumableType('${t}')">
                    <i class="fas fa-trash"></i>
                </button>`;
            list.appendChild(li);
        });
    }

    deleteConsumableType(type) {
        this.confirmAction('Delete Consumable Type', `Remove consumable type '${type}'?`, () => {
            this.store.deleteConsumableType(type);
            this.renderConsumableTypesList();
            this.populateConsumableTypesDropdown();
        });
    }

    openConsumableTypesModal() {
        this.renderConsumableTypesList();
        this.openModal('consumable-types-modal');
    }

    populateUserSelect(selectId) {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">Select User...</option>';
        this.store.getUsers().forEach(u => {
            select.innerHTML += `<option value="${u.id}">${u.name}</option>`;
        });
    }

    openAssignAssetModal(assetId, assetDisplay) {
        document.getElementById('assign-asset-id').value = assetId;
        document.getElementById('assign-asset-display').innerText = assetDisplay;
        this.populateUserSelect('assign-user-id');
        this.openModal('assign-asset-modal');
    }

    openIssueConsumableModal(itemId, itemName) {
        document.getElementById('issue-consumable-id').value = itemId;
        document.getElementById('issue-consumable-display').innerText = itemName;
        document.getElementById('issue-qty').value = 1;
        this.populateUserSelect('issue-user-id');
        this.openModal('issue-consumable-modal');
    }

    openEditUserModal(id) {
        const user = this.store.getUsers().find(u => u.id === id);
        if (user) {
            this.openModal('user-modal'); // Re-uses modal
            document.getElementById('edit-user-id').value = id;
            document.getElementById('user-modal-title').innerText = 'Edit User';

            document.getElementById('user-emp-id').value = user.empId || '';
            document.getElementById('user-name').value = user.name || '';
            document.getElementById('user-email').value = user.email || '';
            document.getElementById('user-department').value = user.departmentId || '';

            const imgPreview = document.getElementById('user-image-preview');
            if (user.image && imgPreview) {
                imgPreview.src = user.image;
                imgPreview.style.display = 'block';
                imgPreview.setAttribute('data-base64', user.image);
            } else if (imgPreview) {
                imgPreview.style.display = 'none';
                imgPreview.removeAttribute('data-base64');
            }

            if (this.currentUser.role === 'Admin') {
                document.getElementById('user-role').value = user.role || 'User';
                // Password should remain blank during editing unless the admin explicitly wants to change it
                const pwdInput = document.getElementById('user-password');
                pwdInput.value = '';
                pwdInput.removeAttribute('required'); // Not required when editing
            }
        }
    }

    openScrapModal(assetId, assetTag, assetModel) {
        document.getElementById('scrap-asset-id').value = assetId;
        document.getElementById('scrap-asset-display').innerText = `${assetTag} - ${assetModel}`;
        document.getElementById('scrap-reason').value = '';
        document.getElementById('scrap-year').value = new Date().getFullYear();
        this.openModal('scrap-asset-modal');
    }

    openEditAssetModal(id) {
        const asset = this.store.getAssets().find(a => a.id === id);
        if (asset) {
            this.openModal('asset-modal');
            document.getElementById('edit-asset-id').value = id;
            document.getElementById('asset-modal-title').innerText = 'Edit IT Asset';

            document.getElementById('asset-type').value = asset.type || '';
            document.getElementById('asset-tag').value = asset.tag || '';
            document.getElementById('asset-model').value = asset.model || '';

            const imgPreview = document.getElementById('asset-image-preview');
            if (asset.image && imgPreview) {
                imgPreview.src = asset.image;
                imgPreview.style.display = 'block';
                imgPreview.setAttribute('data-base64', asset.image);
            } else if (imgPreview) {
                imgPreview.style.display = 'none';
                imgPreview.removeAttribute('data-base64');
            }
        }
    }

    openEditConsumableModal(id) {
        const item = this.store.getConsumables().find(c => c.id === id);
        if (item) {
            this.openModal('consumable-modal');
            document.getElementById('edit-consumable-id').value = id;
            document.getElementById('consumable-modal-title').innerText = 'Edit Consumable Details';

            document.getElementById('consumable-name').value = item.name || '';
            document.getElementById('consumable-type').value = item.type || '';

            // Hide initial quantity field on edits
            document.getElementById('consumable-qty-group').style.display = 'none';
            document.getElementById('consumable-qty').removeAttribute('required');

            const imgPreview = document.getElementById('consumable-image-preview');
            if (item.image && imgPreview) {
                imgPreview.src = item.image;
                imgPreview.style.display = 'block';
                imgPreview.setAttribute('data-base64', item.image);
            } else if (imgPreview) {
                imgPreview.style.display = 'none';
                imgPreview.removeAttribute('data-base64');
            }
        }
    }

    openAddStockModal(itemId, itemName) {
        document.getElementById('add-stock-id').value = itemId;
        document.getElementById('add-stock-display').innerText = itemName;
        document.getElementById('add-stock-qty').value = 1;
        this.openModal('add-stock-modal');
    }

    testEmailSettings() {
        this.openModal('email-test-modal');
    }

    async sendTestEmail() {
        const toAddress = document.getElementById('test-email-address').value;
        if (!toAddress) {
            this.showToast('Please enter an email address.');
            return;
        }

        this.closeModal('email-test-modal');
        this.showToast('Sending test email, please wait...');

        await this.sendEmailNotification(
            toAddress.trim(),
            'AssetFlow SMTP Test',
            'This is a test email from AssetFlow to verify your SMTP settings are working correctly.'
        );
    }

    printCurrentModal(modalId) {
        // Temporarily assign printing classes
        document.body.classList.add('printing-modal');
        const modal = document.getElementById(modalId);

        // Let CSS changes settle
        setTimeout(() => {
            window.print();

            // Remove after print dialog closes
            setTimeout(() => {
                document.body.classList.remove('printing-modal');
            }, 500);
        }, 100);
    }

}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AssetFlowApp();
});

class DataStore {
    constructor() {
        this.storageKey = 'assetFlowData_v1';

        // Load local data first to read user settings
        this.data = this.loadLocalData(this.getDefaultData());

        const settings = this.data.settings || {};
        this.supabaseUrl = settings.supabaseUrl || '';
        this.supabaseKey = settings.supabaseKey || '';
        this.storageMode = settings.storageMode || 'local';

        // Ensure Supabase is configured and mode is strictly set to cloud
        if (this.storageMode !== 'cloud' || typeof window.supabase === 'undefined' || !this.supabaseUrl || !this.supabaseKey) {
            console.log("Using Local Storage Mode. Cloud database sync is disabled.");
            this.supabase = null;
        } else {
            this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        }
    }

    getDefaultData() {
        return {
            departments: [],
            users: [],
            assetTypes: ['Laptop', 'Desktop', 'Printer', 'Other'],
            consumableTypes: ['Toner', 'Cartridge', 'Other'],
            assets: [],
            scrappedAssets: [],
            consumables: [],
            reports: [],
            inventoryChecks: [],
            emailLogs: [],
            loginLogs: [],
            settings: { webhookUrl: '', webhookAuth: '', publicUrl: '', orgName: 'AssetFlow', orgLogo: null, logoWidth: '40px', logoHeight: 'auto', storageMode: 'local', localPath: '' }
        };
    }

    // Helper to get absolute API URL
    getApiUrl(endpoint) {
        const settings = this.data.settings || {};
        let base = settings.publicUrl ? settings.publicUrl.trim().replace(/\/$/, '') : '';
        // If there is no public URL, assume we are hosting this directory and use relative path
        return base ? `${base}${endpoint}` : endpoint;
    }

    // New Async Initialization
    async init() {
        // Determine environment: are we running via Node server or local file system?
        const isServerEnv = window.location.protocol.startsWith('http');

        if (isServerEnv && (!this.storageMode || this.storageMode !== 'cloud')) {
            try {
                const apiUrl = this.getApiUrl('/api/data');
                const response = await fetch(apiUrl);
                if (response.ok) {
                    const serverData = await response.json();
                    if (serverData && Object.keys(serverData).length > 0) {
                        this.data = {
                            ...this.getDefaultData(),
                            ...serverData,
                            settings: { ...this.getDefaultData().settings, ...(serverData.settings || {}) }
                        };
                        console.log("Loaded data from Node.js Backend API.");
                        await this.ensureAdminExists();
                        return true;
                    }
                }
            } catch (e) {
                console.warn("Failed to connect to Local API, falling back to Local Storage / Supabase.", e);
            }
        }

        // Fallback or Legacy Supabase Logic
        if (!this.supabase) {
            this.data = this.loadLocalData(this.getDefaultData());
            await this.ensureAdminExists();
            return true;
        }

        try {
            const { data, error } = await this.supabase
                .from('app_state')
                .select('data')
                .eq('id', 1)
                .single();

            if (error) {
                console.warn("Could not load from Supabase:", error.message);
                this.data = this.loadLocalData(this.getDefaultData());
                await this.saveData();
            } else if (data && data.data) {
                const localData = this.loadLocalData(this.getDefaultData());
                this.data = data.data;
                if (!this.data.settings) this.data.settings = {};
                this.data.settings.supabaseUrl = localData.settings.supabaseUrl;
                this.data.settings.supabaseKey = localData.settings.supabaseKey;
                localStorage.setItem(this.storageKey, JSON.stringify(this.data));
            } else {
                this.data = this.loadLocalData(this.getDefaultData());
                await this.saveData();
            }

            await this.ensureAdminExists();

        } catch (e) {
            console.error("Supabase init error:", e);
            this.data = this.loadLocalData(this.getDefaultData());
        }

        return true;
    }

    async ensureAdminExists() {
        let needsSave = false;
        if (!this.data) this.data = this.getDefaultData();
        if (!this.data.users) this.data.users = [];

        const hasAdmin = this.data.users.some(u => u.role === 'Admin');
        if (!hasAdmin) {
            this.data.users.push({
                id: 'admin_001',
                empId: 'ADMIN',
                name: 'System Admin',
                email: 'admin@local',
                departmentId: null,
                role: 'Admin',
                password: 'admin'
            });
            needsSave = true;
            console.log("Injected default admin user");
        }

        if (needsSave) {
            await this.saveData();
        }
    }

    loadLocalData(defaultData) {
        const stored = localStorage.getItem(this.storageKey);
        let dataToReturn = defaultData;

        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                dataToReturn = {
                    ...defaultData,
                    ...parsed,
                    settings: { ...defaultData.settings, ...(parsed.settings || {}) }
                };

                // Ensure existing users have a role and password if missing (legacy support)
                if (dataToReturn.users) {
                    dataToReturn.users = dataToReturn.users.map(u => ({
                        ...u,
                        role: u.role || 'User',
                        password: u.password || 'password123'
                    }));
                }
                if (!dataToReturn.inventoryChecks) dataToReturn.inventoryChecks = [];
            } catch (error) {
                console.error('Error loading data from localStorage', error);
            }
        }

        // Auto-create default admin if no Admin exists
        const hasAdmin = dataToReturn.users && dataToReturn.users.some(u => u.role === 'Admin');
        if (!hasAdmin) {
            if (!dataToReturn.users) dataToReturn.users = [];
            dataToReturn.users.push({
                id: 'admin_001',
                empId: 'ADMIN',
                name: 'System Admin',
                email: 'admin@local',
                departmentId: null,
                role: 'Admin',
                password: 'admin'
            });
        }

        return dataToReturn;
    }

    async saveData() {
        // Always save locally as a backup / immediate cache
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));

        const isServerEnv = window.location.protocol.startsWith('http');
        if (isServerEnv && (!this.storageMode || this.storageMode !== 'cloud')) {
            try {
                const apiUrl = this.getApiUrl('/api/data');
                await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.data)
                });
            } catch (e) {
                console.warn("Failed to sync to Node.js Backend API:", e);
            }
        }

        // Push to Supabase if connected
        if (this.supabase) {
            try {
                await this.supabase
                    .from('app_state')
                    .upsert({ id: 1, data: this.data });
            } catch (e) {
                console.error("Failed to sync to Supabase:", e);
            }
        }
    }

    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    addReportLog(action, item, user, details) {
        this.data.reports.unshift({
            id: this.generateId(),
            date: new Date().toISOString(),
            action,
            item,
            user,
            details
        });
        this.saveData();
    }

    addEmailLog(to, subject, status, details) {
        if (!this.data.emailLogs) this.data.emailLogs = [];
        this.data.emailLogs.unshift({
            id: this.generateId(),
            date: new Date().toISOString(),
            to,
            subject,
            status, // 'Success', 'Failed'
            details
        });
        this.saveData();
    }
    getEmailLogs() {
        return this.data.emailLogs || [];
    }

    /* --- Inventory Checks --- */
    getInventoryChecks() {
        return this.data.inventoryChecks || [];
    }

    addInventoryCheck(name) {
        const id = this.generateId();
        this.data.inventoryChecks.unshift({
            id,
            date: new Date().toISOString(),
            name,
            status: 'Active',
            responses: []
        });
        this.saveData();
        return id;
    }

    closeInventoryCheck(id) {
        const check = this.data.inventoryChecks.find(c => c.id === id);
        if (check) {
            check.status = 'Closed';
            this.saveData();
        }
    }

    submitAuditResponse(auditId, userId, status, condition, notes) {
        const check = this.data.inventoryChecks.find(c => c.id === auditId);
        if (check && check.status === 'Active') {
            if (!check.responses) check.responses = [];
            check.responses.push({
                userId,
                date: new Date().toISOString(),
                status: status || 'Confirmed',
                condition: condition || 'Not Specified',
                notes: notes || ''
            });
            this.saveData();
            return true;
        }
        return false;
    }

    // --- AUTH & LOGIN LOGS ---
    authenticateUser(email, password) {
        const user = this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (!user) {
            this.addLoginLog(null, email, 'Failed - User Not Found');
            return null;
        }

        if (user.password === password) {
            this.addLoginLog(user.id, user.name, 'Success');
            return user;
        } else {
            this.addLoginLog(user.id, user.name, 'Failed - Wrong Password');
            return null;
        }
    }

    addLoginLog(userId, name, status) {
        if (!this.data.loginLogs) this.data.loginLogs = [];
        this.data.loginLogs.unshift({
            id: this.generateId(),
            date: new Date().toISOString(),
            userId,
            name,
            status
        });

        // Keep logs from growing forever, keep last 100
        if (this.data.loginLogs.length > 100) {
            this.data.loginLogs = this.data.loginLogs.slice(0, 100);
        }
        this.saveData();
    }

    getLoginLogs() {
        return this.data.loginLogs || [];
    }

    // --- SETTINGS ---
    getSettings() {
        return this.data.settings || { webhookUrl: '', webhookAuth: '', publicUrl: '' };
    }
    updateSettings(settings) {
        this.data.settings = { ...this.getSettings(), ...settings };
        this.saveData();
    }

    // --- DEPARTMENTS ---
    getDepartments() { return this.data.departments; }
    addDepartment(name) {
        const dept = { id: this.generateId(), name };
        this.data.departments.push(dept);
        this.addReportLog('Create Department', name, 'Admin', `Created department ${name}`);
        this.saveData();
        return dept;
    }
    deleteDepartment(id) {
        const dept = this.data.departments.find(d => d.id === id);
        this.data.departments = this.data.departments.filter(d => d.id !== id);
        // Also cleanup users or handle them. For now simple deletion.
        this.addReportLog('Delete Department', dept?.name, 'Admin', 'Deleted department');
        this.saveData();
    }

    // --- USERS ---
    getUsers() { return this.data.users; }
    addUser(empId, name, email, departmentId, role = 'User', password = 'password123', image = null) {
        const user = { id: this.generateId(), empId, name, email, departmentId, role, password, image };
        this.data.users.push(user);
        this.addReportLog('Create User', name, 'Admin', `Added user [${empId}] to dept ${departmentId} with role ${role}`);
        this.saveData();
        return user;
    }
    editUser(id, empId, name, email, departmentId, role, password, image) {
        const user = this.data.users.find(u => u.id === id);
        if (user) {
            user.empId = empId;
            user.name = name;
            user.email = email;
            user.departmentId = departmentId;
            if (role) user.role = role;
            if (password) user.password = password; // Only update if provided
            if (image !== undefined) user.image = image; // Allow clearing with null, skip if undefined

            this.addReportLog('Edit User', name, 'Admin', `Updated user details for [${empId}]`);
            this.saveData();
            return user;
        }
    }
    deleteUser(id) {
        const user = this.data.users.find(u => u.id === id);
        // Remove assignments
        this.data.assets.forEach(a => {
            if (a.assignedToUserId === id) {
                a.assignedToUserId = null;
                a.status = 'Available';
            }
        });
        this.data.users = this.data.users.filter(u => u.id !== id);
        this.addReportLog('Delete User', user?.name, 'Admin', 'Deleted user and unassigned assets');
        this.saveData();
    }

    // --- ASSET TYPES ---
    getAssetTypes() { return this.data.assetTypes || []; }
    addAssetType(type) {
        if (!this.data.assetTypes) this.data.assetTypes = [];
        if (!this.data.assetTypes.includes(type)) {
            this.data.assetTypes.push(type);
            this.saveData();
        }
    }
    deleteAssetType(type) {
        if (!this.data.assetTypes) return;
        this.data.assetTypes = this.data.assetTypes.filter(t => t !== type);
        this.saveData();
    }

    // --- ASSETS (Hardware) ---
    getAssets() { return this.data.assets; }
    addAsset(type, tag, model, image = null) {
        const asset = { id: this.generateId(), type, tag, model, assignedToUserId: null, status: 'Available', image };
        this.data.assets.push(asset);
        this.addReportLog('Add Asset', `${type} [${tag}]`, 'System', 'Received new asset');
        this.saveData();
        return asset;
    }
    editAsset(id, type, tag, model, image) {
        const asset = this.data.assets.find(a => a.id === id);
        if (asset) {
            asset.type = type;
            asset.tag = tag;
            asset.model = model;
            if (image !== undefined) asset.image = image;

            this.addReportLog('Edit Asset', `${type} [${tag}]`, 'Admin', 'Updated asset details');
            this.saveData();
            return asset;
        }
    }
    assignAsset(assetId, userId) {
        const asset = this.data.assets.find(a => a.id === assetId);
        const user = this.data.users.find(u => u.id === userId);
        if (asset && user) {
            asset.assignedToUserId = userId;
            asset.status = 'Assigned';
            this.addReportLog('Assign Asset', `${asset.type} [${asset.tag}]`, user.name, `Assigned to ${user.name}`);
            this.saveData();
            return { user, asset }; // Return both for email notification
        }
        return null;
    }
    unassignAsset(assetId) {
        const asset = this.data.assets.find(a => a.id === assetId);
        if (asset && asset.assignedToUserId) {
            const user = this.data.users.find(u => u.id === asset.assignedToUserId);
            asset.assignedToUserId = null;
            asset.status = 'Available';
            this.addReportLog('Unassign Asset', `${asset.type} [${asset.tag}]`, 'System', 'Returned to available status');
            this.saveData();
            return { asset, user }; // Return both so we can formulate the email
        }
        return null;
    }
    deleteAsset(id) {
        const asset = this.data.assets.find(a => a.id === id);
        this.data.assets = this.data.assets.filter(a => a.id !== id);
        this.addReportLog('Delete Asset', `${asset?.type} [${asset?.tag}]`, 'Admin', 'Removed asset from system');
        this.saveData();
    }
    scrapAsset(id, reason, year) {
        const asset = this.data.assets.find(a => a.id === id);
        if (asset) {
            if (asset.assignedToUserId) {
                this.unassignAsset(id);
            }
            // unassignAsset saves data, so we re-fetch to ensure we have the clean unassigned version for the scrap record
            const cleanedAsset = this.data.assets.find(a => a.id === id) || asset;

            this.data.assets = this.data.assets.filter(a => a.id !== id);

            // Default missing arrays
            if (!this.data.scrappedAssets) {
                this.data.scrappedAssets = [];
            }

            const scrappedRecord = {
                ...cleanedAsset,
                scrapReason: reason,
                scrapYear: year,
                scrapDate: new Date().toISOString()
            };
            this.data.scrappedAssets.push(scrappedRecord);
            this.addReportLog('Scrap Asset', `${cleanedAsset.type} [${cleanedAsset.tag}]`, 'Admin', `Scrapped. Reason: ${reason}`);
            this.saveData();
        }
    }

    // --- CONSUMABLE TYPES ---
    getConsumableTypes() { return this.data.consumableTypes || ['Toner', 'Cartridge', 'Other']; }
    addConsumableType(type) {
        if (!this.data.consumableTypes) this.data.consumableTypes = ['Toner', 'Cartridge', 'Other'];
        if (!this.data.consumableTypes.includes(type)) {
            this.data.consumableTypes.push(type);
            this.saveData();
        }
    }
    deleteConsumableType(type) {
        if (!this.data.consumableTypes) return;
        this.data.consumableTypes = this.data.consumableTypes.filter(t => t !== type);
        this.saveData();
    }

    // --- CONSUMABLES (Stock) ---
    getConsumables() { return this.data.consumables; }
    addConsumableTypeRecord(name, type, qty, image = null) {
        const item = { id: this.generateId(), name, type, qty: parseInt(qty, 10), image };
        this.data.consumables.push(item);
        this.addReportLog('Add Consumable', name, 'System', `Added initial stock: ${qty}`);
        this.saveData();
        return item;
    }
    editConsumableTypeRecord(id, name, type, image) {
        const item = this.data.consumables.find(c => c.id === id);
        if (item) {
            item.name = name;
            item.type = type;
            if (image !== undefined) item.image = image;

            this.addReportLog('Edit Consumable', name, 'Admin', 'Updated consumable details');
            this.saveData();
            return item;
        }
    }
    addStock(id, qtyToAdd) {
        const item = this.data.consumables.find(c => c.id === id);
        if (item) {
            item.qty += parseInt(qtyToAdd, 10);
            this.addReportLog('Add Stock', item.name, 'System', `Added ${qtyToAdd}. New total: ${item.qty}`);
            this.saveData();
        }
    }
    issueConsumable(id, userId, qtyToIssue) {
        const item = this.data.consumables.find(c => c.id === id);
        const user = this.data.users.find(u => u.id === userId);
        const qty = parseInt(qtyToIssue, 10);
        if (item && user && item.qty >= qty) {
            item.qty -= qty;
            this.addReportLog('Issue Consumable', item.name, user.name, `Issued ${qty} to ${user.name}. Remaining: ${item.qty}`);
            this.saveData();
            return { user, item }; // Return user and item for email notification
        }
        return null; // Not enough stock or no user
    }
    deleteConsumable(id) {
        const item = this.data.consumables.find(c => c.id === id);
        this.data.consumables = this.data.consumables.filter(c => c.id !== id);
        this.addReportLog('Delete Consumable', item?.name, 'Admin', 'Removed consumable record');
        this.saveData();
    }

    // --- REPORTS ---
    getReports() { return this.data.reports; }
}

// Make accessible globally
window.Store = new DataStore();

// ========================================== 
// 1. STATE & API CONFIG
// ========================================== 
const API_URL = '/api';
let entries = [];
let categories = []; 
let profile = { name: 'User', bio: 'Learner' };
let stats = { total: 0, revision: 0, streak: 0, categories: [], activity: [], heatmap: [] };
let chatHistory = []; 
let currentTags = [];

let lastView = 'dashboard';
let currentViewId = null;

// Pagination State
let currentPage = 1;
let totalPages = 1;
let isLoading = false;

// Chart Instances
let categoryChart = null;
let activityChart = null;

function getToken() { return localStorage.getItem('token'); }
function getHeaders() {
    const token = getToken();
    return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ========================================== 
// 2. DATA OPERATIONS (ASYNC)
// ========================================== 

async function fetchEntries(reset = false) {
    if (isLoading) return;
    if (reset) currentPage = 1;
    showLoading();
    isLoading = true;
    try {
        const searchInput = document.getElementById('globalSearch');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const catFilter = document.getElementById('filter-category')?.value || '';
        const diffFilter = document.getElementById('filter-difficulty')?.value || '';

        let url = `${API_URL}/entries?page=${currentPage}&limit=15&search=${encodeURIComponent(searchTerm)}`;
        if (catFilter) url += `&category=${encodeURIComponent(catFilter)}`;
        if (diffFilter) url += `&difficulty=${diffFilter}`;

        const res = await fetch(url, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) { logout(); return; }
        if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);
        const responseData = await res.json();
        totalPages = responseData.pagination.totalPages;
        entries = responseData.data.map(e => ({
            ...e, id: e.entry_id, category: e.category_name || 'General', date: e.learning_date, notes: e.notes_markdown, difficulty: e.difficulty_level, revision: e.needs_revision, tags: e.tags || [], resources: e.resources || []
        }));
        renderDashboard(); renderLibrary(); updatePaginationUI();
    } catch (err) {
        console.error("Error loading entries:", err);
        showToast(`❌ Server Error: ${err.message || "Could not load data"}`);
    } finally {
        hideLoading(); isLoading = false;
    }
}

window.changePage = function(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage; fetchEntries(false);
        document.getElementById('library-list').scrollIntoView({ behavior: 'smooth' });
    }
}

function updatePaginationUI() {
    const bar = document.getElementById('pagination-bar');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const pageInfo = document.getElementById('page-info');
    if (!bar) return;
    if (totalPages <= 1) bar.classList.add('hidden');
    else {
        bar.classList.remove('hidden');
        prevBtn.disabled = (currentPage === 1);
        nextBtn.disabled = (currentPage === totalPages);
        pageInfo.innerText = `Page ${currentPage} of ${totalPages}`;
    }
}

function showLoading() { document.getElementById('loading-overlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

async function fetchProfile() {
    try {
        const res = await fetch(`${API_URL}/profile`, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) { logout(); return; }
        if (res.ok) { profile = await res.json(); updateSidebar(); }
    } catch (err) { console.error(err); }
}

async function fetchCategories() {
    try {
        const res = await fetch(`${API_URL}/categories`, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) { logout(); return; }
        if (res.ok) { 
            categories = await res.json(); 
            renderCategoryOptions(); 
            renderSidebarNav(); // Update sidebar with new categories
        }
    } catch (err) { console.error(err); }
}

async function fetchStats() {
    try {
        const today = getTodayString();
        const res = await fetch(`${API_URL}/stats?today=${today}`, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) { logout(); return; }
        if (res.ok) { stats = await res.json(); renderDashboard(); }
    } catch (err) { console.error(err); }
}

// ========================================== 
// 3. ROUTING SYSTEM
// ========================================== 
function _router(viewName) {
    const activeView = document.querySelector('.view.active');
    if (activeView && activeView.id !== `view-${viewName}`) lastView = activeView.id.replace('view-', '');
    document.querySelectorAll('.view').forEach(view => { view.classList.add('hidden'); view.classList.remove('active'); });
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) { targetView.classList.remove('hidden'); targetView.classList.add('active'); }
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-target="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
        if (['add', 'details', 'revision', 'settings'].includes(viewName)) topBar.classList.add('hidden');
        else topBar.classList.remove('hidden');
    }
    
    // Re-render sidebar to update active states
    renderSidebarNav();

    // Toggle active state for profile section
    const profileSection = document.querySelector('.user-profile');
    if (profileSection) {
        if (viewName === 'settings') profileSection.classList.add('active');
        else profileSection.classList.remove('active');
    }

    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'library') renderLibrary();
    if (viewName === 'settings') loadProfileIntoForm();
}

window.router = function(viewName) {
    if (hasUnsavedChanges() && !confirm("You have unsaved changes. Discard them?")) {
        return;
    }
    _router(viewName);
};

// Navigation Guard
function hasUnsavedChanges() {
    const title = document.getElementById('inp-title')?.value;
    const notes = document.getElementById('inp-notes')?.value;
    const isAdding = document.querySelector('.view.active')?.id === 'view-add';
    return isAdding && (title || notes);
}

const originalRouter = router;
window.router = function(viewName) {
    if (hasUnsavedChanges() && !confirm("You have unsaved changes. Discard them?")) {
        return;
    }
    _router(viewName);
};

function getTodayString() { return new Date().toLocaleDateString('en-CA'); }
window.goBack = function() { router(lastView || 'dashboard'); };
window.toggleSidebar = function() {
    if (window.innerWidth > 768) {
        // Desktop: Collapse/Expand
        document.querySelector('.app-container').classList.toggle('collapsed');
        const isCollapsed = document.querySelector('.app-container').classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    } else {
        // Mobile: Slide In/Out
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        sidebar.classList.toggle('open');
        
        if (sidebar.classList.contains('open')) {
            overlay.classList.remove('hidden');
            // Small timeout to allow display:block to apply before opacity transition
            setTimeout(() => overlay.classList.add('active'), 10);
        } else {
            overlay.classList.remove('active');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    }
};

// Initialize Sidebar State
document.addEventListener('DOMContentLoaded', () => {
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
        document.querySelector('.app-container').classList.add('collapsed');
    }
});

// ========================================== 
// 4. UI LOGIC & EVENTS
// ========================================== 
document.addEventListener('DOMContentLoaded', () => {
    updateSidebar();
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => { if (window.innerWidth <= 768) document.querySelector('.sidebar').classList.remove('open'); });
    });
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);
    const themeCheckbox = document.getElementById('checkbox');
    if (themeCheckbox) themeCheckbox.checked = (savedTheme === 'dark');

    if (getToken()) {
        initApp();
    } else {
        document.getElementById('landing-page').classList.remove('hidden');
        document.querySelector('.app-container').classList.add('hidden'); // Ensure app is hidden
    }

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.getElementById('globalSearch').focus(); }
    });

    const notesArea = document.getElementById('inp-notes');
    if (notesArea) {
        notesArea.addEventListener('input', function() {
            this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px';
        });
    }

    const globalSearch = document.getElementById('globalSearch');
    const clearBtn = document.getElementById('search-clear');
    let searchTimeout;

    if (globalSearch) {
        globalSearch.addEventListener('input', () => {
            if (globalSearch.value.trim().length > 0) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                fetchEntries(true);
                if (document.querySelector('.view.active').id !== 'view-library' && globalSearch.value.trim().length > 0) {
                    router('library');
                }
            }, 500);
        });

        globalSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { 
                clearTimeout(searchTimeout);
                fetchEntries(true); 
                if (document.querySelector('.view.active').id !== 'view-library') router('library'); 
            }
        });
    }
});

async function initApp() {
    document.getElementById('landing-page').classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden'); // Reveal app only now
    fetchEntries(true);
    fetchProfile();
    fetchCategories();
    fetchStats();
}

window.showLogin = function() {
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('login-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('login-email').focus(), 100);
};

window.hideLogin = function() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('landing-page').classList.remove('hidden');
};

window.handleOverlayClick = function(e) {
    // Only close if clicking the background (id="login-overlay"), not the card (child)
    if (e.target.id === 'login-overlay') {
        hideLogin();
    }
};

window.togglePasswordVisibility = function(btn) {
    const input = document.getElementById('login-pass');
    const icon = btn.querySelector('.iconify');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.setAttribute('data-icon', 'lucide:eye-off');
        btn.title = "Hide Password";
    } else {
        input.type = 'password';
        icon.setAttribute('data-icon', 'lucide:eye');
        btn.title = "Show Password";
    }
};

window.loginUser = async function() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;
    const err = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');
    btn.disabled = true; btn.innerHTML = 'Authenticating...';
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
        });
        if (res.ok) { 
            const data = await res.json(); 
            localStorage.setItem('token', data.token); 
            
            // Hide login & landing, show app
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('landing-page').classList.add('hidden');
            
            // Initialize App
            await initApp();
        }
        else err.classList.remove('hidden');
    } catch (e) { alert("Connection Error"); }
    finally { btn.disabled = false; btn.innerHTML = 'Sign In <span class="iconify" data-icon="lucide:arrow-right"></span>'; }
};

window.logout = function() { 
    localStorage.removeItem('token'); 
    document.querySelector('.app-container').classList.add('hidden');
    document.getElementById('landing-page').classList.remove('hidden');
    location.reload(); 
};

window.clearSearch = function() {
    const input = document.getElementById('globalSearch'); 
    input.value = '';
    document.getElementById('search-clear').classList.add('hidden'); 
    fetchEntries(true);
};

window.renderSidebarNav = function() {
    const nav = document.getElementById('dynamic-nav');
    if (!nav) return;

    const coreItems = [
        { label: 'Dashboard', icon: '<span class="iconify" data-icon="lucide:layout-dashboard"></span>', action: "router('dashboard')", target: 'dashboard' },
        { label: 'Add Entry', icon: '<span class="iconify" data-icon="lucide:pen-square"></span>', action: "resetAddForm()", target: 'add' },
        { label: 'Library', icon: '<span class="iconify" data-icon="lucide:library"></span>', action: "router('library')", target: 'library' }
    ];

    let html = '';

    // Core Items
    coreItems.forEach(item => {
        const activeClass = (document.querySelector('.view.active')?.id === `view-${item.target}`) ? 'active' : '';
        html += `<button class="nav-btn ${activeClass}" data-target="${item.target}" onclick="${item.action}" title="${item.label}">${item.icon} <span>${item.label}</span></button>`;
    });

    nav.innerHTML = html;
};

window.filterByCategory = function(catName) {
    const filter = document.getElementById('filter-category');
    if (filter) {
        filter.value = catName;
        router('library');
        renderLibrary();
    }
};

function renderCategoryOptions() {
    const select = document.getElementById('inp-category');
    const filterSelect = document.getElementById('filter-category');
    if(!select) return;
    select.innerHTML = '';
    if(filterSelect) filterSelect.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        const option = document.createElement('option'); option.value = cat; option.innerText = cat; select.appendChild(option);
        if(filterSelect) { const fOption = document.createElement('option'); fOption.value = cat; fOption.innerText = cat; filterSelect.appendChild(fOption); }
    });
}

window.resetFilters = function() {
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-difficulty').value = '';
    document.getElementById('globalSearch').value = '';
    fetchEntries(true);
};

window.toggleCategoryInput = function() {
    const select = document.getElementById('inp-category');
    const input = document.getElementById('inp-new-category');
    if (input.classList.contains('hidden')) { 
        select.classList.add('hidden'); 
        input.classList.remove('hidden'); 
        input.focus();
        select.value = ''; // Clear selection when typing new
    } else { 
        select.classList.remove('hidden'); 
        input.classList.add('hidden'); 
        input.value = ''; // Clear manual input when using select
    }
};

// Navigation Guard
function hasUnsavedChanges() {
    const title = document.getElementById('inp-title')?.value;
    const notes = document.getElementById('inp-notes')?.value;
    const isAdding = document.querySelector('.view.active')?.id === 'view-add';
    return isAdding && (title || notes);
}

const diffInput = document.getElementById('inp-difficulty');
if (diffInput) {
    const diffLabels = { 1: 'Beginner', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Expert' };
    diffInput.addEventListener('input', (e) => { document.getElementById('diff-label').innerText = diffLabels[e.target.value]; });
}

const tagInput = document.getElementById('inp-tags');
if (tagInput) {
    const addTag = () => {
        const val = tagInput.value.trim().replace(/,/g, '');
        if (val && !currentTags.includes(val)) {
            currentTags.push(val);
            renderTags();
            tagInput.value = '';
            window.saveDraft();
        }
    };

    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag();
        }
    });

    tagInput.addEventListener('blur', addTag);
}

function renderTags() {
    const container = document.getElementById('tag-container');
    container.querySelectorAll('.tag-chip').forEach(chip => chip.remove());
    currentTags.forEach(tag => {
        const chip = document.createElement('div'); chip.className = 'tag-chip';
        chip.innerHTML = `${tag} <span onclick="removeTag('${tag}')">×</span>`;
        container.insertBefore(chip, tagInput);
    });
}

function removeTag(tag) { currentTags = currentTags.filter(t => t !== tag); renderTags(); window.saveDraft(); }

window.addResourceField = function() {
    const list = document.getElementById('resource-list');
    const div = document.createElement('div'); div.className = 'resource-row';
    div.innerHTML = `<span style="color:var(--text-muted); font-size:1.1rem; display:flex; align-items:center;"><span class="iconify" data-icon="lucide:link"></span></span><input type="url" placeholder="https://..." class="res-link" style="margin-bottom:0; flex-grow:1;"><button type="button" class="btn-remove" onclick="this.parentElement.remove(); window.saveDraft();" style="width:32px; height:32px; min-width:32px; display:flex; align-items:center; justify-content:center;">×</button>`;
    list.appendChild(div);
    window.saveDraft();
};

window.toggleTheme = function() {
    const body = document.body; const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', next); localStorage.setItem('theme', next);
    if (document.querySelector('.view.active').id === 'view-dashboard') renderDashboard();
};

const addForm = document.getElementById('add-form');
if (addForm) {
    // Auto-save on input
    addForm.addEventListener('input', () => window.saveDraft());

    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save'); btn.innerText = 'Wait...'; btn.disabled = true;
        const select = document.getElementById('inp-category'); const input = document.getElementById('inp-new-category');
        let finalCategory = input.classList.contains('hidden') ? select.value : input.value.trim();
        const resLinks = Array.from(document.querySelectorAll('.res-link')).map(i => i.value).filter(v => v);
        const payload = { title: document.getElementById('inp-title').value, category_name: finalCategory, date: document.getElementById('inp-date').value, notes: document.getElementById('inp-notes').value, tags: currentTags, difficulty: document.getElementById('inp-difficulty').value, resources: resLinks, needs_revision: document.getElementById('inp-revision').checked };
        const entryId = document.getElementById('inp-id').value;
        try {
            const res = await fetch(`${API_URL}/entries${entryId ? '/' + entryId : ''}`, {
                method: entryId ? 'PUT' : 'POST', headers: getHeaders(), body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Save failed");
            
            if(!entryId) window.clearDraft(); // Clear draft on successful new entry save
            
            showToast("Saved! ✓"); await fetchEntries(true); await fetchStats(); await fetchCategories();
            
            // Only reset if it was a new entry, otherwise stay or go back? 
            // Standard behavior: go back or view entry.
            if (entryId) viewEntry(Number(entryId)); else { resetAddForm(); setTimeout(() => goBack(), 500); }
            
            document.getElementById('btn-save').disabled = false;
        } catch (err) { showToast("❌ Error saving"); btn.disabled = false; }
    });
}

window.editEntry = function(event, id) {
    if(event) event.stopPropagation();
    const entry = entries.find(e => e.id === id); if (!entry) return;
    router('add');
    document.getElementById('view-add-title').innerText = 'Edit Learning'; document.getElementById('btn-save').innerText = 'Update Entry';
    document.getElementById('inp-id').value = entry.id; document.getElementById('inp-title').value = entry.title;
    document.getElementById('inp-date').value = entry.date; document.getElementById('inp-notes').value = entry.notes;
    document.getElementById('inp-difficulty').value = entry.difficulty;
    document.getElementById('diff-label').innerText = ['Beginner','Easy','Medium','Hard','Expert'][entry.difficulty-1];
    document.getElementById('inp-revision').checked = entry.revision;
    document.getElementById('inp-category').value = entry.category;
    currentTags = entry.tags || []; renderTags();
    const resList = document.getElementById('resource-list'); resList.innerHTML = '';
    (entry.resources || []).forEach(url => {
        const div = document.createElement('div'); div.className = 'resource-row';
        div.innerHTML = `<span style="color:var(--text-muted); font-size:1.1rem;">🔗</span><input type="url" value="${url}" class="res-link" style="margin-bottom:0; flex-grow:1;"><button type="button" class="btn-remove" onclick="this.parentElement.remove()" style="width:32px; height:32px; min-width:32px;">×</button>`;
        resList.appendChild(div);
    });
};

window.deleteCurrentEntry = function() { if(confirm('Delete?')) deleteEntryAPI(currentViewId); };
window.deleteEntry = function(event, id) { event.stopPropagation(); if(confirm('Delete?')) deleteEntryAPI(id); };
async function deleteEntryAPI(id) {
    try {
        const res = await fetch(`${API_URL}/entries/${id}`, { method: 'DELETE', headers: getHeaders() });
        if (!res.ok) throw new Error("Delete failed");
        showToast('Deleted.'); await fetchEntries(true); await fetchStats(); router('library');
    } catch (err) { showToast("❌ Error"); }
}

window.loadProfileIntoForm = function() { document.getElementById('prof-name').value = profile.name; document.getElementById('prof-bio').value = profile.bio; };
window.saveProfile = async function() {
    const name = document.getElementById('prof-name').value.trim();
    const bio = document.getElementById('prof-bio').value.trim();
    
    if (!name) return showToast("❌ Name cannot be empty");

    const btn = document.querySelector('#view-settings .btn-pri');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = 'Updating...';

    try { 
        const res = await fetch(`${API_URL}/profile`, { 
            method: 'PUT', 
            headers: getHeaders(), 
            body: JSON.stringify({ name, bio }) 
        }); 
        
        if (!res.ok) throw new Error("Update failed");
        
        profile.name = name;
        profile.bio = bio;
        updateSidebar(); 
        showToast('Profile updated! ✨'); 
    } catch (err) { 
        showToast('❌ Failed to update profile'); 
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
};

window.exportData = async function() {
    const btn = document.querySelector('button[onclick="exportData()"]');
    const originalText = btn ? btn.innerText : '⬇️ Export';
    
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Preparing...';
    }

    try {
        showToast("📦 Preparing your second brain backup...");
        const res = await fetch(`${API_URL}/export`, { headers: getHeaders() });
        if (!res.ok) throw new Error("Server failed to generate export");
        
        const fullData = await res.json();
        
        // Use Blob for better reliability with larger data sets
        const blob = new Blob([JSON.stringify(fullData, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        
        const dl = document.createElement('a');
        dl.style.display = 'none';
        dl.href = url;
        dl.download = `brainstack_backup_${getTodayString()}.json`;
        
        document.body.appendChild(dl);
        dl.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(dl);
        
        showToast("✅ Backup downloaded successfully!");
    } catch (err) {
        console.error("Export Error:", err);
        showToast(`❌ Backup failed: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
};

window.importData = function(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const imported = Array.isArray(data) ? data : [data];
            showLoading();
            for (const entry of imported) {
                if (!entry) continue;
                const payload = { 
                    title: entry.title || 'Untitled', 
                    category_name: entry.category || 'General', 
                    date: entry.date || getTodayString(), 
                    notes: entry.notes || '', 
                    difficulty: entry.difficulty || 1, 
                    needs_revision: entry.revision || false, 
                    resources: entry.resources || [], 
                    tags: entry.tags || [] 
                };
                const res = await fetch(`${API_URL}/entries`, { 
                    method: 'POST', 
                    headers: getHeaders(), 
                    body: JSON.stringify(payload) 
                });
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.error || `Server error ${res.status}`);
                }
            }
            showToast(`✅ Import complete! Imported ${imported.length} entries.`); 
            await Promise.all([fetchEntries(true), fetchStats(), fetchCategories()]);
        } catch (err) { 
            console.error("Import Error:", err);
            showToast(`❌ Import failed: ${err.message}`); 
        } finally { 
            hideLoading(); 
            input.value = ''; 
        }
    };
    reader.readAsText(file);
};

window.nukeData = async function() {
    if(!confirm('⚠️ Are you sure you want to PERMANENTLY delete all your entries and categories? This cannot be undone.')) return;
    if(!confirm('Final warning: This will wipe your entire second brain. Continue?')) return;
    
    showLoading();
    try { 
        const res = await fetch(`${API_URL}/danger/clear-all`, { method: 'DELETE', headers: getHeaders() }); 
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error ${res.status}`);
        }
        
        showToast("🧹 Data cleared successfully.");
        // Reset local state without logging out
        entries = [];
        stats = { total: 0, revision: 0, streak: 0, categories: [], activity: [], heatmap: [] };
        categories = [];
        
        // Refresh UI and go to dashboard
        await Promise.all([fetchEntries(true), fetchStats(), fetchCategories()]);
        router('dashboard');
    } catch (err) { 
        hideLoading();
        console.error("Nuke Error:", err);
        showToast(`❌ Error: ${err.message}`); 
    }
};

function updateSidebar() {
    const nameEl = document.getElementById('side-name');
    const bioEl = document.getElementById('side-status');
    const avatarEl = document.getElementById('side-avatar');
    
    if (nameEl) nameEl.innerText = profile.name || 'User';
    if (bioEl) bioEl.innerText = profile.bio || 'Learner';
    
    if (avatarEl) {
        const parts = (profile.name || 'U').split(' ').filter(p => p.length > 0);
        let initials = '';
        if (parts.length > 1) {
            initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        } else if (parts.length === 1) {
            initials = parts[0].substring(0, 2).toUpperCase();
        } else {
            initials = '??';
        }
        avatarEl.innerText = initials;
    }
}

// ========================================== 
// 5. AUTO-SAVE DRAFTS
// ========================================== 
window.saveDraft = function() {
    // Don't save draft if we are editing an existing entry
    if (document.getElementById('inp-id').value) return;

    const draft = {
        title: document.getElementById('inp-title').value,
        category: document.getElementById('inp-category').value,
        newCategory: document.getElementById('inp-new-category').value,
        date: document.getElementById('inp-date').value,
        notes: document.getElementById('inp-notes').value,
        difficulty: document.getElementById('inp-difficulty').value,
        revision: document.getElementById('inp-revision').checked,
        tags: currentTags,
        resources: Array.from(document.querySelectorAll('.res-link')).map(i => i.value).filter(v => v)
    };
    localStorage.setItem('brainstack_draft', JSON.stringify(draft));
    
    const status = document.getElementById('draft-status');
    if(status) { status.style.opacity = '1'; setTimeout(() => status.style.opacity = '0', 2000); }
};

window.clearDraft = function() { localStorage.removeItem('brainstack_draft'); };

window.restoreDraft = function() {
    const saved = localStorage.getItem('brainstack_draft');
    if (!saved) return;
    try {
        const draft = JSON.parse(saved);
        
        // Safety: Don't overwrite if the user has already typed something
        const currentTitle = document.getElementById('inp-title').value;
        const currentNotes = document.getElementById('inp-notes').value;
        if (currentTitle || currentNotes) return;

        if (!draft.title && !draft.notes && (!draft.tags || draft.tags.length === 0)) return;

        document.getElementById('inp-title').value = draft.title || '';
        document.getElementById('inp-notes').value = draft.notes || '';
        document.getElementById('inp-difficulty').value = draft.difficulty || 1;
        document.getElementById('diff-label').innerText = ['Beginner','Easy','Medium','Hard','Expert'][(draft.difficulty||1)-1];
        document.getElementById('inp-revision').checked = draft.revision || false;
        
        if (draft.newCategory) {
             document.getElementById('inp-category').classList.add('hidden');
             document.getElementById('inp-new-category').classList.remove('hidden');
             document.getElementById('inp-new-category').value = draft.newCategory;
        } else if (draft.category) {
             document.getElementById('inp-category').value = draft.category;
        }
        
        if (draft.date) document.getElementById('inp-date').value = draft.date;

        currentTags = draft.tags || [];
        renderTags();

        const resList = document.getElementById('resource-list');
        resList.innerHTML = '';
        (draft.resources || []).forEach(url => {
            const div = document.createElement('div'); div.className = 'resource-row';
            div.innerHTML = `<span style="color:var(--text-muted); font-size:1.1rem; display:flex; align-items:center;"><span class="iconify" data-icon="lucide:link"></span></span><input type="url" value="${url}" class="res-link" style="margin-bottom:0; flex-grow:1;"><button type="button" class="btn-remove" onclick="this.parentElement.remove(); saveDraft();" style="width:32px; height:32px; min-width:32px; display:flex; align-items:center; justify-content:center;">×</button>`;
            resList.appendChild(div);
        });

        showToast("Draft restored from local storage");
    } catch (e) { console.error("Draft restore error", e); }
};

window.discardForm = function() {
    if (confirm("Clear this form and discard draft?")) {
        window.clearDraft();
        resetAddForm();
        showToast("Draft discarded");
    }
};

window.resetAddForm = function() {
    document.getElementById('add-form').reset(); document.getElementById('inp-date').value = getTodayString();
    document.getElementById('inp-id').value = ''; document.getElementById('btn-save').innerText = 'Save Entry';
    document.getElementById('view-add-title').innerText = 'Add New Learning'; currentTags = [];
    document.getElementById('resource-list').innerHTML = ''; renderTags();
    document.getElementById('inp-category').classList.remove('hidden'); document.getElementById('inp-new-category').classList.add('hidden');
    
    restoreDraft(); // Attempt to restore draft
    
    router('add');
};

function showToast(msg) {
    const container = document.getElementById('toast-container'); const t = document.createElement('div');
    t.className = 'toast'; t.innerText = msg; container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function formatLocalTime(timestamp) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function updateDashboardGreeting() {
    const hour = new Date().getHours();
    const greetingEl = document.getElementById('dash-greeting');
    const name = profile.name.split(' ')[0] || 'Learner';
    
    let timeGreeting = 'Hello';
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 18) timeGreeting = 'Good afternoon';
    else timeGreeting = 'Good evening';
    
    if(greetingEl) greetingEl.innerText = `${timeGreeting}, ${name}! 👋`;

    const quotes = [
        "The expert in anything was once a beginner.",
        "Learning never exhausts the mind.",
        "Change is the end result of all true learning.",
        "Study hard what interests you the most in the most undisciplined, irreverent and original manner possible.",
        "Live as if you were to die tomorrow. Learn as if you were to live forever.",
        "Knowledge has a beginning but no end.",
        "One hour per day of study will put you at the top of your field within three years."
    ];
    const quoteEl = document.getElementById('dash-quote');
    if(quoteEl) quoteEl.innerText = `"${quotes[Math.floor(Math.random() * quotes.length)]}"`;
}

function renderDashboard() {
    updateDashboardGreeting();
    document.getElementById('stat-total').innerText = stats.total;
    document.getElementById('stat-revision').innerText = stats.revision;
    document.getElementById('stat-streak').innerText = `${stats.streak} Days`;
    
    try { renderHeatmap(); } catch (e) { console.error(e); }

    try {
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-main') || '#1f2937';
        
        const ctxCat = document.getElementById('chart-category');
        if (ctxCat) {
            if (categoryChart) categoryChart.destroy();
            if (stats.categories.length === 0) {
                ctxCat.style.display = 'none';
                if (!document.getElementById('cat-empty-msg')) {
                    const msg = document.createElement('div');
                    msg.id = 'cat-empty-msg';
                    msg.style.cssText = 'height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-style:italic;';
                    msg.innerText = 'No data yet';
                    ctxCat.parentElement.appendChild(msg);
                }
            } else {
                ctxCat.style.display = 'block';
                const existingMsg = document.getElementById('cat-empty-msg');
                if (existingMsg) existingMsg.remove();
                categoryChart = new Chart(ctxCat, {
                    type: 'doughnut', 
                    data: { 
                        labels: stats.categories.map(c => c.name), 
                        datasets: [{ 
                            data: stats.categories.map(c => c.count), 
                            backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f43f5e'], 
                            borderWidth: 0 
                        }] 
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, color: textColor } } } }
                });
            }
        }

        const last7Days = []; 
        const activityMap = {}; 
        stats.activity.forEach(a => { activityMap[a.learning_date] = parseInt(a.count); });
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i); 
            const ds = d.toLocaleDateString('en-CA');
            last7Days.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), count: activityMap[ds] || 0 });
        }

        const ctxAct = document.getElementById('chart-activity');
        if (ctxAct) {
            if (activityChart) activityChart.destroy();
            if (stats.activity.length === 0) {
                ctxAct.style.display = 'none';
                if (!document.getElementById('act-empty-msg')) {
                    const msg = document.createElement('div');
                    msg.id = 'act-empty-msg';
                    msg.style.cssText = 'height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-style:italic;';
                    msg.innerText = 'Keep learning to see activity';
                    ctxAct.parentElement.appendChild(msg);
                }
            } else {
                ctxAct.style.display = 'block';
                const existingMsg = document.getElementById('act-empty-msg');
                if (existingMsg) existingMsg.remove();
                
                activityChart = new Chart(ctxAct, {
                    type: 'bar', 
                    data: { 
                        labels: last7Days.map(d => d.label), 
                        datasets: [{ label: 'Entries', data: last7Days.map(d => d.count), backgroundColor: 'rgba(99, 102, 241, 0.8)', borderRadius: 6 }] 
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        scales: { 
                            y: { beginAtZero: true, ticks: { stepSize: 1, color: textColor }, grid: { display: false } }, 
                            x: { ticks: { color: textColor }, grid: { display: false } } 
                        }, 
                        plugins: { legend: { display: false } } 
                    }
                });
            }
        }
    } catch (e) { console.error("Chart error:", e); }

    const list = document.getElementById('recent-list'); 
    if (list) {
        list.innerHTML = entries.length ? '' : '<p style="color:var(--text-muted)">No entries yet.</p>';
        entries.slice(0, 5).forEach(entry => {
            const item = document.createElement('div'); 
            item.className = 'card'; 
            item.style.cssText = 'padding:15px 20px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; border-left:4px solid var(--primary);';
            item.onclick = () => viewEntry(entry.id);
            const timeAgo = formatRelativeTime(entry.date);
            item.innerHTML = `<div><div style="font-weight:600;">${entry.title}</div><div style="display:flex;gap:8px;align-items:center;"><span class="badge" style="font-size:0.7rem;">${entry.category}</span><span style="font-size:0.8rem;color:var(--text-muted);">${timeAgo}</span></div></div><div style="color:var(--text-muted);"><span class="iconify" data-icon="lucide:chevron-right"></span></div>`;
            list.appendChild(item);
        });
    }
}

function formatRelativeTime(dateString) {
    const d1 = new Date(dateString);
    const d2 = new Date();
    // Reset time to ensure we compare days only
    d1.setHours(0,0,0,0);
    d2.setHours(0,0,0,0);
    const diff = Math.round((d2 - d1) / 86400000);
    const absDiff = Math.abs(diff);
    
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${absDiff} days ago`;
}

function renderLibrary() {
    const list = document.getElementById('library-list'); if (!list) return;
    list.innerHTML = '';
    if (entries.length === 0) { list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted)">No matches found.</div>'; return; }
    entries.forEach(entry => {
        const card = document.createElement('div'); card.className = `entry-card ${entry.revision ? 'needs-revision' : ''}`;
        const stars = '●'.repeat(entry.difficulty) + '○'.repeat(5 - entry.difficulty);
        const tags = (entry.tags || []).slice(0, 3).map(t => `<span class="badge" style="background:var(--primary-light); color:var(--primary); border-color: transparent;">#${t}</span>`).join('');
        card.innerHTML = `<div onclick="viewEntry(${entry.id})">
            <div style="display:flex; justify-content:space-between; align-items:start">
                <h3>${entry.title}</h3>
                <div style="display:flex; gap:5px">
                    <button class="btn-xs" onclick="editEntry(event, ${entry.id})" style="color:var(--primary); background:none; border:none; font-size:1.2rem; display:flex; align-items:center;">
                        <span class="iconify" data-icon="lucide:pencil"></span>
                    </button>
                    <button class="btn-xs" onclick="deleteEntry(event, ${entry.id})" style="color:red; background:none; border:none; font-size:1.2rem; display:flex; align-items:center;">
                        <span class="iconify" data-icon="lucide:trash-2"></span>
                    </button>
                </div>
            </div>
            <div class="card-meta">
                <span class="badge" style="font-weight: 700; color: var(--text-main);"><span class="iconify" data-icon="lucide:folder" style="margin-right: 4px;"></span>${entry.category}</span>
                ${tags}
            </div>
            <p style="margin:10px 0; font-size:0.9rem; color:var(--text-muted); line-height: 1.5;">${entry.notes.substring(0, 80)}...</p>
            <div class="card-footer">
                <span style="color:var(--primary)">${stars}</span>
                <span style="font-size: 0.8rem; font-weight: 500;">${formatRelativeTime(entry.date)}</span>
            </div>
        </div>`;
        list.appendChild(card);
    });
}

function parseMarkdown(text) {
    if (!text) return '';
    
    // 1. Code Blocks with basic syntax highlighting
    let html = text.replace(/```(\w*)([\s\S]*?)```/g, (match, lang, code) => {
        // Escape HTML tags in code to prevent rendering
        let escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Basic Syntax Highlighting (Keywords, Numbers, Comments)
        // Comments (# ...)
        escapedCode = escapedCode.replace(/(#.*$)/gm, '<span class="code-comment">$1</span>');
        // Keywords (Python/JS mix)
        escapedCode = escapedCode.replace(/\b(def|return|import|from|if|else|elif|for|while|const|let|var|function|async|await|class)\b/g, '<span class="code-keyword">$1</span>');
        // Numbers
        escapedCode = escapedCode.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="code-number">$1</span>');
        
        return `<pre><div class="code-header"><span>${lang || 'Code'}</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><code>${escapedCode}</code></pre>`;
    });

    // 2. Inline Code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 3. Headers
    html = html.replace(/^#+\s*(.*$)/gim, (match, p1) => {
        const level = match.trim().split(' ')[0].split('#').length - 1 || 1;
        const tag = level <= 3 ? `h${level}` : 'h3';
        return `<${tag}>${p1}</${tag}>`;
    });

    // 4. Blockquotes
    html = html.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

    // 5. Bold & Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    html = html.replace(/\*(.*?)\*/g, '<i>$1</i>');

    // 6. Lists
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>').replace(/<\/ul>\s*<ul>/gim, '');

    // 7. Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    // 8. Line Breaks (only if not inside pre)
    // We split by pre tags to avoid adding <br> inside code blocks
    const parts = html.split(/(<pre>[\s\S]*?<\/pre>)/g);
    html = parts.map(part => part.startsWith('<pre>') ? part : part.replace(/\n/g, '<br>')).join('');

    return html;
}

window.viewEntry = function(id) {
    const entry = entries.find(e => e.id === id); if (!entry) return;
    currentViewId = id; 
    
    // Reset AI Summary
    document.getElementById('ai-summary-box').classList.add('hidden');
    document.getElementById('ai-summary-content').innerHTML = '';
    const sumBtn = document.getElementById('btn-summarize');
    sumBtn.classList.remove('hidden');
    sumBtn.disabled = false;
    sumBtn.innerHTML = '<span class="iconify" data-icon="lucide:sparkles" style="margin-right: 6px;"></span> AI Summarize';

    document.getElementById('detail-title').innerText = entry.title;
    document.getElementById('detail-category').innerText = entry.category; 
    document.getElementById('detail-date').innerText = entry.date;
    document.getElementById('detail-diff').innerText = '●'.repeat(entry.difficulty) + '○'.repeat(5 - entry.difficulty);
    document.getElementById('detail-content').innerHTML = parseMarkdown(entry.notes);
    const res = document.getElementById('detail-resources'); res.innerHTML = entry.resources.length ? '<strong><span class="iconify" data-icon="lucide:link" style="margin-right:4px; vertical-align:middle;"></span> Resources:</strong>' : '';
    entry.resources.forEach(url => { const d = document.createElement('div'); d.innerHTML = `<a href="${url}" target="_blank" class="res-link-item">${url}</a>`; res.appendChild(d); });
    const tags = document.getElementById('detail-tags'); tags.innerHTML = '';
    entry.tags.forEach(t => { const s = document.createElement('span'); s.className = 'tag-chip'; s.innerHTML = `<span>${t}</span>`; tags.appendChild(s); });
    router('details');
};

window.summarizeEntry = async function() {
    const entry = entries.find(e => e.id === currentViewId);
    if (!entry || !entry.notes) return showToast("Nothing to summarize!");
    
    const btn = document.getElementById('btn-summarize');
    btn.disabled = true;
    btn.innerHTML = '<span class="iconify" data-icon="lucide:loader-2" class="spin"></span> Summarizing...';
    
    try {
        const res = await fetch(`${API_URL}/ai/summarize`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ content: entry.notes })
        });
        const data = await res.json();
        
        if (data.summary) {
            document.getElementById('ai-summary-content').innerHTML = parseMarkdown(data.summary);
            document.getElementById('ai-summary-box').classList.remove('hidden');
            btn.classList.add('hidden'); // Hide button after success
        } else {
            throw new Error(data.error || "No summary returned");
        }
    } catch (err) {
        console.error(err);
        showToast(`❌ AI Failed: ${err.message}`);
        btn.disabled = false;
        btn.innerHTML = '<span class="iconify" data-icon="lucide:sparkles"></span> Retry AI Summarize';
    }
};

window.formatDoc = function(cmd) {
    const ta = document.getElementById('inp-notes');
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selectedText = text.substring(start, end);
    
    let before = '', after = '';

    switch(cmd) {
        case 'bold': before = '**'; after = '**'; break;
        case 'italic': before = '*'; after = '*'; break;
        case 'code': before = '`'; after = '`'; break;
        case 'list': before = '\n- '; after = ''; break;
        case 'h2': before = '\n## '; after = ''; break;
    }

    ta.value = text.substring(0, start) + before + selectedText + after + text.substring(end);
    ta.focus();
    
    const newPos = selectedText.length > 0 ? end + before.length + after.length : start + before.length;
    ta.setSelectionRange(newPos, newPos);
    window.saveDraft();
};

window.togglePreview = function() {
    const ta = document.getElementById('inp-notes'); const p = document.getElementById('preview-panel');
    if (ta.classList.contains('hidden')) { ta.classList.remove('hidden'); p.classList.add('hidden'); }
    else { ta.classList.add('hidden'); p.classList.remove('hidden'); p.innerHTML = parseMarkdown(ta.value) || 'Preview...'; }
};

let revisionQueue = []; let currentRevIndex = 0;
window.startRevision = async function() {
    showLoading();
    try {
        const res = await fetch(`${API_URL}/entries?limit=100&revision=true`, { headers: getHeaders() });
        const data = await res.json();
        revisionQueue = data.data.map(e => ({
            ...e, id: e.entry_id, category: e.category_name || 'General', date: e.learning_date, notes: e.notes_markdown, difficulty: e.difficulty_level, revision: e.needs_revision, tags: e.tags || [], resources: e.resources || []
        }));
        
        router('revision');
        const listC = document.getElementById('revision-list-container'); 
        const sessC = document.getElementById('revision-session-container'); 
        const empty = document.getElementById('revision-empty');
        
        if (revisionQueue.length === 0) { 
            listC.classList.add('hidden'); sessC.classList.add('hidden'); empty.classList.remove('hidden'); 
        } else { 
            empty.classList.add('hidden'); sessC.classList.add('hidden'); listC.classList.remove('hidden'); 
            renderRevisionList(); 
        }
    } catch (e) {
        showToast("❌ Could not load revision items");
    } finally {
        hideLoading();
    }
};

function renderRevisionList() {
    const list = document.getElementById('rev-list-items'); list.innerHTML = '';
    revisionQueue.forEach(entry => {
        const item = document.createElement('div'); item.className = 'card'; item.style.cssText = 'padding:15px 20px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;';
        item.onclick = () => viewEntry(entry.id); item.innerHTML = `<div><strong>${entry.title}</strong><span class="badge" style="margin-left:10px">${entry.category}</span></div><div>${entry.date}</div>`;
        list.appendChild(item);
    });
}

window.startFlashcardSession = function() { currentRevIndex = 0; document.getElementById('revision-list-container').classList.add('hidden'); document.getElementById('revision-session-container').classList.remove('hidden'); loadFlashcard(); };
window.exitSession = function() { document.getElementById('revision-session-container').classList.add('hidden'); document.getElementById('revision-list-container').classList.remove('hidden'); };

function loadFlashcard() {
    if (currentRevIndex >= revisionQueue.length) { showToast("Done!"); startRevision(); return; }
    const entry = revisionQueue[currentRevIndex]; document.getElementById('rev-progress').innerText = `CARD ${currentRevIndex + 1} OF ${revisionQueue.length}`;
    document.getElementById('flashcard-container').onclick = toggleFlashcard;
    document.querySelector('.fc-front').classList.remove('hidden'); document.querySelector('.fc-back').classList.add('hidden'); document.getElementById('fc-controls').classList.add('hidden');
    document.getElementById('fc-category').innerText = entry.category; document.getElementById('fc-title').innerText = entry.title;
    const tags = document.getElementById('fc-tags'); tags.innerHTML = ''; (entry.tags || []).forEach(t => { const s = document.createElement('span'); s.className = 'badge'; s.innerText = `#${t}`; tags.appendChild(s); });
    document.getElementById('fc-content').innerHTML = parseMarkdown(entry.notes);
}

function toggleFlashcard() { document.querySelector('.fc-front').classList.add('hidden'); document.querySelector('.fc-back').classList.remove('hidden'); document.getElementById('fc-controls').classList.remove('hidden'); document.getElementById('flashcard-container').onclick = null; }

window.processRevision = async function(keep) {
    const entry = revisionQueue[currentRevIndex];
    if (!keep) {
        try {
            await fetch(`${API_URL}/entries/${entry.id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ ...entry, needs_revision: false }) });
            const real = entries.find(e => e.id === entry.id); if(real) real.revision = false; fetchStats();
        } catch (e) { console.error(e); }
    }
    currentRevIndex++; loadFlashcard();
};

function renderHeatmap() {
    const grid = document.getElementById('heatmap-grid'); 
    
    if (!grid || !stats.heatmap) return;
    grid.innerHTML = ''; 
    const today = new Date(); today.setHours(0,0,0,0); 
    const start = new Date(today); start.setDate(today.getDate() - 364); 
    while(start.getDay() !== 0) start.setDate(start.getDate() - 1);
    
    const activityMap = {}; 
    stats.heatmap.forEach(h => { activityMap[h.learning_date] = parseInt(h.count); });
    
    for (let i = 0; i < 371; i++) {
        const curr = new Date(start); curr.setDate(start.getDate() + i); 
        const ds = curr.toISOString().split('T')[0]; 
        const count = activityMap[ds] || 0;
        const cell = document.createElement('div'); 
        cell.className = `h-cell level-${count > 6 ? 4 : count > 4 ? 3 : count > 2 ? 2 : count > 0 ? 1 : 0}`; 
        
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        const friendlyDate = curr.toLocaleDateString(undefined, options);
        cell.title = `${friendlyDate}: ${count} entries`; 
        grid.appendChild(cell);
    }
}

window.copyCode = function(btn) {
    const pre = btn.parentElement; const code = pre.querySelector('code'); const text = code.innerText;
    navigator.clipboard.writeText(text).then(() => { const originalText = btn.innerText; btn.innerText = 'Copied!'; btn.classList.add('copied'); setTimeout(() => { btn.innerText = originalText; btn.classList.remove('copied'); }, 2000); });
};

window.toggleAIChat = function() { const p = document.getElementById('ai-panel'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) { document.getElementById('ai-input').focus(); initAIResize(); } };
window.clearChat = function() {
    chatHistory = [];
    document.getElementById('ai-messages').innerHTML = '<div class="ai-bubble bot">History cleared. How can I help you now?</div>';
};

window.sendAIMessage = async function() {
    const input = document.getElementById('ai-input'); 
    const msg = input.value.trim(); 
    if (!msg) return;

    addAIBubble(msg, 'user'); 
    chatHistory.push({ role: "user", content: msg }); 
    input.value = ''; 
    
    const typingId = 'ai-t-' + Date.now(); 
    addAIBubble('<div class="typing-dots"><span></span><span></span><span></span></div>', 'bot', typingId);
    
    try {
        const res = await fetch(`${API_URL}/ai/global-chat`, { 
            method: 'POST', 
            headers: getHeaders(), 
            body: JSON.stringify({ message: msg, history: chatHistory }) 
        });
        
        const data = await res.json();
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        
        if (!res.ok) throw new Error(data.error || "Connection lost");

        const botResponse = data.text || 'I am sorry, I could not generate a response.'; 
        addAIBubble(botResponse, 'bot'); 
        chatHistory.push({ role: "assistant", content: botResponse });
    } catch (e) { 
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        addAIBubble(`❌ **Error:** ${e.message}. Please try again.`, 'bot'); 
    }
};

function addAIBubble(text, type, id = null) {
    const container = document.getElementById('ai-messages'); const div = document.createElement('div');
    div.className = `ai-bubble ${type} ${type === 'bot' ? 'markdown-body' : ''}`; if (id) div.id = id;
    if (type === 'bot') div.innerHTML = parseMarkdown(text); else div.innerText = text;
    container.appendChild(div); container.scrollTop = container.scrollHeight;
}

function initAIResize() {
    const panel = document.getElementById('ai-panel'); const handle = document.getElementById('ai-resize-handle'); let isResizing = false;
    handle.addEventListener('mousedown', (e) => { isResizing = true; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; });
    document.addEventListener('mousemove', (e) => { if (!isResizing) return; const newWidth = window.innerWidth - e.clientX - 30; if (newWidth > 300 && newWidth < window.innerWidth * 0.8) panel.style.width = `${newWidth}px`; });
    document.addEventListener('mouseup', () => { isResizing = false; document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto'; });
}

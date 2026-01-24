// ========================================== 
// 1. STATE & API CONFIG
// ========================================== 
const API_URL = '/api';
let entries = [];
let categories = []; // Start empty, fetch from DB
let profile = { name: 'User', bio: 'Learner' }; // Default profile
let currentTags = [];
let lastView = 'dashboard';
let currentViewId = null;

// Pagination State
let currentPage = 1;
let totalPages = 1;
let isLoading = false;

// ========================================== 
// 2. DATA OPERATIONS (ASYNC)
// ========================================== 

// Fetch entries (Paginated)
async function fetchEntries(reset = false) {
    if (isLoading) return;
    
    if (reset) {
        currentPage = 1;
        entries = [];
        document.getElementById('library-list').innerHTML = ''; // Clear UI immediately
    }

    showLoading();
    isLoading = true;

    try {
        const searchInput = document.getElementById('globalSearch');
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        const res = await fetch(`${API_URL}/entries?page=${currentPage}&limit=20&search=${encodeURIComponent(searchTerm)}`);
        
        if (!res.ok) throw new Error('Failed to fetch');
        
        const responseData = await res.json();
        const newEntries = responseData.data;
        totalPages = responseData.pagination.totalPages;

        const processedEntries = newEntries.map(e => {
            // Robust date parsing
            let dateStr = e.learning_date;
            if (dateStr) {
                const d = new Date(dateStr);
                dateStr = d.toLocaleDateString('en-CA');
            }

            return {
                ...e,
                id: e.entry_id, 
                category: e.category_name || 'General',
                date: dateStr, 
                notes: e.notes_markdown,
                difficulty: e.difficulty_level,
                revision: e.needs_revision,
                tags: e.tags || [], 
                resources: e.resources || []
            };
        });

        // Append new entries
        entries = [...entries, ...processedEntries];
        
        renderDashboard(); 
        
        // If we are in library view, we should re-render or append
        // For simplicity, we re-render the whole list for now, 
        // but a true infinite scroll would just append DOM elements.
        renderLibrary();

        updateLoadMoreButton();

    } catch (err) {
        console.error("Error loading entries:", err);
        showToast("❌ Server Error: Could not load data");
    } finally {
        hideLoading();
        isLoading = false;
    }
}

function loadMoreEntries() {
    if (currentPage < totalPages) {
        currentPage++;
        fetchEntries(false);
    }
}

function updateLoadMoreButton() {
    const btn = document.getElementById('btn-load-more');
    if (!btn) return;
    
    if (currentPage >= totalPages) {
        btn.classList.add('hidden');
    } else {
        btn.classList.remove('hidden');
        btn.innerText = `Load More (${currentPage}/${totalPages})`;
    }
}

function showLoading() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

async function fetchProfile() {
    try {
        const res = await fetch(`${API_URL}/profile`);
        if (res.ok) {
            profile = await res.json();
            updateSidebar();
        }
    } catch (err) { console.error(err); }
}

async function fetchCategories() {
    try {
        const res = await fetch(`${API_URL}/categories`);
        if (res.ok) {
            categories = await res.json();
            // If DB is empty, categories will be empty. 
            // We let the user create one via the UI instead of forcing defaults.
            renderCategoryOptions();
        }
    } catch (err) { console.error(err); }
}

// ========================================== 
// 3. ROUTING SYSTEM
// ========================================== 
function router(viewName) {
    const activeView = document.querySelector('.view.active');
    if (activeView && activeView.id !== `view-${viewName}`) {
        lastView = activeView.id.replace('view-', '');
    }

    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active');
    }

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-target="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Hide Search Bar in certain views
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
        if (viewName === 'add' || viewName === 'details' || viewName === 'revision' || viewName === 'settings') {
            topBar.classList.add('hidden');
        } else {
            topBar.classList.remove('hidden');
        }
    }

    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'library') {
        renderLibrary();
    }
    if (viewName === 'settings') loadProfileIntoForm();
}

// Helper to get local date string YYYY-MM-DD
function getTodayString() {
    const today = new Date();
    return today.toLocaleDateString('en-CA');
}

window.goBack = function() {
    router(lastView || 'dashboard');
};

window.toggleSidebar = function() {
    document.querySelector('.sidebar').classList.toggle('open');
};

// ========================================== 
// 4. UI LOGIC & EVENTS
// ========================================== 
document.addEventListener('DOMContentLoaded', () => {
    updateSidebar();
    
    // Close sidebar when clicking links on mobile
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                document.querySelector('.sidebar').classList.remove('open');
            }
        });
    });

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', savedTheme);

    // Initial Data Load Check
    if (sessionStorage.getItem('isAuth') === 'true') {
        initApp();
    } else {
        document.getElementById('pin-overlay').classList.remove('hidden');
        document.getElementById('pin-input').focus();
    }

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('globalSearch').focus();
        }
        if (e.key === 'Enter' && !document.getElementById('pin-overlay').classList.contains('hidden')) {
            verifyPin();
        }
    });

    renderCategoryOptions();

    const dateInput = document.getElementById('inp-date');
    if (dateInput) {
        dateInput.value = getTodayString();
    }

    // Connect Global Search (Server-Side)
    const globalSearch = document.getElementById('globalSearch');
    const clearBtn = document.getElementById('search-clear');
    let searchTimeout;
    
    if (globalSearch) {
        globalSearch.addEventListener('input', (e) => {
            const val = globalSearch.value.trim();
            
            // Show/Hide Clear Button
            if (val.length > 0) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }

            // Only jump to library if we are not already there
            const activeView = document.querySelector('.view.active');
            if (activeView && activeView.id !== 'view-library') {
                router('library'); 
            }

            // Debounce Search
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                fetchEntries(true); // Reset list and fetch with new search term
            }, 300);
        });
    }

    router('dashboard');
});

async function initApp() {
    document.getElementById('pin-overlay').classList.add('hidden');
    // Initial Data Load
    await Promise.all([
        fetchEntries(true),
        fetchProfile(),
        fetchCategories()
    ]);
}

window.verifyPin = async function() {
    const pin = document.getElementById('pin-input').value;
    const btn = document.querySelector('#pin-overlay .btn-pri');
    const err = document.getElementById('pin-error');
    
    btn.disabled = true;
    btn.innerText = 'Verifying...';
    err.classList.add('hidden');

    try {
        const res = await fetch(`${API_URL}/auth/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });

        if (res.ok) {
            sessionStorage.setItem('isAuth', 'true');
            initApp();
        } else {
            err.classList.remove('hidden');
            document.getElementById('pin-input').value = '';
            document.getElementById('pin-input').focus();
        }
    } catch (e) {
        showToast("❌ Connection error");
    } finally {
        btn.disabled = false;
        btn.innerText = 'Unlock';
    }
};

window.clearSearch = function() {
    const input = document.getElementById('globalSearch');
    input.value = '';
    document.getElementById('search-clear').classList.add('hidden');
    input.focus();
    fetchEntries(true); // Clear search results
};

function renderCategoryOptions() {
    const select = document.getElementById('inp-category');
    const filterSelect = document.getElementById('filter-category');
    if(!select) return;
    
    select.innerHTML = '';
    if(filterSelect) filterSelect.innerHTML = '<option value="">All Categories</option>';
    
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.innerText = cat;
        select.appendChild(option);
        
        if(filterSelect) {
            const fOption = document.createElement('option');
            fOption.value = cat;
            fOption.innerText = cat;
            filterSelect.appendChild(fOption);
        }
    });
}

window.resetFilters = function() {
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-difficulty').value = '';
    document.getElementById('globalSearch').value = '';
    renderLibrary();
};

window.toggleCategoryInput = function() {
    const select = document.getElementById('inp-category');
    const input = document.getElementById('inp-new-category');
    const btn = document.querySelector('.btn-icon');

    if (input.classList.contains('hidden')) {
        select.classList.add('hidden');
        input.classList.remove('hidden');
        input.focus();
        btn.innerText = '✕';
        btn.style.color = 'red';
    } else {
        select.classList.remove('hidden');
        input.classList.add('hidden');
        btn.innerText = '+';
        btn.style.color = 'var(--primary)';
    }
};

const diffInput = document.getElementById('inp-difficulty');
if (diffInput) {
    const diffLabels = { 1: 'Beginner', 2: 'Easy', 3: 'Medium', 4: 'Hard', 5: 'Expert' };
    diffInput.addEventListener('input', (e) => {
        document.getElementById('diff-label').innerText = diffLabels[e.target.value];
    });
}

const tagInput = document.getElementById('inp-tags');
if (tagInput) {
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = tagInput.value.trim();
            if (val && !currentTags.includes(val)) {
                currentTags.push(val);
                renderTags();
                tagInput.value = '';
            }
        }
    });
}

function renderTags() {
    const container = document.getElementById('tag-container');
    container.querySelectorAll('.tag-chip').forEach(chip => chip.remove());
    currentTags.forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.innerHTML = `${tag} <span onclick="removeTag('${tag}')">×</span>`;
        container.insertBefore(chip, tagInput);
    });
}

function removeTag(tag) {
    currentTags = currentTags.filter(t => t !== tag);
    renderTags();
}

window.addResourceField = function() {
    const list = document.getElementById('resource-list');
    const div = document.createElement('div');
    div.className = 'resource-row';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginBottom = '10px';
    div.style.alignItems = 'center';
    div.innerHTML = 
        `<span style="color:var(--text-muted); font-size:1.1rem;">🔗</span>
        <input type="url" placeholder="https://..." class="res-link" style="margin-bottom:0; flex-grow:1;">
        <button type="button" class="btn-remove" onclick="this.parentElement.remove()" style="width:32px; height:32px; min-width:32px;">×</button>`;
    list.appendChild(div);
};

window.toggleTheme = function() {
    const body = document.body;
    const current = body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
};

// ========================================== 
// 5. DATA SAVING & EDITING
// ========================================== 
const addForm = document.getElementById('add-form');
if (addForm) {
    addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const btn = document.getElementById('btn-save');
        const originalText = btn.innerText;
        btn.innerText = 'Wait...';
        btn.disabled = true;
        
        const select = document.getElementById('inp-category');
        const input = document.getElementById('inp-new-category');
        let finalCategory = select.value;

        if (!input.classList.contains('hidden') && input.value.trim() !== '') {
            finalCategory = input.value.trim();
        }

        const resLinks = Array.from(document.querySelectorAll('.res-link'))
            .map(i => i.value).filter(v => v);

        // Prepare Data for Server
        const payload = {
            title: document.getElementById('inp-title').value,
            category_name: finalCategory, // Server handles category logic
            date: document.getElementById('inp-date').value,
            notes: document.getElementById('inp-notes').value,
            tags: currentTags,
            difficulty: document.getElementById('inp-difficulty').value,
            resources: resLinks,
            needs_revision: document.getElementById('inp-revision').checked
        };

        const entryId = document.getElementById('inp-id').value;
        const isEdit = !!entryId;

        try {
            let res;
            if (isEdit) {
                // UPDATE (PUT)
                res = await fetch(`${API_URL}/entries/${entryId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                // CREATE (POST)
                res = await fetch(`${API_URL}/entries`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) throw new Error("Save failed");
            
            showToast(isEdit ? "Entry updated! ✓" : "Entry saved! ✓");
            
            // Reload Data from Server (Reset pagination)
            await fetchEntries(true);
            await fetchCategories(); // Sync categories
            
            resetAddForm();
            // Button is re-enabled by resetAddForm (which calls router -> which might not, but resetAddForm resets the form)
            // Actually resetAddForm resets text, but we should ensure disabled is false
            document.getElementById('btn-save').disabled = false;
            
            if (isEdit) {
                 const numericId = Number(entryId);
                 viewEntry(numericId || entryId); 
            } else {
                 setTimeout(() => goBack(), 500);
            }

        } catch (err) {
            console.error(err);
            showToast("❌ Error saving entry");
            // Restore button state on error
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
}

window.editEntry = function(event, id) {
    if(event) event.stopPropagation();
    
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    router('add');
    document.getElementById('view-add-title').innerText = 'Edit Learning';
    document.getElementById('btn-save').innerText = 'Update Entry';
    document.getElementById('inp-id').value = entry.id;

    document.getElementById('inp-title').value = entry.title;
    document.getElementById('inp-date').value = entry.date;
    document.getElementById('inp-notes').value = entry.notes;
    document.getElementById('inp-difficulty').value = entry.difficulty;
    document.getElementById('diff-label').innerText = ['Beginner','Easy','Medium','Hard','Expert'][entry.difficulty-1] || 'Beginner';
    document.getElementById('inp-revision').checked = entry.revision;

    const catSelect = document.getElementById('inp-category');
    // Simple check if category exists in dropdown, else show text input
    // (In robust app, we'd add it to dropdown dynamically)
    catSelect.value = entry.category;

    currentTags = entry.tags || [];
    renderTags();

    const resList = document.getElementById('resource-list');
    resList.innerHTML = '';
    (entry.resources || []).forEach(url => {
        const div = document.createElement('div');
        div.className = 'resource-row';
        div.style.display = 'flex';
        div.style.gap = '10px';
        div.style.marginBottom = '10px';
        div.style.alignItems = 'center';
        div.innerHTML = 
            `<span style="color:var(--text-muted); font-size:1.1rem;">🔗</span>
            <input type="url" value="${url}" class="res-link" style="margin-bottom:0; flex-grow:1;">
            <button type="button" class="btn-remove" onclick="this.parentElement.remove()" style="width:32px; height:32px; min-width:32px;">×</button>`;
        resList.appendChild(div);
    });
};

window.deleteCurrentEntry = function() {
    if(confirm('Delete this entry?')) {
        deleteEntryAPI(currentViewId);
    }
};

window.deleteEntry = function(event, id) {
    event.stopPropagation();
    if(confirm('Delete this entry?')) {
        deleteEntryAPI(id);
    }
};

async function deleteEntryAPI(id) {
    try {
        const res = await fetch(`${API_URL}/entries/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Delete failed");
        
        showToast('Entry deleted.');
        await fetchEntries(true); // Refresh & Reset
        router('library');
    } catch (err) {
        showToast("❌ Error deleting");
    }
}

// ========================================== 
// 6. PROFILE & UTILS
// ========================================== 
window.loadProfileIntoForm = function() {
    document.getElementById('prof-name').value = profile.name;
    document.getElementById('prof-bio').value = profile.bio;
};

window.saveProfile = async function() {
    profile.name = document.getElementById('prof-name').value || 'User';
    profile.bio = document.getElementById('prof-bio').value || 'Learner';
    
    try {
        await fetch(`${API_URL}/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profile)
        });
        updateSidebar();
        showToast('Profile updated! ✨');
    } catch (err) {
        showToast('❌ Failed to save profile');
    }
};

window.exportData = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(entries));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "brainstack_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast("Backup downloaded! ⬇️");
};

window.importData = function(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) throw new Error("Invalid format");
            
            showLoading();
            let count = 0;
            const total = imported.length;

            // Process sequentially to ensure order (optional but safer)
            for (const entry of imported) {
                try {
                    // Map old backup structure to payload if necessary
                    // Assuming backup matches standard structure
                    const payload = {
                        title: entry.title,
                        category_name: entry.category_name || entry.category || 'General',
                        date: entry.learning_date || entry.date || new Date().toISOString().split('T')[0],
                        notes: entry.notes_markdown || entry.notes || '',
                        difficulty: entry.difficulty_level || entry.difficulty || 1,
                        needs_revision: entry.needs_revision || entry.revision || false,
                        resources: entry.resources || [],
                        tags: entry.tags || []
                    };

                    const res = await fetch(`${API_URL}/entries`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if (res.ok) count++;
                    
                    // Optional: Update loading text or toast with progress
                    // console.log(`Imported ${count}/${total}`);
                } catch (innerErr) {
                    console.error("Failed to import entry:", entry.title, innerErr);
                }
            }
            
            showToast(`Import complete! ${count}/${total} imported.`);
            input.value = ''; // Reset input
            
            // Refresh Data
            await fetchEntries();
            await fetchCategories();
            
        } catch (err) {
            console.error(err);
            showToast("❌ Import failed: Invalid JSON");
        } finally {
            hideLoading();
        }
    };
    reader.readAsText(file);
};

window.nukeData = async function() {
    if(!confirm('⚠️ ARE YOU SURE? This will permanently DELETE ALL your entries, categories, and tags from the database.')) return;
    if(!confirm('🔴 Final Warning: This action cannot be undone. Delete everything?')) return;

    try {
        const res = await fetch(`${API_URL}/danger/clear-all`, { method: 'DELETE' });
        if(!res.ok) throw new Error("Failed to clear");
        
        localStorage.clear(); // Also clear local prefs like theme
        alert('All data has been wiped. The app will now reload.');
        location.reload();
    } catch (err) {
        console.error(err);
        showToast("❌ Error: Could not clear data");
    }
};

function updateSidebar() {
    const sideName = document.getElementById('side-name');
    const sideStatus = document.getElementById('side-status');
    const sideAvatar = document.getElementById('side-avatar');
    
    if (sideName) sideName.innerText = profile.name;
    if (sideStatus) sideStatus.innerText = profile.bio;
    if (sideAvatar) {
        const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        sideAvatar.innerText = initials || '??';
    }
}

window.resetAddForm = function() {
    document.getElementById('add-form').reset();
    document.getElementById('inp-date').value = getTodayString();

    document.getElementById('inp-id').value = '';
    document.getElementById('btn-save').innerText = 'Save Entry';
    document.getElementById('view-add-title').innerText = 'Add New Learning';
    currentTags = [];
    document.getElementById('resource-list').innerHTML = '';
    renderTags();
    
    document.getElementById('inp-category').classList.remove('hidden');
    document.getElementById('inp-new-category').classList.add('hidden');
    const btn = document.querySelector('.btn-icon');
    if(btn) { btn.innerText = '+'; btn.style.color = ''; } // Reset button style
    
    router('add');
};

function showToast(msg) {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = msg;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

function formatLocalTime(timestamp) {
    if (!timestamp) return '';
    try {
        return new Date(timestamp).toLocaleTimeString(undefined, { 
            hour: 'numeric', 
            minute: '2-digit', 
            hour12: true 
        });
    } catch (e) { return ''; }
}

// ========================================== 
// 7. RENDER FUNCTIONS
// ========================================== 
function renderDashboard() {
    const totalEl = document.getElementById('stat-total');
    if (totalEl) totalEl.innerText = entries.length;
    
    const revEl = document.getElementById('stat-revision');
    if (revEl) revEl.innerText = entries.filter(e => e.revision).length;
    
    // Calculate Streak
    const sortedDates = [...entries].map(e => e.date).sort().reverse();
    const uniqueDates = [...new Set(sortedDates)];
    
    let streak = 0;
    let today = new Date();
    today.setHours(0,0,0,0);
    
    const lastEntryDate = uniqueDates.length > 0 ? new Date(uniqueDates[0]) : null;
    if (lastEntryDate) lastEntryDate.setHours(0,0,0,0);
    
    const diffTime = lastEntryDate ? Math.abs(today - lastEntryDate) : Infinity;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

    if (diffDays <= 1) { // 0 = today, 1 = yesterday
        streak = 1;
        let currentDate = lastEntryDate;
        
        for (let i = 1; i < uniqueDates.length; i++) {
            const prevDate = new Date(uniqueDates[i]);
            prevDate.setHours(0,0,0,0);
            if ((currentDate - prevDate) / (1000 * 60 * 60 * 24) === 1) {
                streak++;
                currentDate = prevDate;
            } else { break; }
        }
    }
    
    const streakEl = document.getElementById('stat-streak');
    if (streakEl) streakEl.innerText = `🔥 ${streak} Days`;
    
    // Charts logic
    const diffCounts = {1:0, 2:0, 3:0, 4:0, 5:0};
    entries.forEach(e => diffCounts[e.difficulty] = (diffCounts[e.difficulty] || 0) + 1);
    
    const maxDiff = Math.max(...Object.values(diffCounts), 1);
    const diffLabels = {1:'Beg', 2:'Easy', 3:'Med', 4:'Hard', 5:'Exp'};
    
    let diffHtml = '';
    for(let i=1; i<=5; i++) {
        const height = (diffCounts[i] / maxDiff) * 100;
        diffHtml += `
            <div class="chart-bar-group">
                <div class="chart-bar" style="height:${height}%"></div>
                <div class="chart-label">${diffLabels[i]}</div>
            </div>`;
    }
    const chartDiff = document.getElementById('chart-difficulty');
    if (chartDiff) chartDiff.innerHTML = diffHtml;

    const catCounts = {};
    entries.forEach(e => catCounts[e.category] = (catCounts[e.category] || 0) + 1);
    
    const sortedCats = Object.entries(catCounts).sort((a,b) => b[1] - a[1]).slice(0, 5);
    const maxCat = Math.max(...sortedCats.map(c => c[1]), 1);
    
    let catHtml = '';
    sortedCats.forEach(([name, count]) => {
         const height = (count / maxCat) * 100;
         catHtml += `
            <div class="chart-bar-group">
                <div class="chart-bar" style="height:${height}%; background:var(--accent-warn)"></div>
                <div class="chart-label">${name}</div>
            </div>`;
    });
    if (sortedCats.length === 0) catHtml = '<p style="margin:auto; color:var(--text-muted)">No data</p>';
    const chartCat = document.getElementById('chart-category');
    if (chartCat) chartCat.innerHTML = catHtml;

    // Recent Activity
    const list = document.getElementById('recent-list');
    if (list) {
        list.innerHTML = entries.length ? '' : '<p style="color:var(--text-muted)">No entries yet.</p>';
        
        entries.slice(0, 5).forEach(entry => {
            const item = document.createElement('div');
            item.className = 'card';
            item.style.padding = '15px 20px';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.cursor = 'pointer';
            item.style.borderLeft = `4px solid var(--primary)`; 
            item.onclick = () => viewEntry(entry.id);

            const d1 = new Date(entry.date);
            const d2 = new Date();
            d1.setHours(0,0,0,0);
            d2.setHours(0,0,0,0);
            const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
            const timeAgo = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
            const timeStr = formatLocalTime(entry.created_at || new Date().toISOString());

            item.innerHTML = `
                <div>
                    <div style="font-size: 1rem; font-weight: 600; margin-bottom: 4px;">${entry.title}</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="font-size: 0.7rem;">${entry.category}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">${timeAgo} • ${timeStr}</span>
                    </div>
                </div>
                <div style="font-size: 1.2rem; color: var(--text-muted);">›</div>
            `;
            list.appendChild(item);
        });
    }
}

function renderLibrary() {
    const list = document.getElementById('library-list');
    const catFilter = document.getElementById('filter-category');
    const diffFilter = document.getElementById('filter-difficulty');
    
    if (!list) return;

    const selectedCat = catFilter ? catFilter.value : '';
    const selectedDiff = diffFilter ? diffFilter.value : '';

    list.innerHTML = '';

    const filtered = entries.filter(e => {
        // Text filtering is now handled by the server
        const matchesCat = selectedCat === '' || e.category === selectedCat;
        const matchesDiff = selectedDiff === '' || e.difficulty.toString() === selectedDiff;
        
        return matchesCat && matchesDiff;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted)">No matches found for your current filters.</div>';
        return;
    }

    filtered.forEach(entry => {
        const card = document.createElement('div');
        card.className = `entry-card ${entry.revision ? 'needs-revision' : ''}`;
        const stars = '●'.repeat(entry.difficulty) + '○'.repeat(5 - entry.difficulty);

        const tagHtml = (entry.tags || []).slice(0, 3).map(t => 
            `<span class="badge" style="background:var(--primary-light); color:var(--primary); margin-right:4px;">#${t}</span>`
        ).join('');
        const moreTags = (entry.tags || []).length > 3 ? '<span style="font-size:0.8rem; color:var(--text-muted)">+</span>' : '';

        const d1 = new Date(entry.date);
        const d2 = new Date();
        d1.setHours(0,0,0,0);
        d2.setHours(0,0,0,0);
        const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        const timeAgo = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
        const timeStr = formatLocalTime(entry.created_at || new Date().toISOString());

        card.innerHTML = 
            `<div onclick="viewEntry(${entry.id})">
                <div style="display:flex; justify-content:space-between; align-items:start">
                    <h3>${entry.title}</h3>
                    <div style="display:flex; gap:5px">
                        <button class="btn-xs" onclick="editEntry(event, ${entry.id})" style="color:var(--primary); background:none; border:none; font-size:1.2rem;">✏️</button>
                        <button class="btn-xs" onclick="deleteEntry(event, ${entry.id})" style="color:red; background:none; border:none; font-size:1.2rem;">🗑️</button>
                    </div>
                </div>
                
                <div style="margin: 5px 0;">
                    <span class="badge" style="display:inline-block; margin-bottom:5px;">${entry.category}</span>
                    ${tagHtml} ${moreTags}
                </div>

                <p style="margin: 10px 0; font-size: 0.9rem; color: var(--text-muted);">
                    ${entry.notes.replace(/[#*`>]/g, '').substring(0, 60)}...
                </p>
                <div class="card-footer">
                    <span style="color:var(--primary)">${stars}</span>
                    <span style="font-size:0.8rem">${timeAgo} • ${timeStr}</span>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

function parseMarkdown(text) {
    if (!text) return '';
    let html = text
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
        .replace(/\*(.*)\*/gim, '<i>$1</i>')
        .replace(/`(.*)`/gim, '<code>$1</code>')
        .replace(/\*\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/^---$/gim, '<hr>')
        .replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');

    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>')
               .replace(/<\/ul>\s*<ul>/gim, '')
               .replace(/\n/gim, '<br>');
    return html;
}

window.viewEntry = function(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;

    currentViewId = id; 

    document.getElementById('detail-title').innerText = entry.title;
    const catBadge = document.getElementById('detail-category');
    catBadge.innerText = entry.category;
    
    // Format date in local locale
    const dateObj = new Date(entry.date);
    const date = dateObj.toLocaleDateString(undefined, { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric'
    });
    // Use updated_at if available, otherwise fallback to created_at
    const time = formatLocalTime(entry.updated_at || entry.created_at || new Date().toISOString());
    document.getElementById('detail-date').innerText = `${date} at ${time}`;
    
    document.getElementById('detail-diff').innerText = '●'.repeat(entry.difficulty) + '○'.repeat(5 - entry.difficulty);
    document.getElementById('detail-content').innerHTML = parseMarkdown(entry.notes);

    const resContainer = document.getElementById('detail-resources');
    resContainer.innerHTML = '';
    if(entry.resources && entry.resources.length > 0) {
        resContainer.innerHTML = '<strong>🔗 Resources:</strong>';
        entry.resources.forEach(url => {
            const div = document.createElement('div');
            div.innerHTML = `<a href="${url}" target="_blank" class="res-link-item">${url}</a>`;
            resContainer.appendChild(div);
        });
    }

    const tagContainer = document.getElementById('detail-tags');
    tagContainer.innerHTML = '';
    if(entry.tags) {
        entry.tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'tag-chip';
            span.innerHTML = `<span>${tag}</span>`;
            tagContainer.appendChild(span);
        });
    }

    router('details');
};

window.formatDoc = function(cmd) {
    const textarea = document.getElementById('inp-notes');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const select = text.substring(start, end);
    let insert = '';

    switch (cmd) {
        case 'bold': insert = `**${select}**`; break;
        case 'italic': insert = `*${select}*`; break;
        case 'code': insert = `\`${select}\``; break;
        case 'list': insert = `
- ${select}`; break;
        case 'h2': insert = `
## ${select}`; break;
        default: return;
    }
    textarea.value = text.substring(0, start) + insert + text.substring(end);
    textarea.focus();
    textarea.selectionEnd = end + insert.length; 
};

window.togglePreview = function() {
    const textarea = document.getElementById('inp-notes');
    const preview = document.getElementById('preview-panel');
    if (!textarea || !preview) return;
    
    if (textarea.classList.contains('hidden')) {
        textarea.classList.remove('hidden');
        preview.classList.add('hidden');
    } else {
        textarea.classList.add('hidden');
        preview.classList.remove('hidden');
        preview.innerHTML = parseMarkdown(textarea.value) || '<em style="color:#ccc">Preview...</em>';
    }
};

let revisionQueue = [];
let currentRevIndex = 0;

window.startRevision = function() {
    revisionQueue = entries.filter(e => e.revision);
    router('revision');
    
    if (revisionQueue.length === 0) {
        document.getElementById('revision-list-container').classList.add('hidden');
        document.getElementById('revision-session-container').classList.add('hidden');
        document.getElementById('revision-empty').classList.remove('hidden');
        return;
    }

    document.getElementById('revision-empty').classList.add('hidden');
    document.getElementById('revision-session-container').classList.add('hidden');
    document.getElementById('revision-list-container').classList.remove('hidden');
    
    renderRevisionList();
};

function renderRevisionList() {
    const list = document.getElementById('rev-list-items');
    list.innerHTML = '';
    
    revisionQueue.forEach(entry => {
        const d1 = new Date(entry.date);
        const d2 = new Date();
        d1.setHours(0,0,0,0);
        d2.setHours(0,0,0,0);
        const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        const timeAgo = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
        const timeStr = formatLocalTime(entry.created_at || new Date().toISOString());

        const item = document.createElement('div');
        item.className = 'card';
        item.style.padding = '15px 20px';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.cursor = 'pointer';
        item.onclick = () => viewEntry(entry.id);
        
        item.innerHTML = 
            `<div>
                <strong>${entry.title}</strong>
                <span class="badge" style="margin-left:10px">${entry.category}</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${timeAgo} • ${timeStr}</div>
        `;
        list.appendChild(item);
    });
}

window.startFlashcardSession = function() {
    currentRevIndex = 0;
    document.getElementById('revision-list-container').classList.add('hidden');
    document.getElementById('revision-session-container').classList.remove('hidden');
    loadFlashcard();
};

window.exitSession = function() {
    document.getElementById('revision-session-container').classList.add('hidden');
    document.getElementById('revision-list-container').classList.remove('hidden');
};

function loadFlashcard() {
    if (currentRevIndex >= revisionQueue.length) {
        showToast("Session complete!");
        startRevision(); 
        return;
    }

    const entry = revisionQueue[currentRevIndex];
    document.getElementById('rev-progress').innerText = `Card ${currentRevIndex + 1} of ${revisionQueue.length}`;
    
    const card = document.getElementById('flashcard-container');
    card.onclick = toggleFlashcard;
    
    document.querySelector('.fc-front').classList.remove('hidden');
    document.querySelector('.fc-back').classList.add('hidden');
    document.getElementById('fc-controls').classList.add('hidden');

    document.getElementById('fc-category').innerText = entry.category;
    document.getElementById('fc-title').innerText = entry.title;
    
    const tagContainer = document.getElementById('fc-tags');
    tagContainer.innerHTML = '';
    (entry.tags || []).forEach(t => {
        const span = document.createElement('span');
        span.className = 'badge';
        span.innerText = `#${t}`;
        tagContainer.appendChild(span);
    });

    document.getElementById('fc-content').innerHTML = parseMarkdown(entry.notes);
}

function toggleFlashcard() {
    const front = document.querySelector('.fc-front');
    const back = document.querySelector('.fc-back');
    const controls = document.getElementById('fc-controls');

    if (!front.classList.contains('hidden')) {
        front.classList.add('hidden');
        back.classList.remove('hidden');
        controls.classList.remove('hidden');
        document.getElementById('flashcard-container').onclick = null;
    }
}

window.processRevision = async function(keep) {
    const entry = revisionQueue[currentRevIndex];
    
    if (!keep) {
        // Update DB to set needs_revision = false
        try {
            // We use the same PUT endpoint but with specific flag
            // Note: Ensure your backend supports updating 'needs_revision'
            const payload = { ...entry, needs_revision: false };
            
            await fetch(`${API_URL}/entries/${entry.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            // Update local state immediately for UI
            const realEntry = entries.find(e => e.id === entry.id);
            if(realEntry) realEntry.revision = false;
            
        } catch (e) {
            console.error("Failed to update revision status", e);
        }
    }
    
    currentRevIndex++;
    loadFlashcard();
};
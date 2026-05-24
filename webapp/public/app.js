const socket = io();

// UI Elements
const statusBadge = document.getElementById('status-badge');
const statusBadgeText = statusBadge.querySelector('.status-text');
const qrImage = document.getElementById('qr-image');
const qrLoader = document.getElementById('qr-loader');
const refreshQrBtn = document.getElementById('refresh-qr-btn');
const authPanel = document.getElementById('auth-panel');
const emailPanel = document.getElementById('email-panel');
const automationPanel = document.getElementById('automation-panel');
const terminal = document.getElementById('terminal');

// Progress Elements
const progressCircle = document.getElementById('progress-circle');
const progressText = document.getElementById('progress-text');

// Form Elements
const form = document.getElementById('broadcast-form');
const startBtn = document.getElementById('start-btn');
const csvFile = document.getElementById('csv-file');
const attachmentFile = document.getElementById('attachment-file');
const messageTemplate = document.getElementById('message-template');
const subjectGroup = document.getElementById('subject-group');
const emailSubject = document.getElementById('email-subject');
const emailUser = document.getElementById('email-user');
const emailPass = document.getElementById('email-pass');

// New UI Elements
const previewPanel = document.getElementById('preview-panel');
const contactsTableBody = document.getElementById('contacts-table-body');
const contactsTableHeaderRow = document.getElementById('contacts-table-header-row');
const selectAllContacts = document.getElementById('select-all-contacts');
const dynamicTagsList = document.getElementById('dynamic-tags');
const formatBtns = document.querySelectorAll('.format-btn');
const messagePreview = document.getElementById('message-preview');
const previewGroup = document.getElementById('preview-group');
const attachmentListContainer = document.getElementById('attachment-list-container');

const sequenceControlPanel = document.getElementById('sequence-control-panel');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const abortBtn = document.getElementById('abort-btn');
const audienceStats = document.getElementById('audience-stats');

// Drop Zones
const csvDropZone = document.getElementById('csv-drop-zone');
const attachmentDropZone = document.getElementById('attachment-drop-zone');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabSlider = document.querySelector('.tab-slider');

let whatsappReady = false;
let currentMode = 'whatsapp';
let parsedRows = [];
let parsedHeaders = [];

// File Input Listeners for Drop Zones
csvFile.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        csvDropZone.querySelector('.drop-text span').textContent = file.name;
        csvDropZone.style.borderColor = 'var(--primary)';
        csvDropZone.style.background = 'rgba(16, 185, 129, 0.05)';
        
        addLog('info', `Uploading & parsing ${file.name}...`);
        
        const formData = new FormData();
        formData.append('csvFile', file);
        
        try {
            const res = await fetch('/api/parse-csv', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) {
                addLog('error', `CSV Parse Error: ${data.error}`);
                return;
            }
            
            parsedHeaders = data.headers;
            parsedRows = data.rows;
            
            addLog('success', `Parsed CSV: ${parsedRows.length} contacts found.`);
            renderAudiencePreview();
            
        } catch (err) {
            addLog('error', `Failed to parse CSV: ${err.message}`);
        }
    }
});

attachmentFile.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 3) {
        addLog('warning', "Maximum of 3 attachments allowed. Only the first 3 files will be sent.");
        
        // Truncate to first 3 files
        const dt = new DataTransfer();
        files.slice(0, 3).forEach(f => dt.items.add(f));
        attachmentFile.files = dt.files;
    }
    
    const selectedFiles = Array.from(attachmentFile.files);
    if (selectedFiles.length > 0) {
        const names = selectedFiles.map(f => f.name).join(', ');
        attachmentDropZone.querySelector('.drop-text span').textContent = `${selectedFiles.length} file(s) selected`;
        attachmentDropZone.querySelector('.drop-text small').textContent = names;
        attachmentDropZone.style.borderColor = 'var(--primary)';
        attachmentDropZone.style.background = 'rgba(16, 185, 129, 0.05)';

        // Populate the attachment list display
        attachmentListContainer.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'attachment-list-item';
            
            const left = document.createElement('div');
            left.className = 'attachment-list-item-left';
            
            const label = document.createElement('span');
            label.className = 'attachment-list-item-label';
            label.textContent = `Attachment ${index + 1}:`;
            
            const name = document.createElement('span');
            name.className = 'attachment-list-item-name';
            name.textContent = file.name;
            
            left.appendChild(label);
            left.appendChild(name);
            item.appendChild(left);
            attachmentListContainer.appendChild(item);
        });
        attachmentListContainer.style.display = 'flex';
    } else {
        attachmentDropZone.querySelector('.drop-text span').textContent = 'Add Attachments';
        attachmentDropZone.querySelector('.drop-text small').textContent = 'Optional Images or Documents (Max 3)';
        attachmentDropZone.style.borderColor = 'var(--glass-border)';
        attachmentDropZone.style.background = 'rgba(0, 0, 0, 0.1)';
        attachmentListContainer.innerHTML = '';
        attachmentListContainer.style.display = 'none';
    }

    // Re-render audience list if CSV is already loaded to add/remove attachment check columns
    if (parsedRows.length > 0) {
        renderAudiencePreview();
    }
});

function renderAudiencePreview() {
    previewPanel.style.display = 'flex';
    previewGroup.style.display = 'block';
    
    // Enable message controls
    messageTemplate.disabled = false;
    formatBtns.forEach(btn => btn.disabled = false);
    
    // Stats
    audienceStats.textContent = `${parsedRows.length} contacts loaded`;
    
    // Available variables mapping badges
    dynamicTagsList.innerHTML = '';
    parsedHeaders.forEach(header => {
        const badge = document.createElement('div');
        badge.className = 'dynamic-tag-badge';
        badge.textContent = `$${header}`;
        badge.title = `Click to insert $${header}`;
        badge.addEventListener('click', () => {
            insertTextAtCursor(messageTemplate, `$${header}`);
            updateLivePreview();
        });
        dynamicTagsList.appendChild(badge);
    });
    
    // Reconstruct Table Header Row to clear old headers
    contactsTableHeaderRow.innerHTML = `
        <th style="width: 50px; text-align: center;">Sel</th>
        <th style="width: 60px; text-align: center;">Row</th>
        <th>Name</th>
        <th>Phone</th>
        <th>Email</th>
    `;
    
    const attCount = attachmentFile.files ? attachmentFile.files.length : 0;
    if (attCount >= 2) {
        for (let j = 0; j < attCount; j++) {
            const th = document.createElement('th');
            th.style.textAlign = 'center';
            th.style.width = '80px';
            th.textContent = `Att ${j + 1}`;
            th.title = `Attachment ${j + 1}: ${attachmentFile.files[j].name}`;
            th.style.cursor = 'help';
            contactsTableHeaderRow.appendChild(th);
        }
    }
    
    // Load contacts table
    contactsTableBody.innerHTML = '';
    parsedRows.forEach((row, i) => {
        const keys = Object.keys(row);
        const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('search'));
        const phone = phoneKey ? row[phoneKey] : 'N/A';
        const nameKey = keys.find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('user') || k.toLowerCase().includes('first'));
        const name = nameKey ? row[nameKey] : 'N/A';
        const emailKey = keys.find(k => k.toLowerCase().includes('email') || k.toLowerCase().includes('mail'));
        const email = emailKey ? row[emailKey] : 'N/A';
        
        const tr = document.createElement('tr');
        tr.dataset.index = i;
        
        // Base columns
        let rowHtml = `
            <td style="text-align: center;"><input type="checkbox" class="contact-checkbox" checked data-index="${i}"></td>
            <td style="text-align: center; color: var(--text-muted); font-weight: 500;">${i + 1}</td>
            <td style="font-weight: 500; color: #fff;">${name}</td>
            <td style="font-family: var(--font-mono); color: var(--text-main);">${phone}</td>
            <td style="color: var(--text-muted);">${email}</td>
        `;
        tr.innerHTML = rowHtml;
        
        // Add attachment columns if applicable
        if (attCount >= 2) {
            for (let j = 0; j < attCount; j++) {
                const td = document.createElement('td');
                td.style.textAlign = 'center';
                const attChk = document.createElement('input');
                attChk.type = 'checkbox';
                attChk.className = `row-att-checkbox row-${i}-att-${j}`;
                attChk.checked = true;
                attChk.dataset.rowIndex = i;
                attChk.dataset.attIndex = j;
                td.appendChild(attChk);
                tr.appendChild(td);
            }
        }
        
        const chk = tr.querySelector('.contact-checkbox');
        chk.addEventListener('change', () => {
            tr.classList.toggle('skipped', !chk.checked);
            updateAudienceStats();
            updateLivePreview();
        });
        
        contactsTableBody.appendChild(tr);
    });
    
    selectAllContacts.checked = true;
    updateAudienceStats();
    updateLivePreview();
}

function updateAudienceStats() {
    const total = parsedRows.length;
    const selected = document.querySelectorAll('.contact-checkbox:checked').length;
    audienceStats.textContent = `${selected} / ${total} contacts selected`;
}

selectAllContacts.addEventListener('change', () => {
    const checked = selectAllContacts.checked;
    document.querySelectorAll('.contact-checkbox').forEach(chk => {
        chk.checked = checked;
        const tr = chk.closest('tr');
        if (tr) tr.classList.toggle('skipped', !checked);
    });
    updateAudienceStats();
    updateLivePreview();
});

function insertTextAtCursor(el, text) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    el.value = val.substring(0, start) + text + val.substring(end);
    el.selectionStart = el.selectionEnd = start + text.length;
    el.focus();
}

formatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        const textarea = messageTemplate;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;
        
        if (start !== end) {
            const selectedText = val.substring(start, end);
            textarea.value = val.substring(0, start) + tag + selectedText + tag + val.substring(end);
            textarea.selectionStart = start;
            textarea.selectionEnd = end + tag.length * 2;
        } else {
            textarea.value = val.substring(0, start) + tag + tag + val.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        }
        textarea.focus();
        updateLivePreview();
    });
});

function renderMarkdown(text) {
    if (!text) return '';
    let escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
        
    escaped = escaped
        .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/~([^~]+)~/g, '<del>$1</del>')
        .replace(/```([^`]+)```/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
        
    return escaped;
}

function updateLivePreview() {
    if (!parsedRows || parsedRows.length === 0) {
        messagePreview.innerHTML = renderMarkdown(messageTemplate.value);
        return;
    }
    
    const checkedCheckboxes = document.querySelectorAll('.contact-checkbox:checked');
    if (checkedCheckboxes.length === 0) {
        messagePreview.innerHTML = '<span style="color: var(--text-muted); font-style: italic;">No recipients selected.</span>';
        return;
    }
    
    const index = parseInt(checkedCheckboxes[0].dataset.index);
    const row = parsedRows[index];
    
    let previewText = messageTemplate.value;
    parsedHeaders.forEach(header => {
        const regex = new RegExp(`\\$${header}\\b`, 'g');
        previewText = previewText.replace(regex, row[header] || '');
    });
    
    messagePreview.innerHTML = renderMarkdown(previewText);
}

messageTemplate.addEventListener('input', updateLivePreview);

// Tab Logic
tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Move slider dynamically
        tabSlider.style.width = `${btn.offsetWidth}px`;
        tabSlider.style.transform = `translateX(${btn.offsetLeft - 4}px)`;
        
        currentMode = btn.dataset.target;
        updateUIForMode();
    });
});

function updateUIForMode() {
    // Hide panels
    authPanel.style.display = 'none';
    emailPanel.style.display = 'none';
    subjectGroup.style.display = 'none';
    
    // Reset disables
    csvFile.disabled = false;
    attachmentFile.disabled = false;
    
    const isLoaded = parsedRows.length > 0;
    messageTemplate.disabled = !isLoaded;
    formatBtns.forEach(btn => btn.disabled = !isLoaded);
    emailSubject.disabled = true;

    // Show appropriate panels
    if (currentMode === 'whatsapp') {
        authPanel.style.display = 'block';
        startBtn.disabled = !whatsappReady;
        automationPanel.classList.toggle('disabled', !whatsappReady);
    } else if (currentMode === 'email') {
        emailPanel.style.display = 'block';
        subjectGroup.style.display = 'flex';
        emailSubject.disabled = false;
        startBtn.disabled = false; 
        automationPanel.classList.remove('disabled');
    } else if (currentMode === 'both') {
        authPanel.style.display = 'block';
        emailPanel.style.display = 'block';
        subjectGroup.style.display = 'flex';
        emailSubject.disabled = false;
        startBtn.disabled = !whatsappReady;
        automationPanel.classList.toggle('disabled', !whatsappReady);
    }

    // Trigger reflow for slide animation
    const panels = document.querySelectorAll('.glass-panel');
    panels.forEach(p => {
        p.style.animation = 'none';
        p.offsetHeight; /* trigger reflow */
        p.style.animation = null; 
    });
}

function addLog(type, msg) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    entry.innerHTML = `<span class="prompt">❯</span> <span class="time">[${time}]</span> ${msg}`;
    terminal.appendChild(entry);
    terminal.scrollTop = terminal.scrollHeight;
}

function setProgress(percent) {
    const radius = progressCircle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percent / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
}

// Socket Events
socket.on('qr', (url) => {
    qrLoader.style.display = 'none';
    qrImage.style.display = 'block';
    refreshQrBtn.style.display = 'block';
    qrImage.src = url;
});

socket.on('ready', (isReady) => {
    whatsappReady = isReady;
    if (isReady) {
        statusBadgeText.textContent = 'WhatsApp Connected';
        statusBadge.className = 'badge success';
        qrImage.style.display = 'none';
        qrLoader.style.display = 'none';
        refreshQrBtn.style.display = 'none';
        
        if (currentMode === 'whatsapp') authPanel.style.display = 'none';
        updateUIForMode();
    } else {
        statusBadgeText.textContent = 'WhatsApp Disconnected';
        statusBadge.className = 'badge error';
        qrImage.style.display = 'none';
        qrLoader.style.display = 'block';
        updateUIForMode();
    }
});

socket.on('log', (data) => addLog(data.type, data.msg));

socket.on('broadcast_state', (state) => {
    if (state.active) {
        startBtn.style.display = 'none';
        sequenceControlPanel.style.display = 'flex';
        
        if (state.isPaused) {
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'flex';
        } else {
            pauseBtn.style.display = 'flex';
            resumeBtn.style.display = 'none';
        }
        
        csvFile.disabled = true;
        attachmentFile.disabled = true;
        messageTemplate.disabled = true;
        emailSubject.disabled = true;
        formatBtns.forEach(btn => btn.disabled = true);
        selectAllContacts.disabled = true;
        document.querySelectorAll('.contact-checkbox').forEach(chk => chk.disabled = true);
        document.querySelectorAll('.row-att-checkbox').forEach(chk => chk.disabled = true);
    } else {
        startBtn.style.display = 'flex';
        sequenceControlPanel.style.display = 'none';
        
        const isLoaded = parsedRows.length > 0;
        csvFile.disabled = false;
        attachmentFile.disabled = false;
        messageTemplate.disabled = !isLoaded;
        emailSubject.disabled = !(currentMode === 'email' || currentMode === 'both');
        formatBtns.forEach(btn => btn.disabled = !isLoaded);
        selectAllContacts.disabled = !isLoaded;
        document.querySelectorAll('.contact-checkbox').forEach(chk => chk.disabled = false);
        document.querySelectorAll('.row-att-checkbox').forEach(chk => chk.disabled = false);
        
        startBtn.querySelector('.btn-text').textContent = 'Initialize Sequence';
    }
});

pauseBtn.addEventListener('click', () => {
    socket.emit('pause_broadcast');
});

resumeBtn.addEventListener('click', () => {
    socket.emit('resume_broadcast');
});

abortBtn.addEventListener('click', () => {
    socket.emit('stop_broadcast');
});

refreshQrBtn.addEventListener('click', () => {
    socket.emit('refresh_qr');
    qrImage.style.display = 'none';
    refreshQrBtn.style.display = 'none';
    qrLoader.style.display = 'block';
});

socket.on('progress', (data) => {
    const percentage = (data.current / data.total) * 100;
    setProgress(percentage);
    progressText.textContent = `${Math.round(percentage)}%`;
});

// Form Submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!csvFile.files[0]) {
        addLog('warning', "Operation aborted. Please select a CSV file.");
        return;
    }

    if ((currentMode === 'email' || currentMode === 'both') && (!emailUser.value || !emailPass.value || !emailSubject.value)) {
        addLog('warning', "Operation aborted. Google credentials and Subject are required.");
        return;
    }

    const selectedIndices = [];
    document.querySelectorAll('.contact-checkbox:checked').forEach(chk => {
        selectedIndices.push(parseInt(chk.dataset.index));
    });

    if (selectedIndices.length === 0) {
        addLog('warning', "Operation aborted. Please select at least one recipient.");
        return;
    }
    
    const formData = new FormData();
    formData.append('csvFile', csvFile.files[0]);
    if (attachmentFile.files.length > 0) {
        for (let i = 0; i < attachmentFile.files.length; i++) {
            formData.append('attachments', attachmentFile.files[i]);
        }
    }
    formData.append('template', messageTemplate.value);
    formData.append('mode', currentMode);
    formData.append('selectedIndices', JSON.stringify(selectedIndices));
    
    // Serialize selective attachments mapping if 2 or 3 attachments exist
    const attCount = attachmentFile.files ? attachmentFile.files.length : 0;
    if (attCount >= 2) {
        const rowAttachments = {};
        parsedRows.forEach((row, i) => {
            const allowed = [];
            for (let j = 0; j < attCount; j++) {
                const chk = document.querySelector(`.row-${i}-att-${j}`);
                if (chk && chk.checked) {
                    allowed.push(j);
                }
            }
            rowAttachments[i] = allowed;
        });
        formData.append('rowAttachments', JSON.stringify(rowAttachments));
    }

    if (currentMode === 'email' || currentMode === 'both') {
        formData.append('emailUser', emailUser.value);
        formData.append('emailPass', emailPass.value);
        formData.append('emailSubject', emailSubject.value);
    }
    
    startBtn.disabled = true;
    startBtn.querySelector('.btn-text').textContent = 'Sequence Active...';
    csvFile.disabled = true;
    attachmentFile.disabled = true;
    messageTemplate.disabled = true;
    emailSubject.disabled = true;
    
    setProgress(0);
    progressText.textContent = '0%';

    try {
        const response = await fetch('/api/broadcast', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.error) {
            addLog('error', data.error);
            resetForm();
        }
    } catch (err) {
        addLog('error', 'Critical Error: Failed to communicate with main server loop.');
        resetForm();
    }
});

function resetForm() {
    updateUIForMode();
    startBtn.querySelector('.btn-text').textContent = 'Initialize Sequence';
}

// Init
setProgress(0);
updateUIForMode();

// Set initial slider position
setTimeout(() => {
    const activeBtn = document.querySelector('.tab-btn.active');
    if (activeBtn) {
        tabSlider.style.width = `${activeBtn.offsetWidth}px`;
        tabSlider.style.transform = `translateX(${activeBtn.offsetLeft - 4}px)`;
    }
}, 50);

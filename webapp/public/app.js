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

// Drop Zones
const csvDropZone = document.getElementById('csv-drop-zone');
const attachmentDropZone = document.getElementById('attachment-drop-zone');

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const tabSlider = document.querySelector('.tab-slider');

let whatsappReady = false;
let currentMode = 'whatsapp';

// File Input Listeners for Drop Zones
csvFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        csvDropZone.querySelector('.drop-text span').textContent = e.target.files[0].name;
        csvDropZone.style.borderColor = 'var(--primary)';
        csvDropZone.style.background = 'rgba(16, 185, 129, 0.05)';
    }
});

attachmentFile.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        attachmentDropZone.querySelector('.drop-text span').textContent = e.target.files[0].name;
        attachmentDropZone.style.borderColor = 'var(--primary)';
        attachmentDropZone.style.background = 'rgba(16, 185, 129, 0.05)';
    }
});

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
    messageTemplate.disabled = false;
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
    
    const formData = new FormData();
    formData.append('csvFile', csvFile.files[0]);
    if (attachmentFile.files[0]) {
        formData.append('attachment', attachmentFile.files[0]);
    }
    formData.append('template', messageTemplate.value);
    formData.append('mode', currentMode);
    
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
        } else {
            // Once finished
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

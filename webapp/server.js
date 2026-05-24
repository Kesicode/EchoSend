const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { execSync } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Secure directories permissions on startup
try {
    const authDir = path.join(__dirname, '.wwebjs_auth');
    const uploadsDir = path.join(__dirname, 'uploads');
    
    // Create folders if they don't exist
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    if (process.platform === 'win32') {
        const username = process.env.USERNAME || 'Everyone';
        // Remove inheritance and grant Full Control only to the active user profile
        execSync(`icacls "${authDir}" /inheritance:r /grant:r "${username}":(OI)(CI)F`, { stdio: 'ignore' });
        execSync(`icacls "${uploadsDir}" /inheritance:r /grant:r "${username}":(OI)(CI)F`, { stdio: 'ignore' });
    } else {
        // Unix-like: restrict read/write/execute permissions to owner only (chmod 700)
        fs.chmodSync(authDir, 0o700);
        fs.chmodSync(uploadsDir, 0o700);
    }
} catch (err) {
    console.error('Security hardening: Unable to lock down directories:', err.message);
}

// Add Express Security Hardening Headers
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' /socket.io/socket.io.js; img-src 'self' data:; connect-src 'self' ws: http:;");
    next();
});

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

const upload = multer({ dest: 'uploads/' });

let clientReady = false;

let broadcastState = {
    isPaused: false,
    isStopped: false,
    active: false
};

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
    puppeteer: { 
        headless: true,
        bypassCSP: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-default-apps',
            '--disable-features=Translate,BackForwardCache,AcceptCHFrame,AvoidUnnecessaryTemplates',
            '--no-default-browser-check',
            '--mute-audio'
        ] 
    }
});

io.on('connection', (socket) => {
    socket.emit('log', { type: 'info', msg: 'Initializing WhatsApp... This may take up to 30 seconds.' });
    socket.emit('broadcast_state', broadcastState);

    socket.on('refresh_qr', async () => {
        io.emit('log', { type: 'info', msg: 'Restarting WhatsApp Client to generate new QR...' });
        try {
            await client.destroy();
        } catch (e) {
            console.error('Error destroying client:', e);
        }
        client.initialize();
    });

    socket.on('pause_broadcast', () => {
        broadcastState.isPaused = true;
        io.emit('log', { type: 'warning', msg: 'Broadcast paused by user.' });
        io.emit('broadcast_state', broadcastState);
    });

    socket.on('resume_broadcast', () => {
        broadcastState.isPaused = false;
        io.emit('log', { type: 'success', msg: 'Broadcast resumed.' });
        io.emit('broadcast_state', broadcastState);
    });

    socket.on('stop_broadcast', () => {
        broadcastState.isStopped = true;
        io.emit('log', { type: 'error', msg: 'Broadcast abort requested by user.' });
        io.emit('broadcast_state', broadcastState);
    });
});

client.on('qr', (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        io.emit('qr', url);
        io.emit('log', { type: 'info', msg: 'Please scan the QR code to log in to WhatsApp.' });
    });
});

client.on('ready', () => {
    clientReady = true;
    io.emit('ready', true);
    io.emit('log', { type: 'success', msg: 'WhatsApp Client is ready!' });
});

client.on('authenticated', () => {
    io.emit('log', { type: 'success', msg: 'Authenticated successfully.' });
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
    io.emit('log', { type: 'error', msg: `Authentication failure: ${msg}` });
});

client.on('disconnected', (reason) => {
    clientReady = false;
    io.emit('ready', false);
    io.emit('log', { type: 'error', msg: `Client was logged out: ${reason}` });
});

client.initialize();

// Utility functions for PII obfuscation in logs
function maskPhone(phone) {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    if (clean.length <= 5) return '***';
    return clean.slice(0, 4) + '******' + clean.slice(-2);
}

function maskEmail(email) {
    if (!email || !email.includes('@')) return '';
    const [name, domain] = email.split('@');
    if (name.length <= 2) return name[0] + '***@' + domain;
    return name.slice(0, 2) + '***' + name.slice(-1) + '@' + domain;
}

// API Endpoint to parse CSV and return headers & rows
app.post('/api/parse-csv', upload.single('csvFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No CSV file uploaded.' });
    }

    const csvFilePath = req.file.path;
    const results = [];
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
            fs.unlinkSync(csvFilePath); // Cleanup CSV
            if (results.length === 0) {
                return res.status(400).json({ error: 'CSV file is empty.' });
            }
            const headers = Object.keys(results[0]);
            res.json({ headers, rows: results });
        })
        .on('error', (err) => {
            if (fs.existsSync(csvFilePath)) {
                fs.unlinkSync(csvFilePath);
            }
            console.error('CSV parse error:', err);
            res.status(500).json({ error: 'Failed to parse CSV: ' + err.message });
        });
});

// API Endpoint to upload CSV and start broadcast
app.post('/api/broadcast', upload.fields([{ name: 'csvFile', maxCount: 1 }, { name: 'attachments', maxCount: 3 }]), (req, res) => {
    const { template, mode, emailUser, emailPass, emailSubject, selectedIndices: selectedIndicesRaw, minDelay: minDelayRaw, maxDelay: maxDelayRaw, rowAttachments: rowAttachmentsRaw } = req.body;

    if (mode === 'whatsapp' || mode === 'both') {
        if (!clientReady) {
            return res.status(400).json({ error: 'WhatsApp client is not ready.' });
        }
    }

    if (!req.files || !req.files['csvFile'] || !template) {
        return res.status(400).json({ error: 'Missing CSV file or message template.' });
    }

    const minDelay = parseInt(minDelayRaw) || 3000;
    const maxDelay = parseInt(maxDelayRaw) || 5000;
    let selectedIndices = null;
    if (selectedIndicesRaw) {
        try {
            selectedIndices = JSON.parse(selectedIndicesRaw);
        } catch (e) {
            console.error('Error parsing selectedIndices:', e);
        }
    }

    let rowAttachments = null;
    if (rowAttachmentsRaw) {
        try {
            rowAttachments = JSON.parse(rowAttachmentsRaw);
        } catch (e) {
            console.error('Error parsing rowAttachments:', e);
        }
    }

    const csvFilePath = req.files['csvFile'][0].path;
    let attachments = [];
    if (req.files['attachments'] && req.files['attachments'].length > 0) {
        attachments = req.files['attachments'].map(f => ({
            path: f.path,
            name: f.originalname,
            mimetype: f.mimetype
        }));
    }

    let transporter = null;
    if (mode === 'email' || mode === 'both') {
        if (!emailUser || !emailPass || !emailSubject) {
            return res.status(400).json({ error: 'Missing Gmail credentials or Subject.' });
        }
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailUser,
                pass: emailPass
            }
        });
    }

    const results = [];
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            fs.unlinkSync(csvFilePath); // Cleanup CSV

            // Filter rows if selectedIndices is provided
            const finalResults = results.map((row, index) => ({ row, index }));
            const broadcastTargets = finalResults.filter(({ index }) => !selectedIndices || selectedIndices.includes(index));

            res.json({ message: 'Broadcast started', total: broadcastTargets.length });
            io.emit('log', { type: 'info', msg: `Starting broadcast to ${broadcastTargets.length} selected contacts (Mode: ${mode.toUpperCase()})...` });
            if (attachments.length > 0) {
                const names = attachments.map(a => a.name).join(', ');
                io.emit('log', { type: 'info', msg: `Attachments included (${attachments.length}): ${names}` });
            }

            broadcastState.isPaused = false;
            broadcastState.isStopped = false;
            broadcastState.active = true;
            io.emit('broadcast_state', broadcastState);

            let successCount = 0;
            let failCount = 0;
            let failedContacts = [];

            for (let i = 0; i < broadcastTargets.length; i++) {
                // Check if user abort was requested
                if (broadcastState.isStopped) {
                    io.emit('log', { type: 'error', msg: 'Broadcast aborted by user.' });
                    break;
                }

                // Check if user paused the execution
                while (broadcastState.isPaused && !broadcastState.isStopped) {
                    await new Promise(r => setTimeout(r, 500));
                }

                if (broadcastState.isStopped) {
                    io.emit('log', { type: 'error', msg: 'Broadcast aborted by user.' });
                    break;
                }

                const { row, index } = broadcastTargets[i];
                const keys = Object.keys(row);
                
                // Determine selected attachments for this recipient
                let recipientAttachments = attachments;
                if (rowAttachments && rowAttachments[index] !== undefined) {
                    const allowedIndices = rowAttachments[index];
                    recipientAttachments = attachments.filter((_, idx) => allowedIndices.includes(idx));
                }

                // Intelligently find columns
                const phoneKey = keys.find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('search'));
                const phone = phoneKey ? row[phoneKey] : null;

                const nameKey = keys.find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('user') || k.toLowerCase().includes('first'));
                const user = nameKey ? row[nameKey] : 'User';

                const emailKey = keys.find(k => k.toLowerCase().includes('email') || k.toLowerCase().includes('mail'));
                const emailAddress = emailKey ? row[emailKey] : null;

                // Expand template variables manually
                let message = template;
                keys.forEach(key => {
                    const regex = new RegExp(`\\$${key}\\b`, 'g');
                    message = message.replace(regex, row[key]);
                });

                // Translate WhatsApp markdown formatting to HTML for emails
                let htmlMessage = message
                    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
                    .replace(/_([^_]+)_/g, '<em>$1</em>')
                    .replace(/~([^~]+)~/g, '<del>$1</del>')
                    .replace(/```([^`]+)```/g, '<code>$1</code>')
                    .replace(/\n/g, '<br>');

                let rowSuccess = false;

                // 1. Send WhatsApp
                if (mode === 'whatsapp' || mode === 'both') {
                    if (!phone || phone.length < 5) {
                        io.emit('log', { type: 'warning', msg: `WA Skipped [${user}]: Invalid phone number.` });
                        if (!failedContacts.includes(user)) failedContacts.push(user);
                    } else {
                        let formattedPhone = phone.replace(/\D/g, '');
                        if (formattedPhone.length === 10) formattedPhone = '91' + formattedPhone;
                        const chatId = formattedPhone + '@c.us';

                        try {
                            const isRegistered = await client.isRegisteredUser(chatId);
                            if (isRegistered) {
                                if (recipientAttachments.length > 0) {
                                    // Send the first attachment with the message template as caption
                                    const first = recipientAttachments[0];
                                    const firstB64 = fs.readFileSync(first.path, {encoding: 'base64'});
                                    const firstMedia = new MessageMedia(first.mimetype, firstB64, first.name);
                                    await client.sendMessage(chatId, firstMedia, { caption: message });
                                    
                                    // Send subsequent attachments without captions
                                    for (let j = 1; j < recipientAttachments.length; j++) {
                                        const extra = recipientAttachments[j];
                                        const extraB64 = fs.readFileSync(extra.path, {encoding: 'base64'});
                                        const extraMedia = new MessageMedia(extra.mimetype, extraB64, extra.name);
                                        await client.sendMessage(chatId, extraMedia);
                                    }
                                } else {
                                    await client.sendMessage(chatId, message);
                                }
                                
                                io.emit('log', { type: 'success', msg: `WA sent to ${user} (${maskPhone(formattedPhone)})` });
                                rowSuccess = true;
                            } else {
                                io.emit('log', { type: 'warning', msg: `WA Skipped [${user}]: Not on WhatsApp.` });
                                if (!failedContacts.includes(user)) failedContacts.push(user);
                            }
                        } catch (err) {
                            io.emit('log', { type: 'error', msg: `WA Error for [${user}]: ${err.message}` });
                            if (!failedContacts.includes(user)) failedContacts.push(user);
                        }
                    }
                }

                // 2. Send Email
                if (mode === 'email' || mode === 'both') {
                    if (!emailAddress || !emailAddress.includes('@')) {
                        io.emit('log', { type: 'warning', msg: `Email Skipped [${user}]: Invalid email address.` });
                        if (!failedContacts.includes(user)) failedContacts.push(user);
                    } else {
                        try {
                            const mailOptions = {
                                from: emailUser,
                                to: emailAddress,
                                subject: emailSubject,
                                text: message,
                                html: htmlMessage,
                                attachments: recipientAttachments.map(att => ({ path: att.path, filename: att.name }))
                            };
                            await transporter.sendMail(mailOptions);
                            io.emit('log', { type: 'success', msg: `Email sent to [${user}] (${maskEmail(emailAddress)})` });
                            rowSuccess = true;
                        } catch (err) {
                            io.emit('log', { type: 'error', msg: `Email Error for [${user}]: ${err.message}` });
                            if (!failedContacts.includes(user)) failedContacts.push(user);
                        }
                    }
                }

                if (rowSuccess) successCount++;
                else failCount++;

                // Emit progress
                io.emit('progress', { current: i + 1, total: broadcastTargets.length });

                // Delay between messages (user configured range)
                if (i < broadcastTargets.length - 1) {
                    const delayRange = maxDelay > minDelay ? (maxDelay - minDelay) : 0;
                    const delay = Math.floor(Math.random() * delayRange) + minDelay;
                    await new Promise(r => setTimeout(r, delay));
                }
            }

            io.emit('log', { type: 'info', msg: `Broadcast finished. Success: ${successCount}, Failed: ${failCount}` });
            if (failedContacts.length > 0) {
                io.emit('log', { type: 'warning', msg: `Failed Contacts: ${failedContacts.join(', ')}` });
            }
            
            // Cleanup attachments
            attachments.forEach(att => {
                if (fs.existsSync(att.path)) {
                    fs.unlinkSync(att.path);
                }
            });

            broadcastState.active = false;
            io.emit('broadcast_state', broadcastState);
        });
});

const PORT = process.env.PORT || 3000;
// Bind explicitly to localhost (127.0.0.1) for maximum security
server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

const express = require('express');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();

// === Owner email config ===
const ownerEmail = 'yochanbr@gmail.com'; // <-- Change to your email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'yochanbr@gmail.com',
    pass: 'your_app_password' // Use App Password from Gmail
  }
});

// === Send email function ===
function sendEmail(subject, text) {
  transporter.sendMail({
    from: '"Face Attendance" <yochanbr@gmail.com>',
    to: ownerEmail,
    subject,
    text
  }, (err, info) => {
    if (err) console.error("❌ Email Error:", err);
    else console.log("📧 Email sent:", info.response);
  });
}

const PORT = 3000;
const DATA_FILE = './database.json';

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Register employee
app.post('/register', (req, res) => {
  const newEmp = req.body;
  
  // Validate required fields
  if (!newEmp.name || !newEmp.position || !newEmp.startTime || !newEmp.endTime || !Array.isArray(newEmp.workingDays)) {
    return res.json({ success: false, error: "Missing fields" });
  }
  
  const data = readData();
  if (!data.employees.find(e => e.id === newEmp.id)) {
    data.employees.push(newEmp);
    saveData(data);
    return res.json({ success: true });
  }
  res.json({ success: false });
});

// Get employees
app.get('/employees', (req, res) => {
  const data = readData();
  res.json(data.employees);
});

// Get overtime approvals
app.get("/approvals", (req, res) => {
  const db = readData();
  const approvals = db.logs
    .filter(l => l.overtime && !l.overtime.approved && l.status === "overtime_pending")
    .map(l => {
      const emp = db.employees.find(e => e.id === l.empId);
      return {
        id: emp.id,
        name: emp.name,
        time: new Date(l.overtime.start).toLocaleTimeString()
      };
    });
  res.json(approvals);
});

// Approve or reject
app.post("/approve-overtime", (req, res) => {
  const { empId, decision } = req.body;
  const db = readData();
  const log = db.logs.find(
    l => l.empId === empId && l.overtime && l.status === "overtime_pending"
  );

  if (log) {
    log.overtime.approved = decision;
    log.status = decision ? "working" : "completed";
    saveData(db);
  }

  res.json({ success: true });
});

// Get live summary
app.get('/live-summary', (req, res) => {
  const db = readData();
  const today = new Date().toISOString().split("T")[0];

  const logsToday = db.logs.filter(l =>
    new Date(l.date).toISOString().startsWith(today)
  );

  const summary = {
    present: logsToday.length,
    working: logsToday.filter(l => l.status === 'working' || l.status === 'overtime_pending').length,
    onBreak: logsToday.filter(l => l.status === 'break').length,
    late: logsToday.filter(l => {
      const emp = db.employees.find(e => e.id === l.empId);
      return emp && l.checkIn && l.checkIn > emp.workStart;
    }).length
  };

  res.json(summary);
});

// Start HTTP server
const server = http.createServer(app);

// WebSocket Server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  if (req.url === "/admin") {
    adminSockets.push(ws);
    ws.on('close', () => {
      adminSockets = adminSockets.filter(s => s !== ws);
    });
  }

  // regular scan handler here
  ws.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.type === 'scan') {
      handleScan(ws, data.empId, data.timestamp);
    }
  });
});

// === Handle Employee Scan ===
function handleScan(ws, empId, timestamp) {
  const db = readData();
  const emp = db.employees.find(e => e.id === empId);

  if (!emp) {
    return ws.send(JSON.stringify({
      type: 'scan-status',
      success: false,
      message: "❌ Employee not found."
    }));
  }

  const timeNow = new Date(timestamp);
  const log = db.logs.find(l => l.empId === empId && isSameDay(new Date(l.date), timeNow));

  if (!log) {
    // First scan of day → Check-in
    db.logs.push({
      empId,
      date: timestamp,
      checkIn: timestamp,
      breakSessions: [],
      status: "working",
      overtime: null,
      checkout: null
    });
    saveData(db);
    broadcastToAdmins({
      type: 'live-summary-update',
      summary: calculateLiveSummary()
    });
    return ws.send(successMessage("✅ Checked in"));
  }

  // Handle existing day
  const lastBreak = log.breakSessions[log.breakSessions.length - 1];

  if (!log.checkout) {
    // Alternating break start/end
    if (!lastBreak || lastBreak.end) {
      // Start new break
      log.breakSessions.push({ start: timestamp });
      log.status = "on_break";
      saveData(db);
      broadcastToAdmins({
        type: 'live-summary-update',
        summary: calculateLiveSummary()
      });
      return ws.send(successMessage("☕ Break started"));
    } else {
      // End break
      lastBreak.end = timestamp;
      log.status = "working";
      const breakDuration = getMinutesDiff(lastBreak.start, lastBreak.end);
      if (breakDuration > emp.breakLimit) {
        log.breakSessions[log.breakSessions.length - 1].warning = true;

        // Send email to owner for break exceed approval
        sendEmail(
          `⚠️ ${emp.name} exceeded break time`,
          `${emp.name} (${emp.id}) took a break of ${breakDuration} mins (limit: ${emp.breakLimit}).\n\nPlease review and take action.`
        );
      }
      saveData(db);
      broadcastToAdmins({
        type: 'live-summary-update',
        summary: calculateLiveSummary()
      });
      return ws.send(successMessage("🔁 Break ended"));
    }
  }

  // Work hours done → check if over time
  if (!log.overtime) {
    log.overtime = { start: timestamp, approved: false };
    log.status = "overtime_pending";
    saveData(db);

    sendEmail(
      `🕒 ${emp.name} started overtime`,
      `${emp.name} (${emp.id}) started overtime on ${new Date(timestamp).toLocaleString()}. Please approve if valid.`
    );

    broadcastToAdmins({
      type: 'live-summary-update',
      summary: calculateLiveSummary()
    });

    return ws.send(successMessage("⏱ Overtime started (waiting approval)"));
  } else {
    // Already did OT, mark end
    log.overtime.end = timestamp;
    log.status = "completed";
    saveData(db);
    broadcastToAdmins({
      type: 'live-summary-update',
      summary: calculateLiveSummary()
    });
    return ws.send(successMessage("🏁 Day completed"));
  }
}

function successMessage(msg) {
  return JSON.stringify({ type: "scan-status", success: true, message: msg });
}

function getMinutesDiff(start, end) {
  return Math.floor((new Date(end) - new Date(start)) / 60000);
}

function isSameDay(date1, date2) {
  return date1.toDateString() === date2.toDateString();
}

// Read/write JSON
function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ employees: [], logs: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Calculate live summary
function calculateLiveSummary() {
  const db = readData();
  const today = new Date().toISOString().split("T")[0];

  const logsToday = db.logs.filter(l =>
    new Date(l.date).toISOString().startsWith(today)
  );

  return {
    present: logsToday.length,
    working: logsToday.filter(l => l.status === 'working' || l.status === 'overtime_pending').length,
    onBreak: logsToday.filter(l => l.status === 'on_break').length,
    late: logsToday.filter(l => {
      const emp = db.employees.find(e => e.id === l.empId);
      return emp && l.checkIn && l.checkIn > emp.workStart;
    }).length
  };
}

// Track connected WebSocket clients
let adminSockets = [];

function broadcastToAdmins(data) {
  adminSockets.forEach((ws) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  });
}

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

const password = "admin123"; // You can change this or move to server-side validation
let employeeData = []; // Will be replaced by real-time server sync

// === WebSocket connection for live updates ===
const socket = new WebSocket(`ws://${location.host}/admin`);

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'live-summary-update') {
    updateLiveSummaryFromData(data.summary);
  }
};

function updateLiveSummaryFromData(summary) {
  document.getElementById('presentCount').innerText = summary.present;
  document.getElementById('workingCount').innerText = summary.working;
  document.getElementById('breakCount').innerText = summary.onBreak;
  document.getElementById('lateCount').innerText = summary.late;
}

// === Admin Login Verification ===
function verifyPassword() {
  const input = document.getElementById("adminPass").value;
  if (input === password) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("adminPanel").style.display = "flex";
    loadEmployeeList(); // Show existing employees
    loadOvertimeApprovals(); // Load overtime approvals
  } else {
    document.getElementById("loginStatus").innerText = "Incorrect password.";
  }
}

// === Register New Employee ===
function registerEmployee() {
  const name = document.getElementById("empName").value.trim();
  if (!name) return alert("Enter employee name");

  const empID = "EMP" + String(Date.now()).slice(-5); // Unique ID
  const newEmp = {
    id: empID,
    name,
    checkins: [],
    workHours: 8,
    breakLimit: 60,
    leaves: [],
    weeklyOff: []
  };

  // Send to server
  fetch("/register", {
    method: "POST",
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(newEmp)
  }).then(res => res.json())
    .then(data => {
      if (data.success) {
        employeeData.push(newEmp);
        renderEmployeeList();
        document.getElementById("empName").value = "";
        alert("✅ Registered: " + name + " (ID: " + empID + ")");
      }
    });
}

// === Load and Display Employees ===
function loadEmployeeList() {
  fetch("/employees")
    .then(res => res.json())
    .then(data => {
      employeeData = data;
      renderEmployeeList();
    });
}

function renderEmployeeList() {
  const list = document.getElementById("employeeList");
  list.innerHTML = "";
  employeeData.forEach(emp => {
    const li = document.createElement("li");
    li.innerHTML = `<b>${emp.name}</b> (${emp.id})`;
    list.appendChild(li);
  });
}

// === Load Overtime Approvals ===
function loadOvertimeApprovals() {
  fetch("/approvals")
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("approvalList");
      list.innerHTML = "";
      data.forEach(item => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span><b>${item.name}</b> (${item.id}) - ${item.time}</span>
          <div>
            <button onclick="respondOT('${item.id}', true)">✅ Accept</button>
            <button onclick="respondOT('${item.id}', false)">❌ Reject</button>
          </div>`;
        list.appendChild(li);
      });
    });
}

function respondOT(empId, decision) {
  fetch("/approve-overtime", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empId, decision })
  })
    .then(res => res.json())
    .then(() => {
      loadOvertimeApprovals();
      alert("Updated");
    });
}

// === Live Dashboard Update ===
function updateLiveDashboard() {
  fetch('/live-summary')
    .then(res => res.json())
    .then(data => {
      document.getElementById('presentCount').innerText = data.present;
      document.getElementById('workingCount').innerText = data.working;
      document.getElementById('breakCount').innerText = data.onBreak;
      document.getElementById('lateCount').innerText = data.late;
    });
}

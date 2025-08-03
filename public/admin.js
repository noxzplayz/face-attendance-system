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
  const position = document.getElementById("empPosition").value.trim();
  const workHours = parseInt(document.getElementById("workHours").value);
  const startTime = document.getElementById("startTime").value;
  const endTime = document.getElementById("endTime").value;
  const workingDays = Array.from(document.querySelectorAll(".workDay:checked")).map(cb => cb.value);

  if (!name || !position || !workHours || !startTime || !endTime || workingDays.length === 0) {
    return alert("Please fill in all fields and select working days.");
  }

  const empID = "EMP" + String(Date.now()).slice(-5);

  const newEmp = {
    id: empID,
    name,
    position,
    workHours,
    startTime,
    endTime,
    workingDays,
    checkins: [],
    breakLimit: 60,
    leaves: [],
  };

  fetch("/register", {
    method: "POST",
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(newEmp)
  }).then(res => res.json())
    .then(data => {
      if (data.success) {
        alert(`✅ Registered: ${name} (${empID})`);
        loadEmployeeList();
      } else {
        alert("❌ Failed to register");
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

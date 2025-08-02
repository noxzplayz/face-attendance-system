// Connect to the WebSocket server
const socket = new WebSocket(`ws://${location.hostname}:3000`);

socket.onopen = () => {
  console.log("✅ Connected to server");
};

socket.onerror = () => {
  document.getElementById("status").innerText = "❌ Server not reachable";
};

socket.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.type === "scan-status") {
    document.getElementById("status").innerText = data.message;
    document.getElementById("status").style.color = data.success ? "#0f0" : "tomato";
  }
};

// Simulated Scan (we're not using actual face here)
function sendScan() {
  const empId = document.getElementById("empId").value.trim();
  if (!empId) return alert("Enter Employee ID");

  const scanPayload = {
    type: "scan",
    empId,
    timestamp: new Date().toISOString()
  };

  socket.send(JSON.stringify(scanPayload));
}

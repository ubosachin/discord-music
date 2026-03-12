const logs = [];
const MAX_LOGS = 50;

function addLog(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    logs.unshift({ timestamp, type, message });
    if (logs.length > MAX_LOGS) logs.pop();
}

module.exports = { addLog, logs };

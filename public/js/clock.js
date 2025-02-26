function clockIn() { sendClockData("clock_in"); }
function clockOut() { sendClockData("clock_out"); }
function startOvertime() { sendClockData("overtime_start"); }
function endOvertime() { sendClockData("overtime_end"); }

async function sendClockData(action) {
console.log("🚀 `sendClockData()` 被呼叫，收到 action:", action);

if (!action) {
console.error("❌ `action` 是 undefined！請檢查函數參數");
return;
}

// 先檢查是否已經打過該類型的卡
const isDuplicate = await checkDuplicateClock(action);
if (isDuplicate) {
const result = await Swal.fire({
    title: "⚠️ 重複打卡",
    text: `您已經打過 ${formatActionText(action)}，確定要再次打卡嗎？`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "確定",
    cancelButtonText: "取消"
});

if (!result.isConfirmed) {
    console.log("🚫 使用者取消了重複打卡");
    return;
}
}

// 送出打卡請求
const response = await fetch("/clock", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ action })
});

const result = await response.json();
console.log("🎯 伺服器回應:", result);

if (result.success) {
updateClockTimes();
}

Swal.fire({
title: result.success ? "✅ 成功" : "❌ 失敗",
text: result.message,
icon: result.success ? "success" : "error",
confirmButtonText: "確定"
});
}


// 🚀 從後端獲取員工的打卡記錄並顯示
async function updateClockTimes() {
console.log("🔄 正在更新打卡時間...");

const response = await fetch("/clock-records");
const data = await response.json();

console.log("📝 從伺服器獲取的打卡記錄:", data);

if (data.success) {
document.getElementById("clockInTime").innerText = formatTaipeiTime(data.clock_in);
document.getElementById("clockOutTime").innerText = formatTaipeiTime(data.clock_out);
document.getElementById("startOvertimeTime").innerText = formatTaipeiTime(data.overtime_start);
document.getElementById("endOvertimeTime").innerText = formatTaipeiTime(data.overtime_end);
}
}


// ✅ 將 UTC 時間轉換為台北時間
function formatTaipeiTime(utcTime) {
    if (!utcTime) return "尚未打卡";

    const date = new Date(utcTime);
    return date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

// 🚀 頁面載入時，先更新打卡時間
updateClockTimes();


async function checkDuplicateClock(action) {
const response = await fetch("/clock-records");
const data = await response.json();

if (!data.success) {
console.error("❌ 無法獲取打卡記錄:", data.message);
return false;
}

// 檢查該 action 是否已經打過
if (action === "clock_in" && data.clock_in) return true;
if (action === "clock_out" && data.clock_out) return true;
if (action === "overtime_start" && data.overtime_start) return true;
if (action === "overtime_end" && data.overtime_end) return true;

return false;
}

function formatActionText(action) {
const actionMap = {
"clock_in": "上班打卡",
"clock_out": "下班打卡",
"overtime_start": "加班開始",
"overtime_end": "加班結束"
};
return actionMap[action] || "未知動作";
}
const fs = require("fs");

// ===================== Helper Functions =====================

// Parse "hh:mm:ss am/pm" → seconds (0–86400+ with wrap)
function toSeconds12(timeStr) {
    let [time, period] = timeStr.trim().toLowerCase().split(/\s+/);
    let [h, m, s] = time.split(":").map(Number);

    if (period === "pm" && h !== 12) h += 12;
    if (period === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

// Parse "h:mm:ss" → seconds
function hmsToSeconds(str) {
    const [h, m, s] = str.split(":").map(Number);
    return (h * 3600) + (m * 60) + s;
}

// Seconds → "h:mm:ss"
function secondsToHMS(totalSec) {
    if (totalSec < 0) totalSec = 0;
    const h = Math.floor(totalSec / 3600);
    totalSec %= 3600;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// Safe split lines for CRLF/LF files
function readLines(path) {
    return fs.readFileSync(path, "utf8").replace(/\r/g, "").trim().split("\n");
}

// Detect header by first token
function isHeaderLine(parts) {
    return (parts[0].trim().toLowerCase() === "driverid");
}

// Parse date "YYYY-MM-DD" → Date(y, m-1, d) (local, no TZ shift)
function parseDateYMD(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
}

// Day name to JS getDay index
const DAY_INDEX = {
    "sunday": 0,
    "monday": 1,
    "tuesday": 2,
    "wednesday": 3,
    "thursday": 4,
    "friday": 5,
    "saturday": 6
};

// Eid date range
const EID_START = new Date(2025, 3, 10); // Apr=3 (0-based)
const EID_END   = new Date(2025, 3, 30);

function isEid(dateObj) {
    return (dateObj >= EID_START && dateObj <= EID_END);
}

// Quotas (in seconds)
const NORMAL_QUOTA_SEC = (8 * 3600) + (24 * 60); // 8h 24m
const EID_QUOTA_SEC = 6 * 3600;

// ===================== Function 1 =====================
function getShiftDuration(startTime, endTime) {
    let start = toSeconds12(startTime);
    let end = toSeconds12(endTime);
    if (end < start) end += 24 * 3600; // overnight
    return secondsToHMS(end - start);
}

// ===================== Function 2 =====================
// Idle time = time outside [08:00, 22:00] inclusive
function getIdleTime(startTime, endTime) {
    let start = toSeconds12(startTime);
    let end = toSeconds12(endTime);
    if (end < start) end += 24 * 3600;

    const DAY = 24 * 3600;
    let totalIdle = 0;
    let cur = start;

    while (cur < end) {
        const curDayStart = Math.floor(cur / DAY) * DAY;
        const segEnd = Math.min(end, curDayStart + DAY);

        const windowStart = curDayStart + (8 * 3600);   // 08:00
        const windowEnd   = curDayStart + (22 * 3600);  // 22:00

        const overlapStart = Math.max(cur, windowStart);
        const overlapEnd   = Math.min(segEnd, windowEnd);

        const active = Math.max(0, overlapEnd - overlapStart);
        const segment = segEnd - cur;
        totalIdle += (segment - active);

        cur = segEnd;
    }
    return secondsToHMS(totalIdle);
}

// ===================== Function 3 =====================
function getActiveTime(shiftDuration, idleTime) {
    const shift = hmsToSeconds(shiftDuration);
    const idle = hmsToSeconds(idleTime);
    return secondsToHMS(shift - idle);
}

// ===================== Function 4 =====================
function metQuota(date, activeTime) {
    const active = hmsToSeconds(activeTime);
    const d = parseDateYMD(date);
    const quota = isEid(d) ? EID_QUOTA_SEC : NORMAL_QUOTA_SEC;
    return active >= quota;
}

// ===================== Function 5 =====================
// addShiftRecord(textFile, shiftObj)
// - Prevent duplicates (same driverID + date) → return {}
// - Insert after last record of same driverID (or append if absent)
// - Compute shiftDuration, idleTime, activeTime, metQuota
// - hasBonus defaults to false
function addShiftRecord(textFile, shiftObj) {
    if (!fs.existsSync(textFile)) return {};

    let lines = readLines(textFile);
    if (lines.length === 0) return {};

    // Parse header (expected)
    const header = lines[0];
    const body = lines.slice(1);

    // Build records (array of arrays)
    let rows = body.map(l => l.split(","));

    // Duplicate check
    for (let i = 0; i < rows.length; i++) {
        const parts = rows[i];
        if (parts.length < 10) continue;
        if (parts[0] === shiftObj.driverID && parts[2] === shiftObj.date) {
            return {}; // duplicate found → do not modify file
        }
    }

    // Compute fields
    const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const met = metQuota(shiftObj.date, activeTime);

    // New row (10 props in correct order)
    const newRow = [
        shiftObj.driverID,
        shiftObj.driverName,
        shiftObj.date,
        shiftObj.startTime,
        shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        String(met),
        "false" // hasBonus defaults to false
    ];

    // Find last index of this driver to insert after
    let lastIdx = -1;
    for (let i = 0; i < rows.length; i++) {
        const parts = rows[i];
        if (parts.length < 10) continue;
        if (parts[0] === shiftObj.driverID) lastIdx = i;
    }

    if (lastIdx === -1) {
        rows.push(newRow);
    } else {
        rows.splice(lastIdx + 1, 0, newRow);
    }

    // Write back: header + rows
    const outLines = [header, ...rows.map(r => r.join(","))].join("\n");
    fs.writeFileSync(textFile, outLines, "utf8");

    // Return object
    return {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: met,
        hasBonus: false
    };
}

// ===================== Function 6 =====================
// setBonus(textFile, driverID, date, newValue)
// Updates exactly the row matching driverID + date
function setBonus(textFile, driverID, date, newValue) {
    if (!fs.existsSync(textFile)) return;

    const lines = readLines(textFile);
    if (lines.length === 0) return;

    const header = lines[0];
    let body = lines.slice(1);
    let updatedBody = [];

    for (let i = 0; i < body.length; i++) {
        let parts = body[i].split(",");
        if (parts.length < 10) {
            updatedBody.push(body[i]);
            continue;
        }

        if (parts[0] === driverID && parts[2] === date) {
            parts[9] = String(!!newValue);
        }
        updatedBody.push(parts.join(","));
    }

    fs.writeFileSync(textFile, [header, ...updatedBody].join("\n"), "utf8");
}

// ===================== Function 7 =====================
// countBonusPerMonth(textFile, driverID, month) → number or -1
function countBonusPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return -1;
    const lines = readLines(textFile);
    if (lines.length === 0) return -1;

    const body = lines.slice(1);
    const monthStr = String(month).padStart(2, "0");

    let count = 0;
    let foundDriver = false;

    for (const line of body) {
        const parts = line.split(",");
        if (parts.length < 10) continue;
        const id = parts[0];
        const date = parts[2];
        const bonusStr = parts[9].trim().toLowerCase();

        if (id === driverID) {
            foundDriver = true;
            const m = date.split("-")[1];
            if (m === monthStr && bonusStr === "true") count++;
        }
    }
    return foundDriver ? count : -1;
}

// ===================== Function 8 =====================
// getTotalActiveHoursPerMonth(textFile, driverID, month:number) → "hhh:mm:ss"
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return "000:00:00";
    const lines = readLines(textFile);
    if (lines.length === 0) return "000:00:00";

    const body = lines.slice(1);
    let total = 0;

    for (const line of body) {
        const parts = line.split(",");
        if (parts.length < 10) continue;
        const id = parts[0];
        const date = parts[2];
        const active = parts[7];

        const m = Number(date.split("-")[1]);
        if (id === driverID && m === Number(month)) {
            total += hmsToSeconds(active);
        }
    }

    return secondsToHMS(total);
}

// ===================== Function 9 =====================
// getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) → "hhh:mm:ss"
// Rules:
// - Sum daily required quota for each shift row of that driver in that month
//   - Exclude rows on the driver's day off
//   - Eid (Apr 10–30, 2025): 6:00:00; otherwise 8:24:00
// - Then subtract (bonusCount * 2:00:00)
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    if (!fs.existsSync(textFile) || !fs.existsSync(rateFile)) return "000:00:00";

    // Read driver dayOff from rateFile
    const rateLines = readLines(rateFile);
    let dayOffName = null;

    for (const line of rateLines) {
        const parts = line.split(",");
        if (parts.length < 4) continue;
        if (isHeaderLine(parts)) continue;
        const [id, dayOff/*, basePay, tier*/] = parts;
        if (id === driverID) {
            dayOffName = dayOff.trim();
            break;
        }
    }
    if (!dayOffName) return "000:00:00";

    const dayOffIndex = DAY_INDEX[dayOffName.toLowerCase()];
    const monthNum = Number(month);

    const lines = readLines(textFile);
    const body = lines.slice(1);

    let totalRequiredSec = 0;

    for (const line of body) {
        const parts = line.split(",");
        if (parts.length < 10) continue;

        const id = parts[0];
        const dateStr = parts[2];

        if (id !== driverID) continue;

        const [y, m, d] = dateStr.split("-").map(Number);
        if (m !== monthNum) continue;

        const dateObj = parseDateYMD(dateStr);
        const dow = dateObj.getDay();

        // Exclude day off
        if (dow === dayOffIndex) continue;

        // Add per-day required quota
        totalRequiredSec += isEid(dateObj) ? EID_QUOTA_SEC : NORMAL_QUOTA_SEC;
    }

    // Subtract bonusCount * 2 hours
    totalRequiredSec -= (Number(bonusCount) * 2 * 3600);
    if (totalRequiredSec < 0) totalRequiredSec = 0;

    return secondsToHMS(totalRequiredSec);
}

// ===================== Function 10 =====================
// getNetPay(driverID, actualHours "hhh:mm:ss", requiredHours "hhh:mm:ss", rateFile)
// - netPay = basePay - (billableMissingHours * floor(basePay/185))
// - Allowance per tier: 1→50h, 2→20h, 3→10h, 4→3h
// - Only full hours count
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    if (!fs.existsSync(rateFile)) return 0;

    const rateLines = readLines(rateFile);

    let basePay = null;
    let tier = null;

    for (const line of rateLines) {
        const parts = line.split(",");
        if (parts.length < 4) continue;
        if (isHeaderLine(parts)) continue;

        const [id, /*dayOff*/, base, tr] = parts;
        if (id === driverID) {
            basePay = Number(base);
            tier = Number(tr);
            break;
        }
    }

    if (basePay == null || tier == null) return 0;

    const allowanceByTier = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowance = allowanceByTier[tier] ?? 0;

    const actualSec = hmsToSeconds(actualHours);
    const requiredSec = hmsToSeconds(requiredHours);

    if (actualSec >= requiredSec) return basePay;

    // Missing hours, floor to full hours AFTER removing allowance
    const totalMissingHours = Math.floor((requiredSec - actualSec) / 3600);
    const billableMissing = Math.max(0, totalMissingHours - allowance);

    const deductionRate = Math.floor(basePay / 185);
    const salaryDeduction = billableMissing * deductionRate;

    const netPay = basePay - salaryDeduction;
    return netPay;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
``

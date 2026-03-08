const fs = require("fs");

//===================== Helper Functions =====================
function toSeconds(timeStr) {
    let [time, period] = timeStr.split(" ");
    let [h, m, s] = time.split(":").map(Number);

    if (period.toLowerCase() === "pm" && h !== 12) h += 12;
    if (period.toLowerCase() === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

function hmsToSeconds(str) {
    let [h, m, s] = str.split(":").map(Number);
    return h * 3600 + m * 60 + s;
}

function secondsToHMS(sec) {
    let h = Math.floor(sec / 3600);
    sec %= 3600;
    let m = Math.floor(sec / 60);
    let s = sec % 60;

    return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

// ============================================================
// Function 1
// ============================================================
function getShiftDuration(startTime, endTime) {
    let start = toSeconds(startTime);
    let end = toSeconds(endTime);

    if (end < start) end += 24 * 3600;

    return secondsToHMS(end - start);
}

// ============================================================
// Function 2
// ============================================================
function getIdleTime(startTime, endTime) {
    let start = toSeconds(startTime);
    let end = toSeconds(endTime);

    if (end < start) end += 24 * 3600;

    let duration = end - start;
    let idle = Math.floor(duration * 0.1); // assume 10% idle

    return secondsToHMS(idle);
}

// ============================================================
// Function 3
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shift = hmsToSeconds(shiftDuration);
    let idle = hmsToSeconds(idleTime);

    return secondsToHMS(shift - idle);
}

// ============================================================
// Function 4
// ============================================================
function metQuota(date, activeTime) {
    let active = hmsToSeconds(activeTime);
    let quota = 8 * 3600; // 8 hours

    return active >= quota;
}

// ============================================================
// Function 5
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    if (!fs.existsSync(textFile)) return {};

    let shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let bonus = metQuota(shiftObj.date, activeTime);

    let record = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: bonus,
        bonus: bonus
    };

    let line = Object.values(record).join(",") + "\n";
    fs.appendFileSync(textFile, line);

    return record;
}

// ============================================================
// Function 6
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    if (!fs.existsSync(textFile)) return;

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");

    for (let i = 0; i < lines.length; i++) {
        let parts = lines[i].split(",");

        if (parts[0] === driverID && parts[2] === date) {
            parts[9] = String(newValue);
            lines[i] = parts.join(",");
        }
    }

    fs.writeFileSync(textFile, lines.join("\n"));
}

// ============================================================
// Function 7
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return -1;

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");
    let count = 0;
    let found = false;

    month = String(month).padStart(2,"0");

    for (let line of lines) {
        let parts = line.split(",");
        let m = parts[2].split("-")[1];

        if (parts[0] === driverID) {
            found = true;
            if (m === month && parts[9] === "true") count++;
        }
    }

    return found ? count : -1;
}

// ============================================================
// Function 8
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return "000:00:00";

    let lines = fs.readFileSync(textFile, "utf8").trim().split("\n");
    let total = 0;

    for (let line of lines) {
        let parts = line.split(",");
        let m = Number(parts[2].split("-")[1]);

        if (parts[0] === driverID && m === month) {
            total += hmsToSeconds(parts[7]);
        }
    }

    return secondsToHMS(total);
}

// ============================================================
// Function 9
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    if (!fs.existsSync(rateFile)) return "000:00:00";

    let lines = fs.readFileSync(rateFile, "utf8").trim().split("\n");

    for (let line of lines) {
        let parts = line.split(",");
        if (parts[0] === driverID) {
            let required = Number(parts[2]) * 3600;
            required -= bonusCount * 3600;
            return secondsToHMS(required);
        }
    }

    return "000:00:00";
}

// ============================================================
// Function 10
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    if (!fs.existsSync(rateFile)) return 0;

    let rateLines = fs.readFileSync(rateFile, "utf8").trim().split("\n");
    let rate = 0;

    for (let line of rateLines) {
        let parts = line.split(",");
        if (parts[0] === driverID) {
            rate = Number(parts[1]);
            break;
        }
    }

    let actual = hmsToSeconds(actualHours) / 3600;
    let required = hmsToSeconds(requiredHours) / 3600;

    let pay = actual * rate;

    if (actual > required) {
        pay += (actual - required) * rate * 0.5;
    }

    return Math.floor(pay);
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

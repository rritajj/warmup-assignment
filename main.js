const fs = require("fs");

// For days use1
const DAY_SECONDS = 24 * 3600;
const DAYS = {
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3,
    "thursday": 4, "friday": 5, "saturday": 6
};

// For delivery1
const DELIVERY_CONFIG = {
    HOURS: {
        START: 8 * 3600,
        END: 22 * 3600
    },

    DAILY_MINIMUM: {
        NORMAL: 8 * 3600 + 24 * 60,
        EID: 6 * 3600
    },

    EID_DATE: {
        START: new Date("2025-04-10"),
        END: new Date("2025-04-30"),
    }
};

// For tier-based calculations
const ALLOWED_MISSING_HOURS = {
    1: 50,
    2: 20,
    3: 10,
    4: 3
};

// Helper Methods
function parseToSeconds(str) {
    str = str.trim().toLowerCase();

    const parts = str.split(" ");
    const time = parts[0];
    const modifier = parts[1];

    let [hours, minutes, seconds] = time.split(":").map(Number);

    if (modifier) {
        if (modifier === "pm" && hours !== 12)
            hours += 12;

        if (modifier === "am" && hours === 12)
            hours = 0;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

function formatToTime(seconds) {
    if (seconds < 0)
        seconds = 0;

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean);
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    let startSeconds = parseToSeconds(startTime);
    let endSeconds = parseToSeconds(endTime);

    if (endSeconds < startSeconds)
        endSeconds += DAY_SECONDS;

    return formatToTime(endSeconds - startSeconds);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    let startSeconds = parseToSeconds(startTime);
    let endSeconds = parseToSeconds(endTime);

    if (endSeconds < startSeconds)
        endSeconds += DAY_SECONDS;

    let [idleTime, currentTime] = [0, startSeconds];
    while (currentTime < endSeconds) {
        let currentDayStart = Math.floor(currentTime / DAY_SECONDS) * DAY_SECONDS;
        let currentDayEnd = currentDayStart + DAY_SECONDS;

        let segmentEnd = Math.min(endSeconds, currentDayEnd);

        let deliveryStart = currentDayStart + DELIVERY_CONFIG.HOURS.START;
        let deliveryEnd = currentDayStart + DELIVERY_CONFIG.HOURS.END;

        if (currentTime < deliveryStart)
            idleTime += Math.max(0, Math.min(segmentEnd, deliveryStart) - currentTime);

        if (segmentEnd > deliveryEnd)
            idleTime += Math.max(0, segmentEnd - Math.max(currentTime, deliveryEnd));

        currentTime = segmentEnd;
    }

    return formatToTime(idleTime)
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    return formatToTime(parseToSeconds(shiftDuration) - parseToSeconds(idleTime));
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
    const currentDate = new Date(date);

    const isEid = currentDate >= DELIVERY_CONFIG.EID_DATE.START
        && currentDate <= DELIVERY_CONFIG.EID_DATE.END;

    return parseToSeconds(activeTime) >= (isEid ? DELIVERY_CONFIG.DAILY_MINIMUM.EID : DELIVERY_CONFIG.DAILY_MINIMUM.NORMAL);
}


// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    if (!fs.existsSync(textFile))
        fs.writeFileSync(textFile, "");

    const records = readLines(textFile).map(line => {
        const parts = line.split(",");
        return {
            driverID: parts[0],
            driverName: parts[1],
            date: parts[2],
            startTime: parts[3],
            endTime: parts[4],
            shiftDuration: parts[5],
            idleTime: parts[6],
            activeTime: parts[7],
            metQuota: Boolean(parts[8]),
            hasBonus: Boolean(parts[9])
        };
    });

    const duplicate = records.some(r =>
        r.driverID === shiftObj.driverID &&
        r.date === shiftObj.date
    );

    if (duplicate) return {};

    const shiftDuration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    const idleTime = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const metQuotaFlag = metQuota(shiftObj.date, activeTime);

    const newRecord = {
        driverID: shiftObj.driverID,
        driverName: shiftObj.driverName,
        date: shiftObj.date,
        startTime: shiftObj.startTime,
        endTime: shiftObj.endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: metQuotaFlag,
        hasBonus: false
    };

    // Find the index after the last record of the same driverID
    let insertIndex = -1;
    for (let i = 0; i < records.length; i++) {
        if (records[i].driverID === shiftObj.driverID)
            insertIndex = i;
    }

    if (insertIndex === -1)
        records.push(newRecord);
    else
        records.splice(insertIndex + 1, 0, newRecord);

    const fileContent = records.map(r =>
        `${r.driverID},${r.driverName},${r.date},${r.startTime},${r.endTime},${r.shiftDuration},${r.idleTime},${r.activeTime},${r.metQuota},${r.hasBonus}`
    ).join("\n");

    fs.writeFileSync(textFile, fileContent);

    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    if (!fs.existsSync(textFile)) return;

    const lines = readLines(textFile);

    let updated = false;

    const updatedLines = lines.map(line => {
        const parts = line.split(",");

        if (parts.length < 10) return line;

        const recordDriverID = parts[0];
        const recordDate = parts[2];

        if (recordDriverID === driverID && recordDate === date) {
            parts[9] = newValue.toString();
            updated = true;
        }

        return parts.join(",");
    });

    if (updated)
        fs.writeFileSync(textFile, updatedLines.join("\n"));
}


// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile)) return -1;

    const lines = readLines(textFile);

    let driverExists = false;
    let bonusCount = 0;

    const targetMonth = Number(month);

    for (const line of lines) {
        const parts = line.trim().split(",");

        if (parts.length < 10) continue;

        const recordDriverID = parts[0];
        const recordDate = parts[2];
        const hasBonus = parts[9] === "true";

        if (recordDriverID !== driverID) continue;

        driverExists = true;

        const recordMonth = new Date(recordDate).getMonth() + 1;

        if (recordMonth === targetMonth && hasBonus)
            bonusCount++;
    }

    return driverExists ? bonusCount : -1;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    if (!fs.existsSync(textFile))
        return formatToTime(0);

    const lines = readLines(textFile);

    let totalSeconds = 0;

    for (const line of lines) {
        const parts = line.split(",");

        if (parts.length < 10) continue;

        const recordDriverID = parts[0];
        const recordDate = parts[2];
        const activeTime = parts[7];

        if (recordDriverID !== driverID) continue;

        const recordMonth = new Date(recordDate).getMonth() + 1;

        if (recordMonth === month)
            totalSeconds += parseToSeconds(activeTime);
    }

    return formatToTime(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================

// Helpers
function getDayOff(rateFile, driverID) {
    let dayOffStr = "";
    const rateLines = readLines(rateFile);
    for (const line of rateLines) {
        const parts = line.split(",");
        if (parts[0] === driverID) {
            dayOffStr = parts[1].trim().toLowerCase();
            break;
        }
    }

    return dayOffStr;
}

function getUniqueDates(textFile, targetMonth, driverID) {
    const shiftLines = readLines(textFile);
    const uniqueDates = new Set();

    for (const line of shiftLines) {
        const parts = line.split(",");

        if (parts.length < 10) continue;

        const recordDriverID = parts[0];
        const recordDate = parts[2];

        if (recordDriverID !== driverID) continue;

        const dateObj = new Date(recordDate);
        if (dateObj.getUTCMonth() + 1 === targetMonth)
            uniqueDates.add(recordDate);
    }

    return uniqueDates;
}

function getTotalRequiredSeconds(uniqueDates, dayOffNum) {
    let totalRequiredSeconds = 0;

    for (const dateStr of uniqueDates) {
        const d = new Date(dateStr);

        if (d.getUTCDay() === dayOffNum) continue;

        const isEid = d >= DELIVERY_CONFIG.EID_DATE.START && d <= DELIVERY_CONFIG.EID_DATE.END;

        if (isEid) {
            totalRequiredSeconds += DELIVERY_CONFIG.DAILY_MINIMUM.EID;
            continue;
        }

        totalRequiredSeconds += DELIVERY_CONFIG.DAILY_MINIMUM.NORMAL;
    }

    return totalRequiredSeconds;
}

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    if (!fs.existsSync(textFile) || !fs.existsSync(rateFile)) return formatToTime(0);

    let dayOffStr = getDayOff(rateFile, driverID)

    const dayOffNum = DAYS[dayOffStr] !== undefined ? DAYS[dayOffStr] : -1

    const uniqueDates = getUniqueDates(textFile, Number(month), driverID)

    let totalRequiredSeconds = getTotalRequiredSeconds(uniqueDates, dayOffNum);

    let validBonus = Number(bonusCount);
    if (isNaN(validBonus)) validBonus = 0;

    totalRequiredSeconds -= (validBonus * 2 * 3600);

    if (totalRequiredSeconds < 0)
        totalRequiredSeconds = 0;

    return formatToTime(totalRequiredSeconds);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    if (!fs.existsSync(rateFile))
        return 0;

    const rateLines = readLines(rateFile);

    let basePay = 0;
    let tier = 0;

    for (const line of rateLines) {
        const parts = line.split(",");
        if (parts[0] !== driverID) continue;

        basePay = Number(parts[2]);
        tier = Number(parts[3]);
        break;
    }

    const actualSeconds = parseToSeconds(actualHours);
    const requiredSeconds = parseToSeconds(requiredHours);

    if (actualSeconds >= requiredSeconds) return basePay;

    const missingSeconds = requiredSeconds - actualSeconds;
    const missingHours = missingSeconds / 3600;

    const allowed = ALLOWED_MISSING_HOURS[tier] || 0;

    const billableMissingHours = Math.floor(Math.max(0, missingHours - allowed));

    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableMissingHours * deductionRatePerHour;

    return basePay - salaryDeduction;
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

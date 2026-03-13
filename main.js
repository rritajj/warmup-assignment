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


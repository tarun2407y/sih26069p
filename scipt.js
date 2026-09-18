// ===============================
// CLOCK
// ===============================

function updateTime() {

    const now = new Date();

    const time = now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    document.getElementById("currentTime").textContent = time;
}

setInterval(updateTime, 1000);

updateTime();


// ===============================
// ACCESS ROLES AND PERSISTED ALERTS
// ===============================

const rolePermissions = {
    citizen: ["dashboard", "reports", "map", "alerts"],
    reviewer: ["dashboard", "reports", "map", "verification", "alerts"],
    administrator: ["dashboard", "reports", "map", "verification", "alerts"]
};

const alertStorageKey = "weatherguard_acknowledged_alerts";
const notificationStorageKey = "weatherguard_notification_status";
const apiBaseUrl = window.WEATHERGUARD_API_URL || "http://localhost:5000";
let currentRole = localStorage.getItem("weatherguard_role") || "citizen";
let citizenAuthenticated = Boolean(localStorage.getItem("weatherguard_citizen_token"));
let administratorAuthenticated = Boolean(localStorage.getItem("weatherguard_administrator_token"));
let reviewerAuthenticated = Boolean(localStorage.getItem("weatherguard_reviewer_token"));
let pendingAccessRole = currentRole;

const roleSelect = document.getElementById("roleSelect");
const notificationButton = document.getElementById("notificationButton");
const adminGate = document.getElementById("adminGate");
const adminAccessForm = document.getElementById("adminAccessForm");
const adminAccessMessage = document.getElementById("adminAccessMessage");
const loginRoleSelect = document.getElementById("loginRoleSelect");
const staffLoginFields = document.getElementById("staffLoginFields");
const citizenLoginFields = document.getElementById("citizenLoginFields");
const adminName = document.getElementById("adminName");
const adminId = document.getElementById("adminId");
const adminPassword = document.getElementById("adminPassword");
const citizenNumber = document.getElementById("citizenNumber");

if ((currentRole === "citizen" && !citizenAuthenticated) ||
    (currentRole === "administrator" && !administratorAuthenticated) ||
    (currentRole === "reviewer" && !reviewerAuthenticated)) {
    currentRole = "citizen";
    localStorage.setItem("weatherguard_role", currentRole);
}

roleSelect.value = currentRole;
loginRoleSelect.value = currentRole;

function updateLoginFields(role) {
    const isCitizen = role === "citizen";
    staffLoginFields.hidden = isCitizen;
    citizenLoginFields.hidden = !isCitizen;
    adminName.required = !isCitizen;
    adminId.required = !isCitizen;
    adminPassword.required = !isCitizen;
    citizenNumber.required = isCitizen;

    document.getElementById("accessGateTitle").textContent =
        isCitizen ? "Citizen Sign In" : `${role.charAt(0).toUpperCase()}${role.slice(1)} Sign In`;
    document.getElementById("accessGateDescription").textContent = isCitizen ?
        "Enter your mobile number to access local weather reporting and alerts." :
        `Enter your ${role} details to continue to the operations center.`;
    adminAccessMessage.textContent = "";
}

function openLogin(role) {
    pendingAccessRole = role;
    loginRoleSelect.value = role;
    updateLoginFields(role);
    adminGate.hidden = false;
    window.setTimeout(() => (role === "citizen" ? citizenNumber : adminName).focus(), 0);
}

loginRoleSelect.addEventListener("change", function() {
    updateLoginFields(loginRoleSelect.value);
});

roleSelect.addEventListener("change", function() {

    const selectedRole = roleSelect.value;
    const needsAccess = (selectedRole === "citizen" && !citizenAuthenticated) ||
        (selectedRole === "administrator" && !administratorAuthenticated) ||
        (selectedRole === "reviewer" && !reviewerAuthenticated);

    if (needsAccess) {
        roleSelect.value = currentRole;
        openLogin(selectedRole);
        return;
    }

    currentRole = roleSelect.value;
    localStorage.setItem("weatherguard_role", currentRole);
    applyRolePermissions();
});

adminAccessForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    const role = loginRoleSelect.value;
    const name = adminName.value.trim();
    const id = adminId.value.trim();
    const password = adminPassword.value.trim();
    const phone = citizenNumber.value.trim();

    if (role === "citizen" && !citizenNumber.checkValidity()) {
        adminAccessMessage.textContent = "Enter a valid mobile number to continue.";
        citizenNumber.focus();
        return;
    }

    if (role !== "citizen" && (!name || !id || !password)) {
        adminAccessMessage.textContent = "Enter your name, ID, and password to continue.";
        return;
    }

    adminAccessMessage.textContent = "Signing in...";

    try {
        const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, name, id, password, phone })
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Unable to sign in.");
        }

        localStorage.setItem(`weatherguard_${role}_token`, result.token);
        if (role === "citizen") {
            citizenAuthenticated = true;
            localStorage.setItem("weatherguard_citizen_number", phone);
        } else if (role === "administrator") {
            administratorAuthenticated = true;
        } else {
            reviewerAuthenticated = true;
        }
    } catch (error) {
        adminAccessMessage.textContent = error.message === "Failed to fetch" ?
            "The WeatherGuard server is unavailable. Start the backend and try again." : error.message;
        return;
    }

    currentRole = role;
    if (role !== "citizen") {
        localStorage.setItem(`weatherguard_${role}_name`, name);
        localStorage.setItem(`weatherguard_${role}_id`, id);
    }
    localStorage.setItem("weatherguard_role", currentRole);
    roleSelect.value = currentRole;
    loginRoleSelect.value = currentRole;
    adminGate.hidden = true;
    adminAccessForm.reset();
    applyRolePermissions();
    showSection("dashboard");
});

notificationButton.addEventListener("click", enableNotifications);

function applyRolePermissions() {

    const allowedSections = rolePermissions[currentRole];
    const navButtons = document.querySelectorAll(".nav-item");

    navButtons.forEach(button => {
        const match = button.getAttribute("onclick").match(/showSection\('([^']+)'\)/);
        const allowed = match && allowedSections.includes(match[1]);
        button.hidden = !allowed;
    });

    document.querySelectorAll("[data-role]").forEach(element => {
        element.hidden = !element.dataset.role.split(" ").includes(currentRole);
    });

    if (!allowedSections.includes(document.querySelector(".active-section")?.id)) {
        showSection("dashboard");
    }

    document.getElementById("currentRoleLabel").textContent =
        `${currentRole.charAt(0).toUpperCase()}${currentRole.slice(1)}`;
    updateAlertAcknowledgement();
}

function getAcknowledgedAlerts() {
    return JSON.parse(localStorage.getItem(alertStorageKey) || "[]");
}

function saveAcknowledgedAlert(alertId) {
    const acknowledgedAlerts = getAcknowledgedAlerts();

    if (!acknowledgedAlerts.includes(alertId)) {
        acknowledgedAlerts.push(alertId);
        localStorage.setItem(alertStorageKey, JSON.stringify(acknowledgedAlerts));
    }
}

function updateAlertAcknowledgement() {

    const alertCard = document.querySelector(".alert-card");
    const alertButton = document.getElementById("acknowledgeAlertButton");
    const alertId = alertCard.dataset.alertId;
    const acknowledged = getAcknowledgedAlerts().includes(alertId);

    alertButton.hidden = currentRole === "citizen";
    alertButton.textContent = acknowledged ? "Acknowledged" : "Acknowledge";
    alertButton.disabled = acknowledged;
    document.getElementById("alertStatus").textContent = acknowledged ?
        "This alert was acknowledged and saved on this device." : "";
}

async function enableNotifications() {

    if (!("Notification" in window)) {
        notificationButton.textContent = "Not Supported";
        localStorage.setItem(notificationStorageKey, "unsupported");
        return;
    }

    const permission = await Notification.requestPermission();
    localStorage.setItem(notificationStorageKey, permission);
    updateNotificationButton(permission);
}

function updateNotificationButton(permission = localStorage.getItem(notificationStorageKey) || ("Notification" in window ? Notification.permission : "unsupported")) {
    notificationButton.textContent = permission === "granted" ? "Alerts Enabled" : "Enable Alerts";
    notificationButton.classList.toggle("enabled", permission === "granted");
}

applyRolePermissions();
updateAlertAcknowledgement();
updateNotificationButton();


// ===============================
// USER LOCATION AND LOCAL WEATHER
// ===============================

let currentLocation = null;
let locationWatchId = null;
let lastAlertedLocation = "";

const activeWeatherAlerts = [
    {
        city: "Hyderabad",
        latitude: 17.3850,
        longitude: 78.4867,
        radiusKm: 80,
        severity: "High",
        event: "Heavy rainfall",
        message: "Multiple reports indicate heavy rainfall near Hyderabad."
    }
];

const locationButton =
    document.getElementById("detectLocationButton");

locationButton.addEventListener("click", requestUserLocation);

function requestUserLocation() {

    const status = document.getElementById("locationStatus");

    if (!navigator.geolocation) {
        status.textContent = "Location access is not supported by this browser.";
        return;
    }

    status.textContent = "Requesting your location...";
    locationButton.disabled = true;

    navigator.geolocation.getCurrentPosition(
        handleLocation,
        function() {
            status.textContent = "Location was not shared. Approve access to continue.";
            locationButton.disabled = false;
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000
        }
    );
}

function handleLocation(position) {

    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const locationInput = document.getElementById("location");
    const status = document.getElementById("locationStatus");

    currentLocation = { latitude, longitude };
    locationInput.value = `Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
    status.textContent = "Your location is attached to this report.";
    locationButton.textContent = "Location Added";
    locationButton.classList.add("location-ready");

    loadLocalWeather(latitude, longitude);

    if (!locationWatchId) {
        locationWatchId = navigator.geolocation.watchPosition(
            handleLocation,
            function() {},
            {
                enableHighAccuracy: false,
                timeout: 15000,
                maximumAge: 120000
            }
        );
    }
}

function distanceInKilometers(latitude, longitude, targetLatitude, targetLongitude) {

    const earthRadius = 6371;
    const latitudeDifference = (targetLatitude - latitude) * Math.PI / 180;
    const longitudeDifference = (targetLongitude - longitude) * Math.PI / 180;
    const latitudeOne = latitude * Math.PI / 180;
    const latitudeTwo = targetLatitude * Math.PI / 180;
    const value = Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(latitudeOne) * Math.cos(latitudeTwo) *
        Math.sin(longitudeDifference / 2) ** 2;

    return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function checkNearbyWeatherAlerts(latitude, longitude, rainDetected) {

    const alertPanel = document.getElementById("locationRiskAlert");
    const nearbyAlert = activeWeatherAlerts.find(alert =>
        distanceInKilometers(latitude, longitude, alert.latitude, alert.longitude) <= alert.radiusKm
    );

    if (!nearbyAlert) {
        alertPanel.hidden = true;
        lastAlertedLocation = "";
        return;
    }

    const alertKey = `${nearbyAlert.city}-${nearbyAlert.event}-${rainDetected}`;
    alertPanel.hidden = false;
    alertPanel.classList.toggle("advisory", rainDetected === false);

    if (rainDetected === false) {
        alertPanel.innerHTML = `<strong>No rain at your exact location right now</strong><span>Regional advisory: heavy rainfall has been reported near ${nearbyAlert.city}. Stay alert while travelling in this area.</span>`;
    } else if (rainDetected === null) {
        alertPanel.innerHTML = `<strong>Regional weather advisory</strong><span>Heavy rainfall has been reported near ${nearbyAlert.city}, but exact current conditions could not be confirmed.</span>`;
    } else {
        alertPanel.innerHTML = `<strong>Heavy rain detected at your location</strong><span>${nearbyAlert.message} Event severity: ${nearbyAlert.severity}.</span>`;
    }

    if (rainDetected && lastAlertedLocation !== alertKey && "Notification" in window && Notification.permission === "granted") {
        new Notification(`WEATHERGUARD AI: ${nearbyAlert.event}`, {
            body: nearbyAlert.message
        });
    }

    lastAlertedLocation = alertKey;
}

function getWeatherSummary(current) {

    const weatherCode = current.weather_code;
    const temperature = current.temperature_2m;
    const isRain = current.rain > 0 || current.precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode);
    const isHeat = temperature >= 38 || current.apparent_temperature >= 40;
    let condition = "Clear skies";
    let category = "clear";

    if (isHeat) {
        condition = temperature >= 42 ? "Extreme heat" : "Hot conditions";
        category = "heat-detected";
    } else if (isRain) {
        condition = [95, 96, 99].includes(weatherCode) ? "Thunderstorm" : "Rain detected";
        category = "rain-detected";
    } else if ([45, 48].includes(weatherCode)) {
        condition = "Foggy conditions";
        category = "cloudy";
    } else if ([1, 2, 3].includes(weatherCode)) {
        condition = weatherCode === 1 ? "Mainly clear" : "Cloudy conditions";
        category = "cloudy";
    } else if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
        condition = "Cold conditions";
        category = "cold";
    }

    return {
        condition,
        category,
        isRain,
        isHeat
    };
}

async function loadLocalWeather(latitude, longitude) {

    const weatherStatus = document.getElementById("weatherStatus");

    weatherStatus.hidden = false;
    weatherStatus.textContent = "Checking current conditions at your location...";

    try {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code&timezone=auto`
        );

        if (!response.ok) {
            throw new Error("Weather request failed");
        }

        const data = await response.json();
        const current = data.current;
        const summary = getWeatherSummary(current);

        weatherStatus.innerHTML = `<strong>${summary.condition} at your location</strong><span>${current.temperature_2m}&deg;C &middot; ${current.precipitation} mm precipitation</span>`;
        weatherStatus.classList.remove("rain-detected", "heat-detected", "cloudy", "cold");
        weatherStatus.classList.add(summary.category);
        checkNearbyWeatherAlerts(latitude, longitude, summary.isRain);
    } catch (error) {
        weatherStatus.textContent = "Location added. Current weather is unavailable right now.";
        checkNearbyWeatherAlerts(latitude, longitude, null);
    }
}


// ===============================
// PAGE NAVIGATION
// ===============================

function showSection(sectionName) {

    if (!rolePermissions[currentRole].includes(sectionName)) {
        return;
    }

    const sections = document.querySelectorAll(".section");
    const targetSection = document.getElementById(sectionName);

    if (!targetSection) {
        return;
    }

    sections.forEach(section => {
        section.classList.remove("active-section");
    });

    targetSection.classList.add("active-section");


    const buttons = document.querySelectorAll(".nav-item");

    buttons.forEach(button => {
        button.classList.toggle(
            "active",
            button.getAttribute("onclick") === `showSection('${sectionName}')`
        );
    });


    const titles = {
        dashboard: "National Weather Intelligence",
        reports: "Citizen Weather Reports",
        map: "Interactive Weather Map",
        verification: "AI-Assisted Verification",
        alerts: "Weather Alerts"
    };

    document.getElementById("pageTitle").textContent =
        titles[sectionName];

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}

function showAllReports() {
    showSection("reports");
    document.getElementById("allReportsPanel").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// ===============================
// CITIZEN REPORT
// ===============================

document
    .getElementById("reportForm")
    .addEventListener("submit", function(event) {

        event.preventDefault();


        const eventType =
            document.getElementById("eventType").value;

        const severity =
            document.getElementById("severity").value;


        if (!eventType || !currentLocation) {

            alert("Please allow location access before submitting your report.");

            return;
        }


        const message =
            document.getElementById("successMessage");

        message.style.display = "block";


        // Add report to table

        const table =
            document.getElementById("eventTable");

        const allReportsTable =
            document.getElementById("allReportsTable");

        const row =
            document.createElement("tr");


        row.innerHTML = `
            <td>🌧️ ${eventType}</td>
            <td>${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}</td>
            <td>Just now</td>
            <td>Citizen</td>
            <td>
                <span class="badge pending">
                    Pending
                </span>
            </td>
        `;


        table.prepend(row);
        allReportsTable.prepend(row.cloneNode(true));

        document.querySelector(".report-count").textContent =
            `${allReportsTable.rows.length} reports`;


        // Update report count

        const reportCounter =
            document.getElementById("totalReports");

        const current =
            parseInt(
                reportCounter.textContent.replace(",", "")
            );

        reportCounter.textContent =
            (current + 1).toLocaleString();


        // Reset form

        document.getElementById("reportForm").reset();
        document.getElementById("location").value =
            `${currentLocation.latitude}, ${currentLocation.longitude}`;

});


// ===============================
// VERIFICATION
// ===============================

function verifyReport() {

    const result =
        document.getElementById("verificationResult");

    result.textContent =
        "✓ Event verified successfully.";

    result.style.color = "#16a34a";
    result.style.marginTop = "15px";
    result.style.fontWeight = "bold";
}


function rejectReport() {

    const result =
        document.getElementById("verificationResult");

    result.textContent =
        "✕ Event marked as rejected.";

    result.style.color = "#dc2626";
    result.style.marginTop = "15px";
    result.style.fontWeight = "bold";
}


// ===============================
// MAP EVENT
// ===============================

function showEvent(city) {

    alert(
        "Weather Event\n\n" +
        "Location: " + city +
        "\nEvent: Heavy Rainfall" +
        "\nReports: 27" +
        "\nStatus: Pending Verification" +
        "\nCredibility: 82/100"
    );
}


// ===============================
// MAP PLACE LOOKUP
// ===============================

const placesByState = {
    "Telangana": {
        "Hyderabad": [17.3850, 78.4867],
        "Warangal": [17.9784, 79.5941],
        "Nizamabad": [18.6725, 78.0941],
        "Karimnagar": [18.4386, 79.1288],
        "Khammam": [17.2473, 80.1514],
        "Nalgonda": [17.0575, 79.2684]
    },
    "Andhra Pradesh": {
        "Vijayawada": [16.5062, 80.6480],
        "Visakhapatnam": [17.6868, 83.2185],
        "Tirupati": [13.6288, 79.4192]
    },
    "Maharashtra": {
        "Mumbai": [19.0760, 72.8777],
        "Pune": [18.5204, 73.8567],
        "Nagpur": [21.1458, 79.0882]
    },
    "Delhi": {
        "New Delhi": [28.6139, 77.2090]
    },
    "Rajasthan": {
        "Jaipur": [26.9124, 75.7873],
        "Jodhpur": [26.2389, 73.0243],
        "Udaipur": [24.5854, 73.7125]
    }
};

const stateSelect = document.getElementById("stateSelect");
const placeSelect = document.getElementById("placeSelect");
const focusPlaceButton = document.getElementById("focusPlaceButton");

function updatePlaceOptions() {

    const places = Object.keys(placesByState[stateSelect.value]);

    placeSelect.innerHTML = places
        .map(place => `<option value="${place}">${place}</option>`)
        .join("");
}

async function focusSelectedPlace() {

    const state = stateSelect.value;
    const place = placeSelect.value;
    const [latitude, longitude] = placesByState[state][place];
    const map = document.querySelector(".india-map");
    const weatherPanel = document.getElementById("placeWeather");

    map.classList.toggle("map-zoomed", state === "Telangana");
    weatherPanel.hidden = false;
    weatherPanel.innerHTML = `<strong>${place}, ${state}</strong><span>Loading current weather...</span>`;

    try {
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,precipitation,rain,weather_code&timezone=auto`
        );

        if (!response.ok) {
            throw new Error("Weather request failed");
        }

        const data = await response.json();
        const current = data.current;
        const summary = getWeatherSummary(current);

        weatherPanel.innerHTML = `<strong>${place}, ${state}</strong><span>${summary.condition} &middot; ${current.temperature_2m}&deg;C &middot; ${current.precipitation} mm</span>`;
        weatherPanel.classList.remove("rain-detected", "heat-detected", "cloudy", "cold");
        weatherPanel.classList.add(summary.category);
    } catch (error) {
        weatherPanel.innerHTML = `<strong>${place}, ${state}</strong><span>Weather is unavailable right now.</span>`;
    }
}

stateSelect.addEventListener("change", function() {
    updatePlaceOptions();
    focusSelectedPlace();
});

placeSelect.addEventListener("change", focusSelectedPlace);
focusPlaceButton.addEventListener("click", focusSelectedPlace);
updatePlaceOptions();


// ===============================
// ALERT
// ===============================

function acknowledgeAlert() {

    if (currentRole === "citizen" || !rolePermissions[currentRole].includes("alerts")) {
        return;
    }

    const status =
        document.getElementById("alertStatus");

    const alertId = document.querySelector(".alert-card").dataset.alertId;
    saveAcknowledgedAlert(alertId);
    updateAlertAcknowledgement();

    status.innerHTML =
        `<div style="
            background:#ecfdf5;
            color:#15803d;
            padding:15px;
            margin-top:15px;
            border-radius:8px;
        ">
            ✓ Alert acknowledged by administrator.
        </div>`;
}


// ===============================
// CHARTS
// ===============================

const eventChart =
    document
        .getElementById("eventChart")
        .getContext("2d");


new Chart(eventChart, {

    type: "line",

    data: {

        labels: [
            "10 Sep",
            "11 Sep",
            "12 Sep",
            "13 Sep",
            "14 Sep",
            "15 Sep",
            "16 Sep"
        ],

        datasets: [{

            label: "Weather Reports",

            data: [
                120,
                165,
                140,
                220,
                180,
                260,
                310
            ],

            borderWidth: 3,

            tension: 0.4,

            fill: true

        }]

    },

    options: {

        responsive: true,

        plugins: {

            legend: {
                display: false
            }

        }

    }

});


// ===============================
// DISTRIBUTION CHART
// ===============================

const distribution =
    document
        .getElementById("distributionChart")
        .getContext("2d");


new Chart(distribution, {

    type: "doughnut",

    data: {

        labels: [
            "Rainfall",
            "Flood",
            "Thunderstorm",
            "Heatwave",
            "Other"
        ],

        datasets: [{

            data: [
                42,
                18,
                16,
                12,
                12
            ],

            borderWidth: 0

        }]

    },

    options: {

        responsive: true,

        plugins: {

            legend: {
                position: "bottom"
            }

        }

    }

});

updateLoginFields(currentRole);
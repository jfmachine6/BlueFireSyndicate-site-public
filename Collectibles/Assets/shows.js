export const SHOWS_ENDPOINT = "https://notion.bluefire-cards.workers.dev/shows";
const DEFAULT_TIME_ZONE = "America/New_York";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function attendance(status) {
    const value = status?.name?.trim().toLowerCase();
    if (["attending", "attending as buyers", "attending as vendors", "attending as sellers"].includes(value)) {
        return { className: "attending", label: status.name };
    }
    if (value === "not attending") {
        return { className: "not-attending", label: "Not attending" };
    }
    return {
        className: "unconfirmed",
        label: !value || value === "not started"
            ? "Attendance unconfirmed"
            : `Attendance unconfirmed (${status.name})`,
    };
}

function validDate(value) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return false;
    return !DATE_ONLY.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function validateFeed(data) {
    if (!data || !Array.isArray(data.shows)) throw new Error("The show feed is missing its shows array.");
    const ids = new Set();
    for (const show of data.shows) {
        if (!show || typeof show.id !== "string" || ids.has(show.id) ||
            typeof show.name !== "string" || !show.name.trim()) {
            throw new Error("The show feed contains an invalid show.");
        }
        ids.add(show.id);
        if (show.date !== null) {
            if (!show.date || !validDate(show.date.start) ||
                (show.date.end !== null && !validDate(show.date.end)) ||
                (show.date.timeZone !== null && typeof show.date.timeZone !== "string")) {
                throw new Error("The show feed contains an invalid date.");
            }
            // Verify any supplied IANA time zone before rendering.
            new Intl.DateTimeFormat("en-US", { timeZone: show.date.timeZone || DEFAULT_TIME_ZONE });
        }
        if (show.location !== null && (!show.location ||
            !["name", "address"].every((key) => show.location[key] === null || typeof show.location[key] === "string"))) {
            throw new Error("The show feed contains an invalid location.");
        }
        if (!Array.isArray(show.hosts) || show.hosts.some((host) => !host || typeof host.name !== "string") ||
            (show.status !== null && (!show.status || typeof show.status.name !== "string"))) {
            throw new Error("The show feed contains an invalid host or status.");
        }
    }
    return data.shows;
}

export function formatShowDate(date) {
    if (!date) return "Date to be announced";
    const format = (value) => {
        if (DATE_ONLY.test(value)) {
            return new Intl.DateTimeFormat("en-US", {
                dateStyle: "full", timeZone: "UTC",
            }).format(new Date(`${value}T12:00:00Z`));
        }
        return new Intl.DateTimeFormat("en-US", {
            weekday: "short", year: "numeric", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
            timeZone: date.timeZone || DEFAULT_TIME_ZONE,
        }).format(new Date(value));
    };
    return date.end && date.end !== date.start
        ? `${format(date.start)}\nthrough ${format(date.end)}`
        : format(date.start);
}

export function groupShows(shows, now = new Date()) {
    const groups = { upcoming: [], undated: [], past: [] };
    for (const show of shows) {
        if (!show.date) {
            groups.undated.push(show);
            continue;
        }
        const end = show.date.end || show.date.start;
        let past;
        if (DATE_ONLY.test(end)) {
            const today = new Intl.DateTimeFormat("en-CA", {
                timeZone: show.date.timeZone || DEFAULT_TIME_ZONE,
                year: "numeric", month: "2-digit", day: "2-digit",
            }).format(now);
            past = end < today;
        } else {
            past = Date.parse(end) < now.getTime();
        }
        groups[past ? "past" : "upcoming"].push(show);
    }
    const chronological = (a, b) => Date.parse(a.date.start) - Date.parse(b.date.start) || a.name.localeCompare(b.name);
    groups.upcoming.sort(chronological);
    groups.past.sort((a, b) => -chronological(a, b));
    groups.undated.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
}

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

export function calendarParts(date) {
    const value = date.start;
    const timeZone = DATE_ONLY.test(value) ? "UTC" : date.timeZone || DEFAULT_TIME_ZONE;
    const instant = new Date(DATE_ONLY.test(value) ? `${value}T12:00:00Z` : value);
    const month = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone }).format(instant);
    const day = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone }).format(instant);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(instant);
    return { month, day, weekday };
}

export function mapLocations(shows) {
    const locations = [];
    const radians = (degrees) => degrees * Math.PI / 180;
    const distance = (a, latitude, longitude) => {
        const squared = Math.sin(radians(latitude - a.latitude) / 2) ** 2 +
            Math.cos(radians(a.latitude)) * Math.cos(radians(latitude)) *
            Math.sin(radians(longitude - a.longitude) / 2) ** 2;
        return 12742000 * Math.asin(Math.sqrt(Math.min(1, squared)));
    };
    for (const show of shows) {
        const { latitude, longitude } = show.location || {};
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
            latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
        // Slightly different coordinates for the same venue otherwise hide overlapping pins.
        let location = locations.find((candidate) => distance(candidate, latitude, longitude) <= 100);
        if (!location) {
            location = { latitude, longitude, shows: [] };
            locations.push(location);
        }
        location.shows.push(show);
    }
    return locations;
}

function showCard(show) {
    const state = attendance(show.status);
    const card = element("article", undefined, `card show-card ${state.className}`);
    card.append(element("span", state.label, "show-status"), element("h3", show.name));
    const details = element("dl");
    const detail = (label, value) => details.append(element("dt", label), element("dd", value));
    detail("When", formatShowDate(show.date));
    const location = [show.location?.name, show.location?.address].filter(Boolean);
    const uniqueLocation = [...new Set(location)].join("\n");
    detail("Where", uniqueLocation || "Location to be announced");
    if (show.hosts.length) detail("Host", show.hosts.map((host) => host.name).join(", "));
    card.append(details);
    if (uniqueLocation) {
        const link = element("a", "View location on Google Maps", "show-map");
        link.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(uniqueLocation)}`;
        card.append(link);
    }
    return card;
}

function renderShows(container, shows) {
    const groups = groupShows(shows);
    const fragment = document.createDocumentFragment();
    for (const [key, title] of [
        ["upcoming", "Upcoming shows"], ["undated", "Dates to be announced"], ["past", "Past shows"],
    ]) {
        if (!groups[key].length) continue;
        const section = element("section", undefined, "show-section");
        const heading = element("h2", title);
        heading.id = `shows-${key}`;
        section.setAttribute("aria-labelledby", heading.id);
        section.append(heading);
        let month;
        let agenda;
        for (const show of groups[key]) {
            const parts = show.date ? calendarParts(show.date) : null;
            if (!agenda || month !== parts?.month) {
                month = parts?.month;
                if (month) section.append(element("h3", month, "agenda-month"));
                agenda = element("div", undefined, "show-agenda");
                section.append(agenda);
            }
            const row = element("div", undefined, "agenda-row");
            const stamp = element("div", undefined, "agenda-date");
            if (parts) {
                stamp.append(element("span", parts.weekday), element("strong", parts.day));
                stamp.setAttribute("aria-label", `${parts.month} ${parts.day}`);
            } else {
                stamp.textContent = "TBA";
            }
            row.append(stamp, showCard(show));
            agenda.append(row);
        }
        fragment.append(section);
    }
    container.replaceChildren(fragment);
}

let leafletPromise;
function loadLeaflet() {
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
        const css = element("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        css.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
        css.crossOrigin = "anonymous";
        const script = element("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
        script.crossOrigin = "anonymous";
        let loaded = 0;
        let settled = false;
        const timeout = setTimeout(() => fail(), 15000);
        function fail() {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            css.remove();
            script.remove();
            leafletPromise = null;
            reject(new Error("The map library could not load."));
        }
        function ready() {
            if (settled) return;
            loaded += 1;
            if (loaded === 2) {
                clearTimeout(timeout);
                if (!globalThis.L) return fail();
                settled = true;
                resolve(globalThis.L);
            }
        }
        css.onload = ready;
        script.onload = ready;
        css.onerror = fail;
        script.onerror = fail;
        document.head.append(css, script);
    });
    return leafletPromise;
}

export function initializeShows() {
    const container = document.getElementById("show-list");
    if (!container) return;
    const feedback = document.getElementById("show-feedback");
    const message = document.getElementById("show-message");
    const retry = document.getElementById("show-retry");
    const views = document.getElementById("show-views");
    const mapPanel = document.getElementById("show-map-panel");
    const mapMessage = document.getElementById("show-map-message");
    const mapRetry = document.getElementById("show-map-retry");
    let currentShows = [];
    let map;
    let mapLoading = false;
    async function openMap() {
        if (map) {
            map.invalidateSize();
            return;
        }
        if (mapLoading) return;
        const locations = mapLocations(currentShows);
        if (!locations.length) {
            mapMessage.textContent = "No shows have map coordinates yet. See Agenda for location details.";
            return;
        }
        mapLoading = true;
        mapRetry.hidden = true;
        mapMessage.textContent = "Loading map...";
        try {
            const L = await loadLeaflet();
            map = L.map("show-map");
            const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            }).addTo(map);
            tiles.on("tileerror", () => {
                mapMessage.textContent = "Some map tiles could not load. Show pins and Agenda details are still available.";
            });
            const bounds = [];
            for (const location of locations) {
                const states = location.shows.map((show) => attendance(show.status).className);
                const state = states.includes("attending") ? "attending"
                    : states.every((value) => value === "not-attending") ? "not-attending" : "unconfirmed";
                const popup = element("div", undefined, "show-popup");
                for (const show of location.shows) popup.append(showCard(show));
                const position = [location.latitude, location.longitude];
                L.marker(position, {
                    icon: L.divIcon({
                        className: `show-pin ${state}`,
                        html: '<span aria-hidden="true"></span>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12],
                    }),
                    title: location.shows.map((show) => show.name).join("; "),
                    riseOnHover: true,
                }).addTo(map).bindPopup(popup, {
                    maxWidth: Math.min(330, map.getSize().x - 60),
                    maxHeight: Math.min(300, map.getSize().y - 140),
                });
                bounds.push(position);
            }
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13, animate: false });
            const mapped = locations.reduce((count, location) => count + location.shows.length, 0);
            mapMessage.textContent = `${mapped} shows across ${locations.length} pins. ${currentShows.length - mapped} shows without valid coordinates are available in Agenda. Pins: blue includes attending; peach only not attending; gray unconfirmed.`;
        } catch (error) {
            console.error("Unable to load the show map.", error);
            if (map) map.remove();
            map = null;
            mapMessage.textContent = "The map is unavailable. Use Agenda for all show details, or retry the map.";
            mapRetry.hidden = false;
        } finally {
            mapLoading = false;
        }
    }
    for (const button of views.querySelectorAll("button")) {
        button.addEventListener("click", () => {
            const isMap = button.dataset.view === "map";
            container.hidden = isMap;
            mapPanel.hidden = !isMap;
            for (const other of views.querySelectorAll("button")) {
                const active = other === button;
                other.setAttribute("aria-pressed", String(active));
                other.classList.toggle("primary", active);
            }
            if (isMap) void openMap();
        });
    }
    mapRetry.addEventListener("click", openMap);
    async function load() {
        container.setAttribute("aria-busy", "true");
        feedback.hidden = false;
        retry.hidden = true;
        message.textContent = "Loading the Show List...";
        try {
            const response = await fetch(SHOWS_ENDPOINT, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`Show feed returned HTTP ${response.status}.`);
            const shows = validateFeed(await response.json());
            currentShows = shows;
            renderShows(container, shows);
            views.hidden = !shows.length;
            message.textContent = shows.length
                ? `${shows.length} ${shows.length === 1 ? "show" : "shows"} listed. Check each show's attendance status.`
                : "No shows are currently listed. Please check back later.";
        } catch (error) {
            console.error("Unable to load the BlueFire Collectibles™ Show List.", error);
            views.hidden = true;
            container.replaceChildren();
            message.textContent = "The Show List is temporarily unavailable. Please try again.";
            retry.hidden = false;
        } finally {
            container.setAttribute("aria-busy", "false");
        }
    }
    retry.addEventListener("click", load);
    void load();
}

if (typeof document !== "undefined") initializeShows();

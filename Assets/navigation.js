(() => {
    // Resolve from the script URL so navigation also works on GitHub Pages project paths.
    const siteRoot = new URL("../", document.currentScript.src);
    const siteUrl = (path) => new URL(path, siteRoot).href;

    class SiteNavigation extends HTMLElement {
        connectedCallback() {
            if (this.querySelector("nav")) return;

            const collectibles = this.getAttribute("branch") === "collectibles";
            const brand = collectibles ? "BlueFire Collectibles™" : "BlueFire Syndicate™";
            const home = collectibles ? "Collectibles/" : "";
            const links = collectibles
                ? [
                    ["Home", "Collectibles/"],
                    ["About", "Collectibles/about.html"],
                    ["Our People", "Collectibles/people.html"],
                    ["Show List", "Collectibles/shows.html"],
                    ["BlueFire", ""]
                ]
                : [
                    ["Home", ""],
                    ["BlueFire Collectibles™", "Collectibles/"],
                    ["BlueFire Games™", "https://bluefiregames.net"]
                ];

            const nav = document.createElement("nav");
            nav.className = "navbar";
            nav.setAttribute("aria-label", `${brand} navigation`);
            const inner = document.createElement("div");
            inner.className = "nav-inner";
            const logo = document.createElement("a");
            logo.className = "nav-brand";
            logo.href = siteUrl(home);
            const image = document.createElement("img");
            image.src = siteUrl("Assets/BlueFire_Logo_active.png");
            image.alt = "";
            image.className = "nav-logo-img";
            image.width = 38;
            image.height = 58;
            const name = document.createElement("span");
            name.textContent = brand;
            const subtitle = document.createElement("small");
            subtitle.textContent = collectibles ? "A BLUEFIRE SYNDICATE™ BRANCH" : "DEVELOPMENT / COMMERCE";
            name.append(subtitle);
            logo.append(image, name);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "nav-toggle";
            toggle.textContent = "Menu";
            const list = document.createElement("ul");
            list.className = "nav-links";
            list.id = collectibles ? "collectibles-nav-links" : "syndicate-nav-links";
            toggle.setAttribute("aria-controls", list.id);

            for (const [label, path] of links) {
                const item = document.createElement("li");
                const link = document.createElement("a");
                link.className = "nav-item";
                link.href = siteUrl(path);
                link.textContent = label;
                const target = new URL(link.href);
                const normalize = (pathname) => pathname.replace(/index\.html$/, "");
                if (target.origin === location.origin && !target.hash &&
                    normalize(target.pathname) === normalize(location.pathname)) {
                    link.setAttribute("aria-current", "page");
                }
                item.append(link);
                list.append(item);
            }

            const mobile = matchMedia("(max-width: 760px)");
            const setOpen = (open) => {
                list.hidden = mobile.matches && !open;
                toggle.setAttribute("aria-expanded", String(!list.hidden));
            };
            toggle.addEventListener("click", () => setOpen(list.hidden));
            list.addEventListener("click", (event) => {
                if (event.target.closest("a") && mobile.matches) setOpen(false);
            });
            nav.addEventListener("keydown", (event) => {
                if (event.key === "Escape" && mobile.matches && !list.hidden) {
                    setOpen(false);
                    toggle.focus();
                }
            });
            mobile.addEventListener("change", () => {
                const focusInList = list.contains(document.activeElement);
                setOpen(false);
                if (mobile.matches && focusInList) toggle.focus();
            });
            setOpen(false);
            inner.append(logo, toggle, list);
            nav.append(inner);
            this.replaceChildren(nav);
        }
    }

    customElements.define("site-navigation", SiteNavigation);
})();

"use strict";
const page = document.documentElement;
const codes = ["en", "ru", "et", "uk"];
const base = new URL(page.dataset.root, location.href);
const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
const langKey = "worktime-language";
const themeKey = "worktime-theme";
const theme = read(themeKey);
if (theme === "dark" || theme === "light") page.dataset.theme = theme;

const requested = new URLSearchParams(location.search).get("lang");
const defaultLanguage = (navigator.languages || [navigator.language]).map(l => l?.split("-")[0])
  .find(code => codes.includes(code)) || "en";
const pathLanguage = page.dataset.rootPage === "true" ? (read(langKey) || defaultLanguage) : page.lang;
const language = codes.includes(requested) ? requested : pathLanguage;
const pathFor = code => {
  const subpage = page.dataset.subpage;
  return new URL(subpage ? `${subpage}/${code}.html` : `${code}/`, base);
};
if (codes.includes(requested)) write(langKey, language);
if (codes.includes(language) && language !== page.lang) {
  const target = pathFor(language);
  target.hash = location.hash;
  location.replace(target.href);
}

document.addEventListener("DOMContentLoaded", () => {
  const prefs = document.querySelector("#site-language");
  if (prefs) {
    prefs.value = page.lang;
    prefs.addEventListener("change", () => {
      write(langKey, prefs.value);
      location.assign(pathFor(prefs.value).href);
    });
  }
  const themes = document.querySelector("#site-theme");
  if (themes) {
    themes.value = theme === "dark" || theme === "light" ? theme : "system";
    themes.addEventListener("change", () => {
      write(themeKey, themes.value);
      if (themes.value === "system") delete page.dataset.theme;
      else page.dataset.theme = themes.value;
    });
  }
  const status = document.querySelector("#site-status");
  const report = success => {
    if (status) status.textContent = status.dataset[success ? "copied" : "failed"];
  };
  const copy = async value => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(value);
      else {
        const field = document.createElement("textarea");
        field.value = value;
        field.readOnly = true;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        try { if (!document.execCommand("copy")) throw Error(); }
        finally { field.remove(); }
      }
      report(true);
    } catch (_) { report(false); }
  };
  document.querySelectorAll("[data-copy]").forEach(control => {
    control.addEventListener("click", () => copy(control.dataset.copy));
  });
  document.querySelector("[data-share]")?.addEventListener("click", async event => {
    const url = event.currentTarget.dataset.share;
    if (navigator.share) {
      try { await navigator.share({ title: page.dataset.name, url }); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
    await copy(url);
  });
  const dialog = document.querySelector("#gallery-dialog");
  if (dialog && typeof dialog.showModal === "function") {
    const enlarged = dialog.querySelector("img");
    document.querySelectorAll("[data-gallery]").forEach(link => link.addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      enlarged.src = link.href;
      enlarged.alt = link.dataset.gallery;
      dialog.querySelector("strong").textContent = enlarged.alt;
      dialog.showModal();
    }));
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  }
  const download = document.querySelector("[data-download]");
  if (download) {
    loadReleases();
    showDownloadCount(download);
  }
});

async function showDownloadCount(download) {
  const labels = {
    ru: "Всего скачиваний APK",
    et: "APK allalaadimisi kokku",
    en: "Total APK downloads",
    uk: "Усього завантажень APK",
  };
  const endpoint = new URL("https://api.github.com/repos/wolflingEE/work-time/releases");
  endpoint.searchParams.set("per_page", "100");
  let total = 0;
  let hasApk = false;
  try {
    for (let number = 1; ; number++) {
      endpoint.searchParams.set("page", number);
      const response = await fetch(endpoint, {credentials: "omit", referrerPolicy: "no-referrer"});
      if (!response.ok) return;
      for (const release of await response.json()) {
        if (release.draft || release.prerelease) continue;
        const apk = release.assets.find(asset => asset.name === "work-time.apk" && asset.state === "uploaded");
        if (!apk) continue;
        if (!Number.isSafeInteger(apk.download_count) || apk.download_count < 0) return;
        total += apk.download_count;
        if (!Number.isSafeInteger(total)) return;
        hasApk = true;
      }
      if (!/;\s*rel="next"/.test(response.headers.get("Link") || "")) break;
    }
    if (!hasApk) return;
    const count = document.createElement("p");
    count.className = "download-count";
    count.textContent = `${labels[page.lang]}: ${new Intl.NumberFormat(page.lang).format(total)}`;
    download.after(count);
  } catch (_) { /* The download link remains available when GitHub cannot supply a count. */ }
}

const formatDate = date => new Intl.DateTimeFormat(page.lang, {dateStyle: "medium", timeZone: "UTC"})
  .format(new Date(date + "T00:00:00Z"));
function addRelease(release) {
  const list = document.querySelector(".release-list");
  const article = document.createElement("article");
  article.className = "card";
  const title = document.createElement("h3");
  title.textContent = "v" + release.versionName;
  const date = document.createElement("time");
  date.dateTime = release.releaseDate;
  date.textContent = formatDate(release.releaseDate);
  const notes = document.createElement("ul");
  for (const line of release.changelog[page.lang]?.length ? release.changelog[page.lang] : release.changelog.en) {
    const item = document.createElement("li");
    item.textContent = line;
    notes.append(item);
  }
  article.append(title, date, notes);
  list.append(article);
}
async function loadReleases() {
  try {
    const response = await fetch(new URL("version.json", base), {cache: "no-cache"});
    if (!response.ok) throw Error();
    const release = await response.json();
    if (release.schemaVersion !== 1 || release.applicationId !== "com.worktime.local" ||
        release.latestDownloadUrl !== document.querySelector("[data-download]").href || !Number.isSafeInteger(release.apkSizeBytes) ||
        release.apkSizeBytes <= 0 || !Number.isInteger(release.minSdk) ||
        typeof release.versionName !== "string" || !release.changelog?.en?.length) throw Error();
    const values = {
      version: "v" + release.versionName,
      size: new Intl.NumberFormat(page.lang, {style: "unit", unit: "megabyte", maximumFractionDigits: 1})
        .format(release.apkSizeBytes / 1_000_000),
      android: release.minSdk === 29 ? "Android 10+" : "Android API " + release.minSdk + "+",
      date: formatDate(release.releaseDate)
    };
    Object.entries(values).forEach(([key, value]) => {
      document.querySelector(`[data-fact="${key}"]`).textContent = value;
    });
    document.querySelector(".build-facts").hidden = false;
    addRelease(release);
  } catch (_) {
    document.querySelector(".version-error").hidden = false;
    return;
  }
  try {
    const response = await fetch(new URL("history.json", base));
    if (response.ok) {
      const history = await response.json();
      for (const release of history) addRelease(release);
    }
  } catch (_) { /* The current release remains visible. */ }
}

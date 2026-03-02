

import { initWeather } from "./modules/weather/weather.js";
import { initFootball } from "./modules/football/football.js";
import { initBackground } from "./modules/background/background.js";
import { initGmail } from "./modules/gmail/gmail.js";
import { initSearchbar } from "./modules/searchbar/searchbar.js";
import { initQuicklinks } from "./modules/quicklinks/quicklinks.js";

initWeather(document.getElementById("module-weather"));
initFootball(document.getElementById("module-football"));
initBackground(document.getElementById("module-background"));
initGmail(document.getElementById("module-gmail"));
initSearchbar(document.getElementById("module-searchbar"));
initQuicklinks(document.getElementById("module-quicklinks"));




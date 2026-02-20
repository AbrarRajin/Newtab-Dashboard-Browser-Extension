

import { initWeather } from "./modules/weather/weather.js";
import { initFootball } from "./modules/football/football.js";
import { initBackground } from "./modules/background/background.js";



initWeather(document.getElementById("module-weather"));
initFootball(document.getElementById("module-football"));
initBackground(document.getElementById("module-background"));